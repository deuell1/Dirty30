import { createHash } from "node:crypto";

export type GeneratorTeam = { id: number; name: string };
export type GeneratorCourt = { id: number; name?: string };
export type GeneratorFormat = "SINGLE" | "DOUBLE";

export type GeneratorGame = {
  homeTeamId: number;
  awayTeamId: number;
  scheduledAt: string;
  courtId: number;
  date: string;
  time: string;
  round: number;
};

export type GeneratorExistingGame = {
  homeTeamId: number;
  awayTeamId: number;
  courtId: number;
  scheduledAt: string | Date;
  status?: string;
};

export type ScheduleGeneratorInput = {
  teams: GeneratorTeam[];
  format: GeneratorFormat;
  playDates: string[];
  timeSlots: string[];
  courts: GeneratorCourt[];
  maxMatchesPerTeamPerDate: 1 | 2;
  existingGames?: GeneratorExistingGame[];
  timeZone?: string;
  venueId?: number;
};

export type ScheduleGeneratorResult = {
  games: GeneratorGame[];
  byes: Array<{ round: number; teamId: number }>;
  gamesPerTeam: Record<string, number>;
  homeAway: Record<string, { home: number; away: number }>;
  playDatesUsed: string[];
  warnings: string[];
};

export function localDateInTimeZone(
  value: Date | string,
  timeZone = "America/Chicago",
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function scheduleGeneratorHash(
  input: ScheduleGeneratorInput,
  result: ScheduleGeneratorResult,
) {
  const canonical = {
    input: {
      format: input.format,
      venueId: input.venueId ?? null,
      teams: input.teams
        .map((team) => ({ id: team.id, name: team.name }))
        .sort((a, b) => a.id - b.id),
      playDates: [...input.playDates],
      timeSlots: [...input.timeSlots],
      courts: input.courts
        .map((court) => ({ id: court.id, name: court.name ?? null }))
        .sort((a, b) => a.id - b.id),
      maxMatchesPerTeamPerDate: input.maxMatchesPerTeamPerDate,
      timeZone: input.timeZone ?? "America/Chicago",
    },
    plan: {
      games: result.games,
      byes: result.byes,
      gamesPerTeam: result.gamesPerTeam,
      homeAway: result.homeAway,
      playDatesUsed: result.playDatesUsed,
      warnings: result.warnings,
    },
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export class ScheduleGeneratorError extends Error {
  readonly code: "INVALID_INPUT" | "CAPACITY" | "CONFLICT";
  readonly status: 409 | 422;
  constructor(
    message: string,
    code: ScheduleGeneratorError["code"] = "INVALID_INPUT",
  ) {
    super(message);
    this.name = "ScheduleGeneratorError";
    this.code = code;
    this.status = code === "INVALID_INPUT" ? 422 : 409;
  }
}

function localDateTimeToUtc(
  date: string,
  time: string,
  timeZone = "America/Chicago",
) {
  const base = Date.parse(`${date}T${time}:00.000Z`);
  if (!Number.isFinite(base))
    throw new ScheduleGeneratorError(
      `Invalid local date or time: ${date} ${time}`,
    );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(base));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const zonedAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  return new Date(base - (zonedAsUtc - base)).toISOString();
}

function overlaps(left: Date, right: Date) {
  return (
    right.getTime() < left.getTime() + 90 * 60_000 &&
    right.getTime() > left.getTime() - 90 * 60_000
  );
}

function pairingKey(home: number, away: number) {
  return [home, away].sort((a, b) => a - b).join(":");
}

/**
 * Deterministic circle-method scheduler. It receives already-authorized active
 * resources and dates so it remains pure and can be used by preview and commit.
 */
export function generateSchedule(
  input: ScheduleGeneratorInput,
): ScheduleGeneratorResult {
  const {
    teams,
    format,
    playDates,
    timeSlots,
    courts,
    maxMatchesPerTeamPerDate,
    existingGames = [],
    timeZone = "America/Chicago",
  } = input;
  if (teams.length < 2)
    throw new ScheduleGeneratorError("At least two active teams are required.");
  if (!playDates.length)
    throw new ScheduleGeneratorError(
      "At least one eligible play date is required.",
    );
  if (!timeSlots.length)
    throw new ScheduleGeneratorError("At least one time slot is required.");
  if (timeSlots.some((time) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))
    throw new ScheduleGeneratorError(
      "Time slots must use 24-hour HH:MM values from 00:00 through 23:59.",
    );
  if (!courts.length)
    throw new ScheduleGeneratorError("At least one active court is required.");
  if (maxMatchesPerTeamPerDate !== 1 && maxMatchesPerTeamPerDate !== 2)
    throw new ScheduleGeneratorError(
      "Maximum matches per team per date must be 1 or 2.",
    );

  const uniqueTeamIds = new Set(teams.map((team) => team.id));
  if (uniqueTeamIds.size !== teams.length)
    throw new ScheduleGeneratorError(
      "Active teams must have unique identifiers.",
    );
  if (new Set(courts.map((court) => court.id)).size !== courts.length)
    throw new ScheduleGeneratorError("Selected courts must be unique.");
  const uniqueDates = [...new Set(playDates)].sort();
  const uniqueSlots = [...new Set(timeSlots)].sort();
  const uniqueCourts = [
    ...new Map(courts.map((court) => [court.id, court])).values(),
  ];
  const slots = uniqueDates.flatMap((date) =>
    uniqueSlots.flatMap((time) =>
      uniqueCourts.map((court) => ({
        date,
        time,
        courtId: court.id,
        scheduledAt: localDateTimeToUtc(date, time, timeZone),
      })),
    ),
  );

  const rotation: Array<GeneratorTeam | null> = [...teams];
  if (rotation.length % 2) rotation.push(null);
  const rounds = rotation.length - 1;
  const pairings: Array<{ home: number; away: number; round: number }> = [];
  const byes: Array<{ round: number; teamId: number }> = [];
  const orientation = new Map<number, { home: number; away: number }>();
  for (const team of teams) orientation.set(team.id, { home: 0, away: 0 });
  const orientationScore = (home: number, away: number) => {
    const result = [...orientation.values()];
    const homeCounts = orientation.get(home)!;
    const awayCounts = orientation.get(away)!;
    homeCounts.home += 1;
    awayCounts.away += 1;
    const score = result.reduce(
      (total, counts) => total + Math.abs(counts.home - counts.away),
      0,
    );
    homeCounts.home -= 1;
    awayCounts.away -= 1;
    return score;
  };
  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      if (!first || !second) {
        const bye = first ?? second;
        if (bye) byes.push({ round: round + 1, teamId: bye.id });
        continue;
      }
      const firstScore = orientationScore(first.id, second.id);
      const secondScore = orientationScore(second.id, first.id);
      const firstHome =
        firstScore < secondScore
          ? true
          : secondScore < firstScore
            ? false
            : (round + index) % 2 === 0;
      const home = firstHome ? first.id : second.id;
      const away = firstHome ? second.id : first.id;
      orientation.get(home)!.home += 1;
      orientation.get(away)!.away += 1;
      pairings.push({
        home,
        away,
        round: round + 1,
      });
    }
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop()!);
    rotation.splice(0, rotation.length, fixed!, ...rest);
  }
  if (format === "DOUBLE") {
    pairings.push(
      ...pairings.map((pair) => ({
        home: pair.away,
        away: pair.home,
        round: pair.round + rounds,
      })),
    );
    byes.push(...byes.map((bye) => ({ ...bye, round: bye.round + rounds })));
  }

  const scheduled: GeneratorGame[] = [];
  const gamesByTeamDate = new Map<string, number>();
  const occupied = (teamId: number, date: string) =>
    gamesByTeamDate.get(`${teamId}:${date}`) ?? 0;
  const existing = existingGames.map((game) => ({
    ...game,
    scheduledAt: new Date(game.scheduledAt),
  }));
  const usedPairings = new Set<string>();
  for (const game of existing) {
    if (game.status === "CANCELLED") continue;
    const date = localDateInTimeZone(game.scheduledAt, timeZone);
    for (const teamId of [game.homeTeamId, game.awayTeamId])
      gamesByTeamDate.set(
        `${teamId}:${date}`,
        (gamesByTeamDate.get(`${teamId}:${date}`) ?? 0) + 1,
      );
  }

  for (const pairing of pairings) {
    const pairKey = pairingKey(pairing.home, pairing.away);
    if (format === "SINGLE" && usedPairings.has(pairKey))
      throw new ScheduleGeneratorError(
        `The generated schedule contains a duplicate matchup for pair ${pairKey}.`,
        "CONFLICT",
      );
    usedPairings.add(pairKey);
    const slot = slots.find((candidate) => {
      const at = new Date(candidate.scheduledAt);
      if (
        occupied(pairing.home, candidate.date) >= maxMatchesPerTeamPerDate ||
        occupied(pairing.away, candidate.date) >= maxMatchesPerTeamPerDate
      )
        return false;
      if (
        [...scheduled, ...existing].some(
          (game) =>
            (game.homeTeamId === pairing.home ||
              game.awayTeamId === pairing.home ||
              game.homeTeamId === pairing.away ||
              game.awayTeamId === pairing.away ||
              game.courtId === candidate.courtId) &&
            overlaps(at, new Date(game.scheduledAt)),
        )
      )
        return false;
      return true;
    });
    if (!slot) {
      const required = pairings.length;
      const available = slots.length;
      throw new ScheduleGeneratorError(
        `Insufficient schedule capacity: ${required} matches required but only ${available} court slots are available after existing-game and team constraints.`,
        "CAPACITY",
      );
    }
    const game: GeneratorGame = {
      homeTeamId: pairing.home,
      awayTeamId: pairing.away,
      scheduledAt: slot.scheduledAt,
      courtId: slot.courtId,
      date: slot.date,
      time: slot.time,
      round: pairing.round,
    };
    scheduled.push(game);
    gamesByTeamDate.set(
      `${pairing.home}:${slot.date}`,
      occupied(pairing.home, slot.date) + 1,
    );
    gamesByTeamDate.set(
      `${pairing.away}:${slot.date}`,
      occupied(pairing.away, slot.date) + 1,
    );
  }

  const gamesPerTeam: Record<string, number> = {};
  const homeAway: Record<string, { home: number; away: number }> = {};
  for (const team of teams) {
    gamesPerTeam[team.id] = 0;
    homeAway[team.id] = { home: 0, away: 0 };
  }
  for (const game of scheduled) {
    gamesPerTeam[game.homeTeamId] += 1;
    gamesPerTeam[game.awayTeamId] += 1;
    homeAway[game.homeTeamId].home += 1;
    homeAway[game.awayTeamId].away += 1;
  }
  return {
    games: scheduled,
    byes,
    gamesPerTeam,
    homeAway,
    playDatesUsed: [...new Set(scheduled.map((game) => game.date))],
    warnings: [],
  };
}
