import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import {
  CreateTeamBody,
  CreateTeamResponse,
  GetDashboardResponse,
  GetGameParams,
  GetGameResponse,
  GetLeagueInitializationStatusResponse,
  GetScoreReviewQueueResponse,
  GetStandingsResponse,
  GetTeamParams,
  GetTeamResponse,
  GetTeamRosterParams,
  GetTeamRosterResponse,
  InitializeLeagueBody,
  InitializeLeagueResponse,
  ListGamesQueryParams,
  ListGamesResponse,
  ListTeamsResponse,
  CommitScheduleGeneratorBody,
  CommitScheduleGeneratorResponse,
  CommitByeReconciliationBody,
  CommitByeReconciliationResponse,
  CreateTeamByeBody,
  CreateTeamByeResponse,
  DeleteTeamByeQueryParams,
  ListTeamByesQueryParams,
  ListTeamByesResponse,
  PreviewByeReconciliationResponse,
  PreviewScheduleGeneratorBody,
  PreviewScheduleGeneratorResponse,
  SubmitScoreBody,
  SubmitScoreParams,
  SubmitScoreResponse,
  UpdateTeamBody,
  UpdateTeamParams,
  UpdateTeamResponse,
} from "@workspace/api-zod";
import {
  auditEvents,
  courts,
  db,
  games,
  leagues,
  playerInvitations,
  seasons,
  teamMemberships,
  teams,
  teamByes,
  users,
  venues,
  type User,
} from "@workspace/db";
import {
  currentUser,
  requireActiveUser,
  requireCommissioner,
  resolveCurrentUser,
} from "../middlewares/auth";
import {
  lockRoster,
  MAX_ROSTER_POSITIONS,
  requireRosterSlot,
} from "../services/rosterCapacity";
import { normalizeUsPhone } from "../lib/phone";
import { canCommissionerDirectScore } from "../services/scorePolicy";
import {
  generateSchedule,
  localDateInTimeZone,
  scheduleGeneratorHash,
  type GeneratorExistingGame,
  type ScheduleGeneratorInput,
} from "../services/schedule-generator";

type ApiGame = {
  id: number;
  scheduleWeek: number | null;
  date: string;
  startTime: string;
  venue: string;
  court: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  venueId: number;
  courtId: number;
  status:
    "SCHEDULED" | "CANCELLED" | "FINAL" | "PENDING_CONFIRMATION" | "DISPUTED";
  published: boolean;
  homeScore: number | null;
  awayScore: number | null;
  scoreSubmittedByCurrentUser?: boolean;
  disputeReason?: string | null;
  canSubmitScore?: boolean;
  canConfirmOrDisputeScore?: boolean;
  canManageScore?: boolean;
};

const router: IRouter = Router();
router.use(resolveCurrentUser);
router.use((req, res, next) => {
  const pendingAllowed =
    (req.method === "GET" && req.path === "/me") ||
    (req.method === "POST" && /^\/invitations\/[^/]+\/accept$/.test(req.path));
  return pendingAllowed ? next() : requireActiveUser(req, res, next);
});
const awayTeams = alias(teams, "away_teams");

const scheduleInput = z.object({
  homeTeamId: z.number().int().positive(),
  awayTeamId: z.number().int().positive(),
  venueId: z.number().int().positive(),
  courtId: z.number().int().positive(),
  scheduledAt: z.string().datetime(),
});
const inviteInput = z.object({ phone: z.string().trim().min(1).max(40) });
const disputeInput = z.object({ reason: z.string().trim().min(3).max(1000) });
const profileInput = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});
const captainInput = z.object({ userId: z.number().int().positive() });
const venueInput = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(1000).default(""),
});
const courtInput = z.object({ name: z.string().trim().min(1).max(100) });
const accountAccessInput = z.object({
  accessState: z.enum(["ACTIVE", "DISABLED"]),
});
const LEAGUE_INITIALIZATION_LOCK = 30031;

class LeagueAlreadyInitializedError extends Error {
  constructor() {
    super("An active league and season already exist");
    this.name = "LeagueAlreadyInitializedError";
  }
}

async function activeLeagueAndSeason(database: typeof db = db) {
  const league = await database.query.leagues.findFirst({
    where: eq(leagues.active, true),
  });
  const season = league
    ? await database.query.seasons.findFirst({
        where: and(eq(seasons.leagueId, league.id), eq(seasons.active, true)),
      })
    : undefined;
  return { league, season };
}

function statusForGame(
  status: typeof games.$inferSelect.status,
): ApiGame["status"] {
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "FINAL") return "FINAL";
  if (status === "PENDING_CONFIRMATION") return "PENDING_CONFIRMATION";
  if (status === "DISPUTED") return "DISPUTED";
  return "SCHEDULED";
}
function timeParts(value: Date) {
  const date = value.toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  });
  const startTime = value.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
  return { date, startTime };
}
async function activeSeason(database: any = db) {
  const season = database.query
    ? await database.query.seasons.findFirst({
        where: eq(seasons.active, true),
      })
    : (
        await database
          .select()
          .from(seasons)
          .where(eq(seasons.active, true))
          .limit(1)
      )[0];
  if (!season) throw new Error("No active season configured");
  return season;
}
async function audit(
  actorUserId: number,
  entityType: string,
  entityId: number,
  action: string,
  beforeData?: unknown,
  afterData?: unknown,
) {
  const league = await db.query.leagues.findFirst({
    where: eq(leagues.active, true),
  });
  if (!league) throw new Error("No active league configured");
  await db.insert(auditEvents).values({
    leagueId: league.id,
    actorUserId,
    entityType,
    entityId,
    action,
    beforeData,
    afterData,
  });
}
async function teamList(viewer?: Pick<User, "id" | "role">) {
  const season = await activeSeason();
  const rows = await db
    .select()
    .from(teams)
    .where(eq(teams.seasonId, season.id))
    .orderBy(asc(teams.name));
  const memberships = rows.length
    ? await db
        .select()
        .from(teamMemberships)
        .where(
          and(
            inArray(
              teamMemberships.teamId,
              rows.map((item) => item.id),
            ),
            eq(teamMemberships.active, true),
          ),
        )
    : [];
  const memberUsers = memberships.length
    ? await db
        .select()
        .from(users)
        .where(
          inArray(
            users.id,
            memberships.map((item) => item.userId),
          ),
        )
    : [];
  const byUser = new Map(memberUsers.map((user) => [user.id, user]));
  return rows.map((team) => {
    const teamMembers = memberships.filter(
      (membership) => membership.teamId === team.id,
    );
    const captain = teamMembers.find(
      (membership) => membership.membershipRole === "CAPTAIN",
    );
    const person = captain ? byUser.get(captain.userId) : undefined;
    return {
      id: team.id,
      name: team.name,
      captainName: person
        ? `${person.firstName} ${person.lastName}`.trim()
        : "",
      playerCount: teamMembers.length,
      active: team.active,
      canManageRoster:
        viewer?.role === "COMMISSIONER" ||
        teamMembers.some(
          (membership) =>
            membership.userId === viewer?.id &&
            membership.membershipRole === "CAPTAIN",
        ),
    };
  });
}
async function apiGames(
  teamId?: number,
  date?: string,
  viewer?: Pick<User, "id" | "role">,
  database: any = db,
): Promise<ApiGame[]> {
  const season = await activeSeason(database);
  const rows: Array<{
    game: typeof games.$inferSelect;
    home: typeof teams.$inferSelect;
    away: typeof teams.$inferSelect;
    venue: typeof venues.$inferSelect;
    court: typeof courts.$inferSelect;
  }> = await database
    .select({
      game: games,
      home: teams,
      away: teams,
      venue: venues,
      court: courts,
    })
    .from(games)
    .innerJoin(teams, eq(games.homeTeamId, teams.id))
    .innerJoin(venues, eq(games.venueId, venues.id))
    .innerJoin(courts, eq(games.courtId, courts.id))
    .innerJoin(awayTeams, eq(games.awayTeamId, awayTeams.id))
    .where(eq(games.seasonId, season.id))
    .orderBy(asc(games.scheduledAt));
  // Drizzle aliases are verbose; hydrate away teams separately to keep this join portable.
  const allTeams: Array<typeof teams.$inferSelect> = await database
    .select()
    .from(teams)
    .where(eq(teams.seasonId, season.id));
  const byId = new Map(allTeams.map((team) => [team.id, team]));
  const captainMemberships: Array<typeof teamMemberships.$inferSelect> =
    viewer?.role === "COMMISSIONER"
      ? []
      : viewer
        ? await database
            .select()
            .from(teamMemberships)
            .where(
              and(
                eq(teamMemberships.userId, viewer.id),
                eq(teamMemberships.membershipRole, "CAPTAIN"),
                eq(teamMemberships.active, true),
              ),
            )
        : [];
  const captainTeamIds = new Set(
    captainMemberships.map((membership) => membership.teamId),
  );
  const submittingUserIds = rows
    .map(({ game }) => game.submittedByUserId)
    .filter((id): id is number => id !== null);
  const submitterMemberships: Array<typeof teamMemberships.$inferSelect> =
    submittingUserIds.length
      ? await database
          .select()
          .from(teamMemberships)
          .where(
            and(
              inArray(teamMemberships.userId, submittingUserIds),
              eq(teamMemberships.active, true),
            ),
          )
      : [];
  return rows
    .map(({ game, home, venue, court }) => {
      const parts = timeParts(game.scheduledAt);
      const isCommissioner = viewer?.role === "COMMISSIONER";
      const isCaptainForGame =
        captainTeamIds.has(game.homeTeamId) ||
        captainTeamIds.has(game.awayTeamId);
      const submittedByViewer = viewer
        ? game.submittedByUserId === viewer.id
        : undefined;
      const submitterTeamId = submitterMemberships.find(
        (membership) =>
          membership.userId === game.submittedByUserId &&
          (membership.teamId === game.homeTeamId ||
            membership.teamId === game.awayTeamId),
      )?.teamId;
      const opposingTeamId =
        submitterTeamId === game.homeTeamId
          ? game.awayTeamId
          : submitterTeamId === game.awayTeamId
            ? game.homeTeamId
            : undefined;
      const canOpposingCaptainReview =
        opposingTeamId !== undefined && captainTeamIds.has(opposingTeamId);
      return {
        id: game.id,
        scheduleWeek: game.scheduleWeek,
        ...parts,
        venue: venue.name,
        court: court.name,
        homeTeam: home.name,
        awayTeam: byId.get(game.awayTeamId)?.name ?? "Unknown",
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        venueId: game.venueId,
        courtId: game.courtId,
        status: statusForGame(game.status),
        published: game.status !== "DRAFT",
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        scoreSubmittedByCurrentUser: submittedByViewer,
        disputeReason: game.disputeReason,
        canSubmitScore:
          Boolean(isCommissioner || isCaptainForGame) &&
          game.status === "PUBLISHED",
        canConfirmOrDisputeScore:
          game.status === "PENDING_CONFIRMATION" &&
          Boolean(isCommissioner || canOpposingCaptainReview),
        canManageScore: Boolean(isCommissioner),
      };
    })
    .filter(
      (game) =>
        (!teamId || game.homeTeamId === teamId || game.awayTeamId === teamId) &&
        (!date || game.date === date),
    );
}
async function assertCaptainOrCommissioner(userId: number, teamIds: number[]) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.role === "COMMISSIONER") return;
  const membership = await db.query.teamMemberships.findFirst({
    where: and(
      inArray(teamMemberships.teamId, teamIds),
      eq(teamMemberships.userId, userId),
      eq(teamMemberships.membershipRole, "CAPTAIN"),
      eq(teamMemberships.active, true),
    ),
  });
  if (!membership)
    throw Object.assign(new Error("Captain access required"), { status: 403 });
}
async function assertOpposingCaptainOrCommissioner(
  userId: number,
  game: typeof games.$inferSelect,
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.role === "COMMISSIONER") return;
  if (!game.submittedByUserId)
    throw Object.assign(new Error("Score has no submitting captain"), {
      status: 409,
    });
  const submitter = await db.query.teamMemberships.findFirst({
    where: and(
      eq(teamMemberships.userId, game.submittedByUserId),
      eq(teamMemberships.active, true),
      inArray(teamMemberships.teamId, [game.homeTeamId, game.awayTeamId]),
    ),
  });
  if (!submitter)
    throw Object.assign(
      new Error("Score submitter is no longer a team captain"),
      { status: 409 },
    );
  const opposingTeamId =
    submitter.teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
  const opposingCaptain = await db.query.teamMemberships.findFirst({
    where: and(
      eq(teamMemberships.userId, userId),
      eq(teamMemberships.teamId, opposingTeamId),
      eq(teamMemberships.membershipRole, "CAPTAIN"),
      eq(teamMemberships.active, true),
    ),
  });
  if (!opposingCaptain)
    throw Object.assign(
      new Error(
        "Only the opposing team's captain can confirm or dispute this score",
      ),
      { status: 403 },
    );
}
type ScheduleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function validateGameInput(
  tx: ScheduleTransaction,
  input: z.infer<typeof scheduleInput>,
  excludeGameId?: number,
  scheduleWeek?: number | null,
) {
  const [seasonRows, leagueRows] = await Promise.all([
    tx.select().from(seasons).where(eq(seasons.active, true)).limit(1),
    tx.select().from(leagues).where(eq(leagues.active, true)).limit(1),
  ]);
  const season = seasonRows[0];
  const league = leagueRows[0];
  if (!season)
    throw Object.assign(new Error("No active season configured"), {
      status: 409,
    });
  if (!league)
    throw Object.assign(new Error("No active league configured"), {
      status: 409,
    });
  const startsAt = new Date(input.scheduledAt);
  if (Number.isNaN(startsAt.getTime()))
    throw Object.assign(
      new Error("Game time must be within the active season"),
      { status: 422 },
    );
  const localDate = localDateInTimeZone(startsAt);
  if (localDate < season.startDate || localDate > season.endDate)
    throw Object.assign(
      new Error("Game time must be within the active season"),
      { status: 422 },
    );
  if (input.homeTeamId === input.awayTeamId)
    throw Object.assign(new Error("A team cannot play itself"), {
      status: 422,
    });
  const [homeRows, awayRows, venueRows, courtRows] = await Promise.all([
    tx
      .select()
      .from(teams)
      .where(
        and(
          eq(teams.id, input.homeTeamId),
          eq(teams.seasonId, season.id),
          eq(teams.active, true),
        ),
      )
      .limit(1),
    tx
      .select()
      .from(teams)
      .where(
        and(
          eq(teams.id, input.awayTeamId),
          eq(teams.seasonId, season.id),
          eq(teams.active, true),
        ),
      )
      .limit(1),
    tx
      .select()
      .from(venues)
      .where(
        and(
          eq(venues.id, input.venueId),
          eq(venues.leagueId, league.id),
          eq(venues.active, true),
        ),
      )
      .limit(1),
    tx
      .select()
      .from(courts)
      .where(
        and(
          eq(courts.id, input.courtId),
          eq(courts.venueId, input.venueId),
          eq(courts.active, true),
        ),
      )
      .limit(1),
  ]);
  const [home, away, venue, court] = [
    homeRows[0],
    awayRows[0],
    venueRows[0],
    courtRows[0],
  ];
  if (!home || !away || !venue || !court)
    throw Object.assign(
      new Error("Teams, venue, and court must be active in the current league"),
      { status: 422 },
    );
  if (scheduleWeek !== null && scheduleWeek !== undefined) {
    const byeConflict = await tx
      .select({ id: teamByes.id })
      .from(teamByes)
      .where(
        and(
          eq(teamByes.seasonId, season.id),
          eq(teamByes.scheduleWeek, scheduleWeek),
          inArray(teamByes.teamId, [input.homeTeamId, input.awayTeamId]),
        ),
      )
      .limit(1);
    if (byeConflict.length)
      throw Object.assign(
        new Error("A team cannot have a game and bye in the same week"),
        { status: 409 },
      );
  }
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  const conflicting = await tx
    .select({ id: games.id })
    .from(games)
    .where(
      and(
        eq(games.seasonId, season.id),
        ne(games.status, "CANCELLED"),
        lt(games.scheduledAt, endsAt),
        gt(games.scheduledAt, new Date(startsAt.getTime() - 90 * 60_000)),
        excludeGameId ? ne(games.id, excludeGameId) : undefined,
        or(
          inArray(games.homeTeamId, [input.homeTeamId, input.awayTeamId]),
          inArray(games.awayTeamId, [input.homeTeamId, input.awayTeamId]),
          eq(games.courtId, input.courtId),
        ),
      ),
    );
  if (conflicting.length)
    throw Object.assign(
      new Error("A team or court is already scheduled during this game window"),
      { status: 409 },
    );
  return season;
}
async function withScheduleMutationLock<T>(
  operation: (tx: ScheduleTransaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(30030)`);
    return operation(tx);
  });
}

function generatorDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseGeneratorBody<T>(
  schema: { parse: (value: unknown) => T },
  body: unknown,
) {
  try {
    return schema.parse(body);
  } catch (error) {
    throw Object.assign(
      new Error(
        error instanceof Error ? error.message : "Invalid generator input",
      ),
      { status: 422 },
    );
  }
}

function eligibleGeneratorDates(
  firstPlayDate: Date,
  endDate: string,
  weekdays: number[],
) {
  const dates: string[] = [];
  const cursor = new Date(firstPlayDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const allowed = new Set(weekdays);
  while (generatorDate(cursor) <= endDate) {
    if (allowed.has(cursor.getUTCDay())) dates.push(generatorDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function generatorContext(
  database: Pick<ScheduleTransaction, "select">,
  input: {
    venueId: number;
    courtIds: number[];
    firstPlayDate: Date;
    weekdays: number[];
  },
) {
  const [league] = await database
    .select()
    .from(leagues)
    .where(eq(leagues.active, true))
    .limit(1);
  const season = league
    ? (
        await database
          .select()
          .from(seasons)
          .where(and(eq(seasons.leagueId, league.id), eq(seasons.active, true)))
          .limit(1)
      )[0]
    : undefined;
  if (!league || !season)
    throw Object.assign(new Error("No active league and season configured"), {
      status: 409,
    });
  const firstDate = generatorDate(input.firstPlayDate);
  if (firstDate < season.startDate || firstDate > season.endDate)
    throw Object.assign(
      new Error("First play date must be within the active season"),
      { status: 422 },
    );
  const activeTeams = await database
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(eq(teams.seasonId, season.id), eq(teams.active, true)))
    .orderBy(asc(teams.name), asc(teams.id));
  const [venue] = await database
    .select()
    .from(venues)
    .where(
      and(
        eq(venues.id, input.venueId),
        eq(venues.leagueId, league.id),
        eq(venues.active, true),
      ),
    )
    .limit(1);
  if (!venue)
    throw Object.assign(new Error("Selected venue must be active"), {
      status: 422,
    });
  if (new Set(input.courtIds).size !== input.courtIds.length)
    throw Object.assign(new Error("Selected courts must be unique"), {
      status: 422,
    });
  const activeCourts = await database
    .select({ id: courts.id, name: courts.name })
    .from(courts)
    .where(
      and(
        eq(courts.venueId, venue.id),
        eq(courts.active, true),
        inArray(courts.id, input.courtIds),
      ),
    )
    .orderBy(asc(courts.id));
  if (activeCourts.length !== input.courtIds.length)
    throw Object.assign(
      new Error("Every selected court must be active at the selected venue"),
      { status: 422 },
    );
  const existingGames = await database
    .select({
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      courtId: games.courtId,
      scheduledAt: games.scheduledAt,
      status: games.status,
    })
    .from(games)
    .where(and(eq(games.seasonId, season.id), ne(games.status, "CANCELLED")));
  const playDates = eligibleGeneratorDates(
    input.firstPlayDate,
    season.endDate,
    input.weekdays,
  );
  return {
    league,
    season,
    activeTeams,
    activeCourts,
    existingGames,
    playDates,
  };
}

function generatorInput(
  input: z.infer<typeof PreviewScheduleGeneratorBody>,
  context: Awaited<ReturnType<typeof generatorContext>>,
  existingGames: GeneratorExistingGame[] = context.existingGames,
) {
  return {
    teams: context.activeTeams,
    format: input.format,
    venueId: input.venueId,
    playDates: context.playDates,
    timeSlots: input.timeSlots,
    courts: context.activeCourts,
    maxMatchesPerTeamPerDate: input.maxMatchesPerTeamPerDate ?? 1,
    existingGames,
  } satisfies ScheduleGeneratorInput;
}

function generatorResponse(
  format: "SINGLE" | "DOUBLE",
  context: Awaited<ReturnType<typeof generatorContext>>,
  result: ReturnType<typeof generateSchedule>,
  previewHash: string,
) {
  return PreviewScheduleGeneratorResponse.parse({
    format,
    previewHash,
    teamCount: context.activeTeams.length,
    teamNames: context.activeTeams.map((team) => team.name),
    totalMatches: result.games.length,
    playDatesUsed: result.playDatesUsed,
    gamesPerTeam: result.gamesPerTeam,
    homeAway: result.homeAway,
    byes: result.byes,
    games: result.games,
    warnings: result.warnings,
  });
}

async function validateGeneratedByePlan(
  database: any,
  seasonId: number,
  generated: ReturnType<typeof generateSchedule>,
) {
  const existing = await database
    .select()
    .from(teamByes)
    .where(eq(teamByes.seasonId, seasonId));
  const plannedByes = new Map(
    generated.byes.map((bye) => [
      `${bye.teamId}:${bye.scheduleWeek}`,
      bye.playDate,
    ]),
  );
  for (const bye of existing) {
    const key = `${bye.teamId}:${bye.scheduleWeek}`;
    const plannedDate = plannedByes.get(key);
    const hasGame = generated.games.some(
      (game) =>
        game.scheduleWeek === bye.scheduleWeek &&
        (game.homeTeamId === bye.teamId || game.awayTeamId === bye.teamId),
    );
    if (plannedDate !== bye.playDate || hasGame)
      throw Object.assign(
        new Error(
          `Existing bye for team ${bye.teamId} conflicts with the generated schedule`,
        ),
        { status: 409 },
      );
  }
}

type ReconciliationWeek = {
  scheduleWeek: number;
  playDate: string;
  games: ApiGame[];
  byes: Array<{
    teamId: number;
    teamName: string;
    scheduleWeek: number;
    playDate: string;
  }>;
  blockers: string[];
};

function reconciliationPairingKey(left: number, right: number) {
  return [left, right].sort((a, b) => a - b).join(":");
}

function reconciliationPreview(
  seasonId: number,
  activeTeams: Array<{ id: number; name: string }>,
  allGames: ApiGame[],
  requestedFormat?: "SINGLE" | "DOUBLE",
  existingByes: Array<{
    teamId: number;
    scheduleWeek: number;
    playDate: string;
  }> = [],
) {
  const rotation: Array<number | null> = activeTeams.map((team) => team.id);
  if (rotation.length % 2) rotation.push(null);
  const rounds = rotation.length - 1;
  const expected: Array<{
    round: number;
    pair?: [number, number];
    bye?: number;
  }> = [];
  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const left = rotation[index];
      const right = rotation[rotation.length - 1 - index];
      if (left === null || right === null)
        expected.push({ round: round + 1, bye: left ?? right! });
      else expected.push({ round: round + 1, pair: [left, right] });
    }
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop()!);
    rotation.splice(0, rotation.length, fixed!, ...rest);
  }
  const pairCounts = new Map<string, number>();
  for (const game of allGames.filter((item) => item.status !== "CANCELLED")) {
    const key = reconciliationPairingKey(game.homeTeamId, game.awayTeamId);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const expectedPairCount = (activeTeams.length * (activeTeams.length - 1)) / 2;
  const expectedBaseKeys = new Set(
    expected
      .filter((entry) => entry.pair)
      .map((entry) => reconciliationPairingKey(entry.pair![0], entry.pair![1])),
  );
  const counts = [...pairCounts.values()];
  const detectedFormat =
    counts.length === expectedPairCount &&
    expectedBaseKeys.size === pairCounts.size &&
    [...expectedBaseKeys].every((key) => pairCounts.has(key)) &&
    counts.every((count) => count === 1)
      ? "SINGLE"
      : counts.length === expectedPairCount &&
          expectedBaseKeys.size === pairCounts.size &&
          [...expectedBaseKeys].every((key) => pairCounts.has(key)) &&
          counts.every((count) => count === 2)
        ? "DOUBLE"
        : null;
  const format = requestedFormat ?? detectedFormat ?? "SINGLE";
  if (format === "DOUBLE")
    expected.push(
      ...expected.map((entry) => ({
        ...entry,
        round: entry.round + rounds,
      })),
    );
  const pairRounds = new Map<string, number[]>();
  for (const entry of expected) {
    if (!entry.pair) continue;
    const key = reconciliationPairingKey(entry.pair[0], entry.pair[1]);
    pairRounds.set(key, [...(pairRounds.get(key) ?? []), entry.round]);
  }
  const expectedKeys = new Set(pairRounds.keys());
  const byPair = new Map<string, ApiGame[]>();
  for (const game of allGames.filter((item) => item.status !== "CANCELLED")) {
    const key = reconciliationPairingKey(game.homeTeamId, game.awayTeamId);
    byPair.set(key, [...(byPair.get(key) ?? []), game]);
  }
  const assigned = new Map<number, ApiGame[]>();
  const blockers = new Map<number, string[]>();
  const unknownPairs = [...byPair.keys()].filter(
    (key) => !expectedKeys.has(key),
  );
  if (unknownPairs.length)
    blockers.set(0, [`Unexpected matchup(s): ${unknownPairs.join(", ")}.`]);
  for (const [key, pairRoundsForKey] of pairRounds) {
    const games = [...(byPair.get(key) ?? [])].sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.id - right.id,
    );
    if (games.length !== pairRoundsForKey.length) {
      for (const round of pairRoundsForKey)
        blockers.set(round, [
          ...(blockers.get(round) ?? []),
          `Expected matchup ${key} is missing or duplicated.`,
        ]);
      continue;
    }
    const tiedDates =
      new Set(games.map((game) => game.date)).size !== games.length;
    games.forEach((game, index) => {
      const round = pairRoundsForKey[index];
      assigned.set(round, [...(assigned.get(round) ?? []), game]);
      if (game.scheduleWeek !== null && game.scheduleWeek !== round)
        blockers.set(round, [
          ...(blockers.get(round) ?? []),
          `Game ${game.id} has schedule week ${game.scheduleWeek}, expected ${round}.`,
        ]);
      if (tiedDates && pairRoundsForKey.length > 1)
        blockers.set(round, [
          ...(blockers.get(round) ?? []),
          `Matchup ${key} has tied play dates and cannot be assigned safely.`,
        ]);
    });
  }
  const names = new Map(activeTeams.map((team) => [team.id, team.name]));
  const weeks: ReconciliationWeek[] = [];
  for (
    let round = 1;
    round <= rounds * (format === "DOUBLE" ? 2 : 1);
    round += 1
  ) {
    const games = assigned.get(round) ?? [];
    const dates = [...new Set(games.map((game) => game.date))];
    const playDate = dates[0] ?? "";
    const weekBlockers = [...(blockers.get(round) ?? [])];
    if (!detectedFormat)
      weekBlockers.push(
        "Every active-team matchup must occur exactly once (SINGLE) or twice (DOUBLE).",
      );
    if (dates.length !== 1)
      weekBlockers.push(
        dates.length === 0
          ? "No games can be confidently assigned to this week."
          : "Games in this week span multiple play dates.",
      );
    const missing = expected
      .filter((entry) => entry.round === round && entry.bye !== undefined)
      .map((entry) => entry.bye!)
      .filter(
        (teamId) =>
          !games.some(
            (game) => game.homeTeamId === teamId || game.awayTeamId === teamId,
          ),
      );
    const byes =
      weekBlockers.length === 0 && missing.length === 1
        ? missing.map((teamId) => ({
            teamId,
            teamName: names.get(teamId) ?? `Team ${teamId}`,
            scheduleWeek: round,
            playDate,
          }))
        : [];
    for (const existing of existingByes.filter(
      (bye) => bye.scheduleWeek === round,
    )) {
      const inferred = byes.find((bye) => bye.teamId === existing.teamId);
      if (!inferred || inferred.playDate !== existing.playDate)
        weekBlockers.push(
          `Existing bye for team ${existing.teamId} does not match the inferred plan.`,
        );
    }
    if (missing.length > 1)
      weekBlockers.push("Multiple teams are missing from this week.");
    if (
      missing.length === 0 &&
      expected.some((entry) => entry.round === round && entry.bye)
    )
      weekBlockers.push(
        "No bye can be inferred because every team has a game.",
      );
    weeks.push({
      scheduleWeek: round,
      playDate,
      games,
      byes,
      blockers: weekBlockers,
    });
  }
  const validByeKeys = new Set(
    weeks.flatMap((week) =>
      week.byes.map((bye) => `${bye.teamId}:${bye.scheduleWeek}`),
    ),
  );
  for (const existing of existingByes) {
    if (!validByeKeys.has(`${existing.teamId}:${existing.scheduleWeek}`))
      weeks[0]?.blockers.push(
        `Existing bye for team ${existing.teamId} is not part of the inferred plan.`,
      );
  }
  const canonical = JSON.stringify({
    seasonId,
    weeks: weeks.map((week) => ({
      scheduleWeek: week.scheduleWeek,
      playDate: week.playDate,
      games: week.games.map((game) => ({
        id: game.id,
        scheduleWeek: game.scheduleWeek,
        date: game.date,
      })),
      byes: week.byes,
      blockers: week.blockers,
    })),
  });
  return {
    previewHash: createHash("sha256").update(canonical).digest("hex"),
    canCommit: weeks.every((week) => week.blockers.length === 0),
    detectedFormat,
    weeks,
  };
}

router.get(
  "/league-initialization",
  requireCommissioner,
  async (_req, res, next) => {
    try {
      const { league, season } = await activeLeagueAndSeason();
      res.json(
        GetLeagueInitializationStatusResponse.parse({
          requiresInitialization: !league || !season,
          hasActiveLeague: Boolean(league),
          hasActiveSeason: Boolean(season),
          leagueName: league?.name ?? null,
        }),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/league-initialization",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const input = InitializeLeagueBody.parse(req.body);
      if (input.endDate < input.startDate) {
        return res.status(422).json({
          error: "Season end date must be on or after its start date",
        });
      }
      const startDate = input.startDate.toISOString().slice(0, 10);
      const endDate = input.endDate.toISOString().slice(0, 10);
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${LEAGUE_INITIALIZATION_LOCK})`,
        );
        const existingLeague = await tx.query.leagues.findFirst({
          where: eq(leagues.active, true),
        });
        const existingSeason = existingLeague
          ? await tx.query.seasons.findFirst({
              where: and(
                eq(seasons.leagueId, existingLeague.id),
                eq(seasons.active, true),
              ),
            })
          : undefined;
        if (existingLeague && existingSeason) {
          throw new LeagueAlreadyInitializedError();
        }

        const league =
          existingLeague ??
          (
            await tx
              .insert(leagues)
              .values({ name: input.leagueName.trim(), active: true })
              .returning()
          )[0];
        if (!league) throw new Error("Failed to create the active league");

        const [season] = await tx
          .insert(seasons)
          .values({
            leagueId: league.id,
            name: input.seasonName.trim(),
            startDate,
            endDate,
            active: true,
          })
          .returning();
        if (!season) throw new Error("Failed to create the active season");

        return InitializeLeagueResponse.parse({
          leagueId: league.id,
          seasonId: season.id,
          leagueName: league.name,
          seasonName: season.name,
        });
      });
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof LeagueAlreadyInitializedError) {
        return res.status(409).json({ error: error.message });
      }
      return next(error);
    }
  },
);

router.get("/dashboard", async (_req, res, next) => {
  try {
    const user = currentUser(_req, res);
    const [season, league, allGames, allTeams] = await Promise.all([
      activeSeason(),
      db.query.leagues.findFirst({ where: eq(leagues.active, true) }),
      apiGames(undefined, undefined, user),
      teamList(),
    ]);
    const nextGame =
      allGames.find((game) => game.status === "SCHEDULED") ?? null;
    const viewerTeamIds =
      user.role === "COMMISSIONER"
        ? []
        : (
            await db
              .select({ teamId: teamMemberships.teamId })
              .from(teamMemberships)
              .where(
                and(
                  eq(teamMemberships.userId, user.id),
                  eq(teamMemberships.active, true),
                ),
              )
          ).map((membership) => membership.teamId);
    const visibleGames = allGames.filter(
      (game) =>
        game.status !== "CANCELLED" &&
        game.published &&
        (game.status === "SCHEDULED" ||
          game.status === "FINAL" ||
          game.status === "PENDING_CONFIRMATION" ||
          game.status === "DISPUTED"),
    );
    const byeRows = viewerTeamIds.length
      ? await db
          .select({ bye: teamByes, team: teams })
          .from(teamByes)
          .innerJoin(teams, eq(teamByes.teamId, teams.id))
          .where(
            and(
              eq(teamByes.seasonId, season.id),
              inArray(teamByes.teamId, viewerTeamIds),
            ),
          )
          .orderBy(asc(teamByes.playDate), asc(teamByes.scheduleWeek))
      : [];
    const nextBye =
      byeRows.find(({ bye }) => {
        if (bye.source !== "GENERATED") return true;
        return visibleGames.some(
          (game) => game.scheduleWeek === bye.scheduleWeek,
        );
      }) ?? null;
    const attentionItems = [
      ...allGames
        .filter((game) => game.status === "PENDING_CONFIRMATION")
        .map(() => "1 score awaiting confirmation"),
      ...(user.role === "COMMISSIONER"
        ? [
            `${allTeams.reduce((sum, team) => sum + Math.max(0, MAX_ROSTER_POSITIONS - team.playerCount), 0)} roster spots open across the league`,
          ]
        : []),
    ];
    res.json(
      GetDashboardResponse.parse({
        leagueName: league?.name ?? "Dirty 30",
        seasonName: season.name,
        role: user.role,
        nextGame,
        nextBye: nextBye
          ? {
              id: nextBye.bye.id,
              seasonId: nextBye.bye.seasonId,
              teamId: nextBye.bye.teamId,
              teamName: nextBye.team.name,
              scheduleWeek: nextBye.bye.scheduleWeek,
              playDate: nextBye.bye.playDate,
              source: nextBye.bye.source,
            }
          : null,
        attentionItems,
        recentResults: allGames.filter((game) => game.status === "FINAL"),
      }),
    );
  } catch (error) {
    next(error);
  }
});
router.get("/me", (req, res) => {
  const user = currentUser(req, res);
  res.json({
    id: user.id,
    email: user.email ?? undefined,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    accessState: user.accessState,
  });
});
router.patch("/me", async (req, res, next) => {
  try {
    const user = currentUser(req, res);
    const input = profileInput.parse(req.body);
    const [updated] = await db
      .update(users)
      .set(input)
      .where(eq(users.id, user.id))
      .returning();
    await audit(user.id, "user", user.id, "PROFILE_UPDATED", user, updated);
    return res.json({
      id: updated!.id,
      email: updated!.email ?? undefined,
      firstName: updated!.firstName,
      lastName: updated!.lastName,
      phone: updated!.phone,
      role: updated!.role,
    });
  } catch (error) {
    return next(error);
  }
});
router.patch(
  "/users/:userId/access",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const userId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.userId);
      const input = accountAccessInput.parse(req.body);
      const [updated] = await db
        .update(users)
        .set({
          accessState: input.accessState,
          active: input.accessState === "ACTIVE",
        })
        .where(eq(users.id, userId))
        .returning();
      if (!updated)
        return res.status(404).json({ error: "League account not found" });
      await audit(
        currentUser(req, res).id,
        "user",
        userId,
        input.accessState === "DISABLED"
          ? "ACCOUNT_DISABLED"
          : "ACCOUNT_RESTORED",
      );
      return res.json({ id: updated.id, accessState: updated.accessState });
    } catch (error) {
      return next(error);
    }
  },
);
router.get("/teams", async (req, res, next) => {
  try {
    res.json(ListTeamsResponse.parse(await teamList(currentUser(req, res))));
  } catch (error) {
    next(error);
  }
});
router.post("/teams", requireCommissioner, async (req, res, next) => {
  try {
    const input = CreateTeamBody.parse(req.body);
    const season = await activeSeason();
    const [team] = await db
      .insert(teams)
      .values({ seasonId: season.id, name: input.name })
      .returning();
    await audit(
      currentUser(req, res).id,
      "team",
      team!.id,
      "CREATED",
      undefined,
      team,
    );
    res
      .status(201)
      .json(
        CreateTeamResponse.parse(
          (await teamList()).find((item) => item.id === team!.id),
        ),
      );
  } catch (error) {
    next(error);
  }
});
router.get("/teams/:teamId", async (req, res, next) => {
  try {
    const { teamId } = GetTeamParams.parse(req.params);
    const team = (await teamList(currentUser(req, res))).find(
      (item) => item.id === teamId,
    );
    if (!team) return res.status(404).json({ error: "Team not found" });
    return res.json(GetTeamResponse.parse(team));
  } catch (error) {
    return next(error);
  }
});
router.patch("/teams/:teamId", requireCommissioner, async (req, res, next) => {
  try {
    const { teamId } = UpdateTeamParams.parse(req.params);
    const input = UpdateTeamBody.parse(req.body);
    const before = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!before) return res.status(404).json({ error: "Team not found" });
    await db.update(teams).set(input).where(eq(teams.id, teamId));
    const after = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    await audit(
      currentUser(req, res).id,
      "team",
      teamId,
      "UPDATED",
      before,
      after,
    );
    return res.json(
      UpdateTeamResponse.parse(
        (await teamList()).find((item) => item.id === teamId),
      ),
    );
  } catch (error) {
    return next(error);
  }
});
router.get("/teams/:teamId/roster", async (req, res, next) => {
  try {
    const { teamId } = GetTeamRosterParams.parse(req.params);
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) return res.status(404).json({ error: "Team not found" });
    const viewer = currentUser(req, res);
    const canViewPhone =
      viewer.role === "COMMISSIONER" ||
      Boolean(
        await db.query.teamMemberships.findFirst({
          where: and(
            eq(teamMemberships.teamId, teamId),
            eq(teamMemberships.userId, viewer.id),
            eq(teamMemberships.membershipRole, "CAPTAIN"),
            eq(teamMemberships.active, true),
          ),
        }),
      );
    const memberships = await db
      .select({ membership: teamMemberships, user: users })
      .from(teamMemberships)
      .innerJoin(users, eq(teamMemberships.userId, users.id))
      .where(
        and(
          eq(teamMemberships.teamId, teamId),
          eq(teamMemberships.active, true),
        ),
      );
    const pending = canViewPhone
      ? await db
          .select()
          .from(playerInvitations)
          .where(
            and(
              eq(playerInvitations.teamId, teamId),
              eq(playerInvitations.status, "PENDING"),
            ),
          )
      : [];
    return res.json(
      GetTeamRosterResponse.parse([
        ...memberships.map(({ user }) => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: canViewPhone ? user.phone : undefined,
          status: "ACTIVE",
        })),
        ...pending.map((invite) => ({
          id: -invite.id,
          firstName: "Invited",
          lastName: "Player",
          phone: invite.invitedPhone,
          status: "PENDING",
        })),
      ]),
    );
  } catch (error) {
    return next(error);
  }
});
router.patch(
  "/teams/:teamId/captain",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const teamId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.teamId);
      const { userId } = captainInput.parse(req.body);
      const actor = currentUser(req, res);
      const member = await db.query.teamMemberships.findFirst({
        where: and(
          eq(teamMemberships.teamId, teamId),
          eq(teamMemberships.userId, userId),
          eq(teamMemberships.active, true),
        ),
      });
      if (!member)
        return res
          .status(422)
          .json({ error: "Captain must be an active member of this team" });
      await db.transaction(async (tx) => {
        const oldCaptains = await tx
          .select()
          .from(teamMemberships)
          .where(
            and(
              eq(teamMemberships.teamId, teamId),
              eq(teamMemberships.membershipRole, "CAPTAIN"),
              eq(teamMemberships.active, true),
            ),
          );
        await tx
          .update(teamMemberships)
          .set({ membershipRole: "PLAYER" })
          .where(
            and(
              eq(teamMemberships.teamId, teamId),
              eq(teamMemberships.active, true),
            ),
          );
        await tx
          .update(teamMemberships)
          .set({ membershipRole: "CAPTAIN" })
          .where(eq(teamMemberships.id, member.id));
        for (const old of oldCaptains)
          await tx
            .update(users)
            .set({ role: "PLAYER" })
            .where(eq(users.id, old.userId));
        await tx
          .update(users)
          .set({ role: "CAPTAIN" })
          .where(eq(users.id, userId));
      });
      await audit(actor.id, "team", teamId, "CAPTAIN_REPLACED", undefined, {
        userId,
      });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  },
);
router.post("/teams/:teamId/invitations", async (req, res, next) => {
  try {
    const teamId = z.coerce.number().int().positive().parse(req.params.teamId);
    const input = inviteInput.parse(req.body);
    const invitedPhone = normalizeUsPhone(input.phone);
    const actor = currentUser(req, res);
    await assertCaptainOrCommissioner(actor.id, [teamId]);
    const token = randomBytes(24).toString("hex");
    const invite = await db.transaction(async (tx) =>
      lockRoster(tx, teamId, async () => {
        const existingPending = await tx.query.playerInvitations.findFirst({
          where: and(
            eq(playerInvitations.teamId, teamId),
            eq(playerInvitations.invitedPhone, invitedPhone),
            eq(playerInvitations.status, "PENDING"),
          ),
        });
        if (existingPending)
          throw Object.assign(
            new Error(
              "A pending invitation already exists for this phone number",
            ),
            { status: 409 },
          );
        await requireRosterSlot(tx, teamId);
        const [created] = await tx
          .insert(playerInvitations)
          .values({
            teamId,
            invitedPhone,
            invitedByUserId: actor.id,
            tokenHash: createHash("sha256").update(token).digest("hex"),
            expiresAt: new Date(Date.now() + 7 * 86400000),
          })
          .returning();
        return created!;
      }),
    );
    await audit(actor.id, "invitation", invite.id, "CREATED", undefined, {
      teamId,
      invitedPhone,
    });
    return res
      .status(201)
      .json({ id: invite.id, expiresAt: invite.expiresAt, token });
  } catch (error) {
    return next(error);
  }
});
router.post("/invitations/:token/accept", async (req, res, next) => {
  try {
    const token = z.string().min(20).parse(req.params.token);
    const actor = currentUser(req, res);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const accepted = await db.transaction(async (tx) => {
      const invitation = await tx.query.playerInvitations.findFirst({
        where: eq(playerInvitations.tokenHash, tokenHash),
      });
      if (
        !invitation ||
        invitation.status !== "PENDING" ||
        invitation.expiresAt <= new Date()
      )
        throw Object.assign(new Error("Invitation is invalid or expired"), {
          status: 410,
        });
      if (invitation.invitedPhone !== actor.phone)
        throw Object.assign(
          new Error(
            "This invitation belongs to a different verified phone number",
          ),
          { status: 403 },
        );
      return lockRoster(tx, invitation.teamId, async () => {
        const [updated] = await tx
          .update(playerInvitations)
          .set({ status: "ACCEPTED", acceptedAt: new Date() })
          .where(
            and(
              eq(playerInvitations.id, invitation.id),
              eq(playerInvitations.status, "PENDING"),
            ),
          )
          .returning();
        if (!updated)
          throw Object.assign(new Error("Invitation was already accepted"), {
            status: 409,
          });
        await requireRosterSlot(tx, invitation.teamId);
        const existing = await tx.query.teamMemberships.findFirst({
          where: and(
            eq(teamMemberships.teamId, invitation.teamId),
            eq(teamMemberships.userId, actor.id),
            eq(teamMemberships.active, true),
          ),
        });
        if (!existing)
          await tx.insert(teamMemberships).values({
            teamId: invitation.teamId,
            userId: actor.id,
            membershipRole: "PLAYER",
          });
        await tx
          .update(users)
          .set({ accessState: "ACTIVE", active: true })
          .where(eq(users.id, actor.id));
        return updated;
      });
    });
    await audit(actor.id, "invitation", accepted.id, "ACCEPTED", undefined, {
      userId: actor.id,
    });
    return res.json({ teamId: accepted.teamId });
  } catch (error) {
    return next(error);
  }
});
router.post(
  "/teams/:teamId/invitations/:invitationId/regenerate",
  async (req, res, next) => {
    try {
      const teamId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.teamId);
      const invitationId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.invitationId);
      const actor = currentUser(req, res);
      await assertCaptainOrCommissioner(actor.id, [teamId]);
      const token = randomBytes(24).toString("hex");
      const [updated] = await db
        .update(playerInvitations)
        .set({
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 7 * 86400000),
          status: "PENDING",
        })
        .where(
          and(
            eq(playerInvitations.id, invitationId),
            eq(playerInvitations.teamId, teamId),
            eq(playerInvitations.status, "PENDING"),
          ),
        )
        .returning();
      if (!updated)
        return res.status(404).json({ error: "Pending invitation not found" });
      await audit(actor.id, "invitation", invitationId, "REGENERATED");
      return res.json({
        id: invitationId,
        expiresAt: updated.expiresAt,
        token,
      });
    } catch (error) {
      return next(error);
    }
  },
);
router.delete(
  "/teams/:teamId/invitations/:invitationId",
  async (req, res, next) => {
    try {
      const teamId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.teamId);
      const invitationId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.invitationId);
      const actor = currentUser(req, res);
      await assertCaptainOrCommissioner(actor.id, [teamId]);
      const [updated] = await db
        .update(playerInvitations)
        .set({ status: "CANCELLED", cancelledAt: new Date() })
        .where(
          and(
            eq(playerInvitations.id, invitationId),
            eq(playerInvitations.teamId, teamId),
            eq(playerInvitations.status, "PENDING"),
          ),
        )
        .returning();
      if (!updated)
        return res.status(404).json({ error: "Pending invitation not found" });
      await audit(actor.id, "invitation", invitationId, "CANCELLED");
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  },
);
router.delete("/teams/:teamId/players/:userId", async (req, res, next) => {
  try {
    const teamId = z.coerce.number().int().positive().parse(req.params.teamId);
    const userId = z.coerce.number().int().positive().parse(req.params.userId);
    const actor = currentUser(req, res);
    await assertCaptainOrCommissioner(actor.id, [teamId]);
    const target = await db.query.teamMemberships.findFirst({
      where: and(
        eq(teamMemberships.teamId, teamId),
        eq(teamMemberships.userId, userId),
        eq(teamMemberships.active, true),
      ),
    });
    if (!target)
      return res.status(404).json({ error: "Active player not found" });
    if (target.membershipRole === "CAPTAIN" && actor.role !== "COMMISSIONER")
      return res
        .status(403)
        .json({ error: "Only a commissioner can remove a captain" });
    await db
      .update(teamMemberships)
      .set({ active: false, removedAt: new Date(), membershipRole: "PLAYER" })
      .where(eq(teamMemberships.id, target.id));
    await db
      .update(users)
      .set({ role: "PLAYER" })
      .where(and(eq(users.id, userId), eq(users.role, "CAPTAIN")));
    await audit(actor.id, "membership", target.id, "REMOVED", target);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
router.patch(
  "/teams/:teamId/active",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const teamId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.teamId);
      const active = z.boolean().parse(req.body.active);
      const [updated] = await db
        .update(teams)
        .set({ active })
        .where(eq(teams.id, teamId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Team not found" });
      await audit(
        currentUser(req, res).id,
        "team",
        teamId,
        active ? "ACTIVATED" : "DEACTIVATED",
        undefined,
        updated,
      );
      const response = (await teamList()).find(
        (item) => item.id === updated.id,
      );
      return res.json(response);
    } catch (error) {
      return next(error);
    }
  },
);
router.get("/venues", requireCommissioner, async (_req, res, next) => {
  try {
    const league = await db.query.leagues.findFirst({
      where: eq(leagues.active, true),
    });
    res.json(
      league
        ? await db
            .select()
            .from(venues)
            .where(eq(venues.leagueId, league.id))
            .orderBy(asc(venues.name))
        : [],
    );
  } catch (error) {
    next(error);
  }
});
router.post("/venues", requireCommissioner, async (req, res, next) => {
  try {
    const input = venueInput.parse(req.body);
    const league = await db.query.leagues.findFirst({
      where: eq(leagues.active, true),
    });
    if (!league)
      return res.status(409).json({ error: "No active league configured" });
    const [venue] = await db
      .insert(venues)
      .values({ ...input, leagueId: league.id })
      .returning();
    await audit(
      currentUser(req, res).id,
      "venue",
      venue!.id,
      "CREATED",
      undefined,
      venue,
    );
    return res.status(201).json(venue);
  } catch (error) {
    return next(error);
  }
});
router.patch(
  "/venues/:venueId",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const venueId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.venueId);
      const input = venueInput
        .partial()
        .extend({ active: z.boolean().optional() })
        .parse(req.body);
      const [venue] = await db
        .update(venues)
        .set(input)
        .where(eq(venues.id, venueId))
        .returning();
      if (!venue) return res.status(404).json({ error: "Venue not found" });
      await audit(
        currentUser(req, res).id,
        "venue",
        venueId,
        "UPDATED",
        undefined,
        venue,
      );
      return res.json(venue);
    } catch (error) {
      return next(error);
    }
  },
);
router.get(
  "/venues/:venueId/courts",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const venueId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.venueId);
      res.json(
        await db
          .select()
          .from(courts)
          .where(eq(courts.venueId, venueId))
          .orderBy(asc(courts.name)),
      );
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/venues/:venueId/courts",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const venueId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.venueId);
      const input = courtInput.parse(req.body);
      const [court] = await db
        .insert(courts)
        .values({ ...input, venueId })
        .returning();
      await audit(
        currentUser(req, res).id,
        "court",
        court!.id,
        "CREATED",
        undefined,
        court,
      );
      return res.status(201).json(court);
    } catch (error) {
      return next(error);
    }
  },
);
router.patch(
  "/courts/:courtId",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const courtId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.courtId);
      const input = courtInput
        .partial()
        .extend({ active: z.boolean().optional() })
        .parse(req.body);
      const [court] = await db
        .update(courts)
        .set(input)
        .where(eq(courts.id, courtId))
        .returning();
      if (!court) return res.status(404).json({ error: "Court not found" });
      await audit(
        currentUser(req, res).id,
        "court",
        courtId,
        "UPDATED",
        undefined,
        court,
      );
      return res.json(court);
    } catch (error) {
      return next(error);
    }
  },
);
router.get("/schedule", async (req, res, next) => {
  try {
    const filters = ListGamesQueryParams.parse(req.query);
    const user = currentUser(req, res);
    const all = await apiGames(filters.teamId, filters.date, user);
    res.json(
      ListGamesResponse.parse(
        user.role === "COMMISSIONER"
          ? all
          : all.filter((game) => game.published),
      ),
    );
  } catch (error) {
    next(error);
  }
});
router.get("/schedule/byes", async (req, res, next) => {
  try {
    const filters = ListTeamByesQueryParams.parse(req.query);
    const user = currentUser(req, res);
    const season = await activeSeason();
    const rows = await db
      .select({ bye: teamByes, team: teams })
      .from(teamByes)
      .innerJoin(teams, eq(teamByes.teamId, teams.id))
      .where(
        and(
          eq(teamByes.seasonId, season.id),
          filters.teamId ? eq(teamByes.teamId, filters.teamId) : undefined,
          filters.scheduleWeek
            ? eq(teamByes.scheduleWeek, filters.scheduleWeek)
            : undefined,
        ),
      )
      .orderBy(asc(teamByes.scheduleWeek), asc(teamByes.playDate));
    const activeGames = await db
      .select()
      .from(games)
      .where(and(eq(games.seasonId, season.id), ne(games.status, "CANCELLED")));
    const visible = rows.filter(({ bye }) => {
      if (user.role === "COMMISSIONER" || bye.source !== "GENERATED")
        return true;
      return activeGames.some(
        (game) =>
          game.scheduleWeek === bye.scheduleWeek &&
          (game.status === "PUBLISHED" ||
            game.status === "FINAL" ||
            game.status === "PENDING_CONFIRMATION" ||
            game.status === "DISPUTED"),
      );
    });
    return res.json(
      ListTeamByesResponse.parse(
        visible.map(({ bye, team }) => ({
          id: bye.id,
          seasonId: bye.seasonId,
          teamId: bye.teamId,
          teamName: team.name,
          scheduleWeek: bye.scheduleWeek,
          playDate: bye.playDate,
          source: bye.source,
        })),
      ),
    );
  } catch (error) {
    return next(error);
  }
});
router.post("/schedule/byes", requireCommissioner, async (req, res, next) => {
  try {
    const input = CreateTeamByeBody.parse(req.body);
    const actor = currentUser(req, res);
    const result = await withScheduleMutationLock(async (tx) => {
      const [season] = await tx
        .select()
        .from(seasons)
        .where(eq(seasons.active, true))
        .limit(1);
      if (!season)
        throw Object.assign(new Error("No active season configured"), {
          status: 409,
        });
      const [team] = await tx
        .select()
        .from(teams)
        .where(
          and(
            eq(teams.id, input.teamId),
            eq(teams.seasonId, season.id),
            eq(teams.active, true),
          ),
        )
        .limit(1);
      if (!team)
        throw Object.assign(
          new Error("Team must be active in the current season"),
          {
            status: 422,
          },
        );
      const [conflict] = await tx
        .select({ id: games.id })
        .from(games)
        .where(
          and(
            eq(games.seasonId, season.id),
            ne(games.status, "CANCELLED"),
            eq(games.scheduleWeek, input.scheduleWeek),
            or(
              eq(games.homeTeamId, input.teamId),
              eq(games.awayTeamId, input.teamId),
            ),
          ),
        )
        .limit(1);
      if (conflict)
        throw Object.assign(new Error("Team already has a game in this week"), {
          status: 409,
        });
      const [existing] = await tx
        .select()
        .from(teamByes)
        .where(
          and(
            eq(teamByes.seasonId, season.id),
            eq(teamByes.teamId, input.teamId),
            eq(teamByes.scheduleWeek, input.scheduleWeek),
          ),
        )
        .limit(1);
      if (existing) {
        if (
          existing.source === "MANUAL" &&
          existing.playDate === input.playDate
        )
          return { bye: existing, team, noOp: true };
        throw Object.assign(
          new Error("A bye already exists for this team and week"),
          { status: 409 },
        );
      }
      const [bye] = await tx
        .insert(teamByes)
        .values({
          seasonId: season.id,
          teamId: input.teamId,
          scheduleWeek: input.scheduleWeek,
          playDate: input.playDate,
          source: "MANUAL",
          createdByUserId: actor.id,
        })
        .returning();
      if (!bye) throw new Error("Failed to create bye");
      await tx.insert(auditEvents).values({
        leagueId: season.leagueId,
        actorUserId: actor.id,
        entityType: "team_bye",
        entityId: bye.id,
        action: "BYE_CREATED",
        afterData: bye,
      });
      return { bye, team, noOp: false };
    });
    return res.status(result.noOp ? 200 : 201).json(
      CreateTeamByeResponse.parse({
        ...result.bye,
        teamName: result.team.name,
      }),
    );
  } catch (error) {
    return next(error);
  }
});
router.delete("/schedule/byes", requireCommissioner, async (req, res, next) => {
  try {
    const { teamId, scheduleWeek } = DeleteTeamByeQueryParams.parse(req.query);
    const actor = currentUser(req, res);
    await withScheduleMutationLock(async (tx) => {
      const [season] = await tx
        .select()
        .from(seasons)
        .where(eq(seasons.active, true))
        .limit(1);
      if (!season)
        throw Object.assign(new Error("No active season configured"), {
          status: 409,
        });
      const [bye] = await tx
        .select()
        .from(teamByes)
        .where(
          and(
            eq(teamByes.seasonId, season.id),
            eq(teamByes.teamId, teamId),
            eq(teamByes.scheduleWeek, scheduleWeek),
          ),
        )
        .limit(1);
      if (!bye) return;
      if (bye.source === "GENERATED")
        throw Object.assign(new Error("Generated byes cannot be removed"), {
          status: 409,
        });
      await tx.delete(teamByes).where(eq(teamByes.id, bye.id));
      await tx.insert(auditEvents).values({
        leagueId: season.leagueId,
        actorUserId: actor.id,
        entityType: "team_bye",
        entityId: bye.id,
        action: "BYE_REMOVED",
        beforeData: bye,
      });
    });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});
router.post(
  "/schedule/byes/reconcile/preview",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const user = currentUser(req, res);
      const season = await activeSeason();
      const activeTeams = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(and(eq(teams.seasonId, season.id), eq(teams.active, true)))
        .orderBy(asc(teams.id));
      const result = reconciliationPreview(
        season.id,
        activeTeams,
        await apiGames(undefined, undefined, user),
        undefined,
        await db
          .select({
            teamId: teamByes.teamId,
            scheduleWeek: teamByes.scheduleWeek,
            playDate: teamByes.playDate,
          })
          .from(teamByes)
          .where(eq(teamByes.seasonId, season.id)),
      );
      return res.json(PreviewByeReconciliationResponse.parse(result));
    } catch (error) {
      return next(error);
    }
  },
);
router.post(
  "/schedule/byes/reconcile/commit",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const input = CommitByeReconciliationBody.parse(req.body);
      const actor = currentUser(req, res);
      const result = await withScheduleMutationLock(async (tx) => {
        const [season] = await tx
          .select()
          .from(seasons)
          .where(eq(seasons.active, true))
          .limit(1);
        if (!season)
          throw Object.assign(new Error("No active season configured"), {
            status: 409,
          });
        const [prior] = await tx
          .select()
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.entityType, "schedule"),
              eq(auditEvents.entityId, season.id),
              eq(auditEvents.action, "BYE_RECONCILED"),
            ),
          )
          .limit(1);
        if (
          prior?.afterData &&
          typeof prior.afterData === "object" &&
          "previewHash" in prior.afterData &&
          prior.afterData.previewHash === input.previewHash
        )
          return { updatedGames: 0, createdByes: 0, noOp: true };
        const activeTeams = await tx
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(and(eq(teams.seasonId, season.id), eq(teams.active, true)))
          .orderBy(asc(teams.id));
        const currentGames = await apiGames(undefined, undefined, actor, tx);
        const currentByes = await tx
          .select({
            teamId: teamByes.teamId,
            scheduleWeek: teamByes.scheduleWeek,
            playDate: teamByes.playDate,
          })
          .from(teamByes)
          .where(eq(teamByes.seasonId, season.id));
        const analysis = reconciliationPreview(
          season.id,
          activeTeams,
          currentGames,
          undefined,
          currentByes,
        );
        if (analysis.previewHash !== input.previewHash)
          throw Object.assign(
            new Error("Schedule changed since reconciliation preview"),
            { status: 409 },
          );
        if (!analysis.canCommit)
          throw Object.assign(
            new Error(
              analysis.weeks.flatMap((week) => week.blockers).join("; ") ||
                "Reconciliation is blocked",
            ),
            { status: 409 },
          );
        let updatedGames = 0;
        let createdByes = 0;
        for (const week of analysis.weeks) {
          for (const game of week.games) {
            if (game.scheduleWeek === null) {
              await tx
                .update(games)
                .set({ scheduleWeek: week.scheduleWeek })
                .where(eq(games.id, game.id));
              updatedGames += 1;
            } else if (game.scheduleWeek !== week.scheduleWeek) {
              throw Object.assign(
                new Error(`Game ${game.id} has a conflicting schedule week`),
                { status: 409 },
              );
            }
          }
          for (const bye of week.byes) {
            const [existing] = await tx
              .select()
              .from(teamByes)
              .where(
                and(
                  eq(teamByes.seasonId, season.id),
                  eq(teamByes.teamId, bye.teamId),
                  eq(teamByes.scheduleWeek, bye.scheduleWeek),
                ),
              )
              .limit(1);
            if (existing) continue;
            await tx.insert(teamByes).values({
              seasonId: season.id,
              teamId: bye.teamId,
              scheduleWeek: bye.scheduleWeek,
              playDate: bye.playDate,
              source: "RECONCILED",
              createdByUserId: actor.id,
            });
            createdByes += 1;
          }
        }
        await tx.insert(auditEvents).values({
          leagueId: season.leagueId,
          actorUserId: actor.id,
          entityType: "schedule",
          entityId: season.id,
          action: "BYE_RECONCILED",
          afterData: {
            previewHash: input.previewHash,
            updatedGames,
            createdByes,
          },
        });
        return { updatedGames, createdByes, noOp: false };
      });
      return res.json(CommitByeReconciliationResponse.parse(result));
    } catch (error) {
      return next(error);
    }
  },
);
router.post(
  "/schedule/generator/preview",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const input = parseGeneratorBody(PreviewScheduleGeneratorBody, req.body);
      const context = await generatorContext(db, input);
      const result = generateSchedule(
        generatorInput(input, context, context.existingGames),
      );
      await validateGeneratedByePlan(db, context.season.id, result);
      const previewHash = scheduleGeneratorHash(
        generatorInput(input, context, context.existingGames),
        result,
      );
      return res.json(
        generatorResponse(input.format, context, result, previewHash),
      );
    } catch (error) {
      return next(error);
    }
  },
);
router.post(
  "/schedule/generator/commit",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const input = parseGeneratorBody(CommitScheduleGeneratorBody, req.body);
      const actor = currentUser(req, res);
      const committed = await withScheduleMutationLock(async (tx) => {
        const context = await generatorContext(tx, input);
        const priorBatches = await tx
          .select()
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.leagueId, context.league.id),
              eq(auditEvents.entityType, "schedule"),
              eq(auditEvents.entityId, context.season.id),
              eq(auditEvents.action, "BATCH_CREATED"),
            ),
          );
        if (
          priorBatches.some(
            (batch) =>
              batch.afterData &&
              typeof batch.afterData === "object" &&
              "previewHash" in batch.afterData &&
              batch.afterData.previewHash === input.previewHash,
          )
        )
          return { createdCount: 0, noOp: true };
        const generated = generateSchedule(
          generatorInput(input, context, context.existingGames),
        );
        await validateGeneratedByePlan(tx, context.season.id, generated);
        const previewHash = scheduleGeneratorHash(
          generatorInput(input, context, context.existingGames),
          generated,
        );
        if (previewHash !== input.previewHash)
          throw Object.assign(
            new Error("Schedule changed since preview; preview again"),
            { status: 409 },
          );
        const created = [];
        for (const planned of generated.games) {
          const schedule = {
            homeTeamId: planned.homeTeamId,
            awayTeamId: planned.awayTeamId,
            venueId: input.venueId,
            courtId: planned.courtId,
            scheduledAt: planned.scheduledAt,
          };
          const season = await validateGameInput(tx, schedule);
          const draftValues = {
            ...schedule,
            seasonId: season.id,
            scheduledAt: new Date(schedule.scheduledAt),
            scheduleWeek: planned.scheduleWeek,
            status: "DRAFT",
          } satisfies typeof games.$inferInsert;
          const [game] = await tx.insert(games).values(draftValues).returning();
          if (!game) throw new Error("Failed to create generated game");
          created.push(game);
        }
        for (const bye of generated.byes) {
          const [conflict] = await tx
            .select({ id: games.id })
            .from(games)
            .where(
              and(
                eq(games.seasonId, context.season.id),
                ne(games.status, "CANCELLED"),
                eq(games.scheduleWeek, bye.scheduleWeek),
                or(
                  eq(games.homeTeamId, bye.teamId),
                  eq(games.awayTeamId, bye.teamId),
                ),
              ),
            )
            .limit(1);
          if (conflict)
            throw Object.assign(
              new Error("A team cannot have a game and bye in the same week"),
              { status: 409 },
            );
          const [existingBye] = await tx
            .select()
            .from(teamByes)
            .where(
              and(
                eq(teamByes.seasonId, context.season.id),
                eq(teamByes.teamId, bye.teamId),
                eq(teamByes.scheduleWeek, bye.scheduleWeek),
              ),
            )
            .limit(1);
          if (existingBye) {
            if (existingBye.playDate !== bye.playDate)
              throw Object.assign(
                new Error("Existing bye has a conflicting play date"),
                { status: 409 },
              );
            continue;
          }
          await tx.insert(teamByes).values({
            seasonId: context.season.id,
            teamId: bye.teamId,
            scheduleWeek: bye.scheduleWeek,
            playDate: bye.playDate,
            source: "GENERATED",
            createdByUserId: actor.id,
          });
        }
        await tx.insert(auditEvents).values({
          leagueId: context.league.id,
          actorUserId: actor.id,
          entityType: "schedule",
          entityId: context.season.id,
          action: "BATCH_CREATED",
          afterData: {
            createdCount: created.length,
            format: input.format,
            playDatesUsed: generated.playDatesUsed,
            previewHash,
          },
        });
        return { createdCount: created.length, noOp: false };
      });
      return res.status(committed.noOp ? 200 : 201).json(
        CommitScheduleGeneratorResponse.parse({
          createdCount: committed.createdCount,
          noOp: committed.noOp,
        }),
      );
    } catch (error) {
      return next(error);
    }
  },
);
router.get("/schedule/:gameId", async (req, res, next) => {
  try {
    const { gameId } = GetGameParams.parse(req.params);
    const user = currentUser(req, res);
    const game = (await apiGames(undefined, undefined, user)).find(
      (item) => item.id === gameId,
    );
    if (!game || (!game.published && user.role !== "COMMISSIONER"))
      return res.status(404).json({ error: "Game not found" });
    return res.json(GetGameResponse.parse(game));
  } catch (error) {
    return next(error);
  }
});
router.post("/schedule", requireCommissioner, async (req, res, next) => {
  try {
    const input = scheduleInput.parse(req.body);
    const game = await withScheduleMutationLock(async (tx) => {
      const season = await validateGameInput(tx, input);
      return (
        await tx
          .insert(games)
          .values({
            ...input,
            seasonId: season.id,
            scheduledAt: new Date(input.scheduledAt),
            status: "DRAFT",
          })
          .returning()
      )[0]!;
    });
    await audit(
      currentUser(req, res).id,
      "game",
      game.id,
      "CREATED",
      undefined,
      game,
    );
    const response = (await apiGames()).find((item) => item.id === game.id);
    return res.status(201).json(GetGameResponse.parse(response));
  } catch (error) {
    return next(error);
  }
});
router.patch(
  "/schedule/:gameId",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const gameId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.gameId);
      const input = scheduleInput.parse(req.body);
      const result = await withScheduleMutationLock(async (tx) => {
        const before = (
          await tx.select().from(games).where(eq(games.id, gameId)).limit(1)
        )[0];
        if (
          !before ||
          (before.status !== "DRAFT" && before.status !== "PUBLISHED")
        )
          throw Object.assign(
            new Error("Only draft or published games can be edited"),
            { status: 409 },
          );
        await validateGameInput(tx, input, gameId, before.scheduleWeek);
        const [game] = await tx
          .update(games)
          .set({ ...input, scheduledAt: new Date(input.scheduledAt) })
          .where(eq(games.id, gameId))
          .returning();
        return { before, game: game! };
      });
      await audit(
        currentUser(req, res).id,
        "game",
        gameId,
        "UPDATED",
        result.before,
        result.game,
      );
      const response = (await apiGames()).find(
        (item) => item.id === result.game.id,
      );
      return res.json(GetGameResponse.parse(response));
    } catch (error) {
      return next(error);
    }
  },
);
router.post(
  "/schedule/:gameId/publish",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const gameId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.gameId);
      const [game] = await db
        .update(games)
        .set({ status: "PUBLISHED" })
        .where(and(eq(games.id, gameId), eq(games.status, "DRAFT")))
        .returning();
      if (!game)
        return res
          .status(409)
          .json({ error: "Only draft games can be published" });
      await audit(currentUser(req, res).id, "game", gameId, "PUBLISHED");
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  },
);
router.post(
  "/schedule/:gameId/cancel",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const gameId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.gameId);
      const [game] = await db
        .update(games)
        .set({ status: "CANCELLED" })
        .where(and(eq(games.id, gameId), ne(games.status, "FINAL")))
        .returning();
      if (!game)
        return res
          .status(409)
          .json({ error: "Final or missing games cannot be cancelled" });
      await audit(currentUser(req, res).id, "game", gameId, "CANCELLED");
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  },
);
router.get("/standings", async (_req, res, next) => {
  try {
    const rows = (await teamList())
      .filter((team) => team.active)
      .map((team) => ({
        teamName: team.name,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        differential: 0,
      }));
    const map = new Map(rows.map((row) => [row.teamName, row]));
    for (const game of await apiGames()) {
      if (
        game.status !== "FINAL" ||
        game.homeScore === null ||
        game.awayScore === null
      )
        continue;
      const home = map.get(game.homeTeam);
      const away = map.get(game.awayTeam);
      if (!home || !away) continue;
      home.played++;
      away.played++;
      home.pointsFor += game.homeScore;
      home.pointsAgainst += game.awayScore;
      away.pointsFor += game.awayScore;
      away.pointsAgainst += game.homeScore;
      if (game.homeScore > game.awayScore) {
        home.wins++;
        away.losses++;
      } else if (game.awayScore > game.homeScore) {
        away.wins++;
        home.losses++;
      }
    }
    res.json(
      GetStandingsResponse.parse(
        rows
          .map((row) => ({
            ...row,
            differential: row.pointsFor - row.pointsAgainst,
          }))
          .sort(
            (a, b) =>
              b.wins - a.wins ||
              b.differential - a.differential ||
              b.pointsFor - a.pointsFor,
          )
          .map((row, index) => ({ rank: index + 1, ...row })),
      ),
    );
  } catch (error) {
    next(error);
  }
});
router.post("/scores/:gameId", async (req, res, next) => {
  try {
    const { gameId } = SubmitScoreParams.parse(req.params);
    const input = SubmitScoreBody.parse(req.body);
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });
    if (!game) return res.status(404).json({ error: "Game not found" });
    if (game.status !== "PUBLISHED")
      return res.status(409).json({
        error: "Only published, unsubmitted games can receive a score",
      });
    const actor = currentUser(req, res);
    await assertCaptainOrCommissioner(actor.id, [
      game.homeTeamId,
      game.awayTeamId,
    ]);
    const [updated] = await db
      .update(games)
      .set({
        ...input,
        status: "PENDING_CONFIRMATION",
        submittedByUserId: actor.id,
        submittedAt: new Date(),
      })
      .where(and(eq(games.id, gameId), eq(games.status, "PUBLISHED")))
      .returning();
    if (!updated)
      return res
        .status(409)
        .json({ error: "This score was updated by another user" });
    await audit(actor.id, "game", gameId, "SCORE_SUBMITTED", game, updated);
    return res.json(
      SubmitScoreResponse.parse({
        gameId,
        homeScore: updated.homeScore!,
        awayScore: updated.awayScore!,
        status: "PENDING_CONFIRMATION",
      }),
    );
  } catch (error) {
    return next(error);
  }
});
router.get("/scores/review", requireCommissioner, async (req, res, next) => {
  try {
    res.json(
      GetScoreReviewQueueResponse.parse(
        (await apiGames(undefined, undefined, currentUser(req, res))).filter(
          (game) =>
            game.status === "PENDING_CONFIRMATION" ||
            game.status === "DISPUTED",
        ),
      ),
    );
  } catch (error) {
    next(error);
  }
});
router.post("/scores/:gameId/confirm", async (req, res, next) => {
  try {
    const gameId = z.coerce.number().int().positive().parse(req.params.gameId);
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });
    if (!game || game.status !== "PENDING_CONFIRMATION")
      return res.status(409).json({ error: "This score cannot be confirmed" });
    const actor = currentUser(req, res);
    await assertOpposingCaptainOrCommissioner(actor.id, game);
    const [updated] = await db
      .update(games)
      .set({
        status: "FINAL",
        confirmedByUserId: actor.id,
        confirmedAt: new Date(),
      })
      .where(
        and(eq(games.id, gameId), eq(games.status, "PENDING_CONFIRMATION")),
      )
      .returning();
    if (!updated)
      return res
        .status(409)
        .json({ error: "This score was updated by another user" });
    await audit(actor.id, "game", gameId, "SCORE_CONFIRMED", game, updated);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
router.post("/scores/:gameId/dispute", async (req, res, next) => {
  try {
    const gameId = z.coerce.number().int().positive().parse(req.params.gameId);
    const input = disputeInput.parse(req.body);
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });
    if (!game) return res.status(404).json({ error: "Game not found" });
    if (game.status !== "PENDING_CONFIRMATION")
      return res
        .status(409)
        .json({ error: "Only submitted scores can be disputed" });
    const actor = currentUser(req, res);
    await assertOpposingCaptainOrCommissioner(actor.id, game);
    const [updated] = await db
      .update(games)
      .set({
        status: "DISPUTED",
        disputeReason: input.reason,
        disputedByUserId: actor.id,
        disputedAt: new Date(),
      })
      .where(
        and(eq(games.id, gameId), eq(games.status, "PENDING_CONFIRMATION")),
      )
      .returning();
    if (!updated)
      return res
        .status(409)
        .json({ error: "This score was updated by another user" });
    await audit(actor.id, "game", gameId, "SCORE_DISPUTED", game, updated);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
router.post(
  "/scores/:gameId/resolve",
  requireCommissioner,
  async (req, res, next) => {
    try {
      const gameId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.gameId);
      const input = SubmitScoreBody.parse(req.body);
      const game = await db.query.games.findFirst({
        where: eq(games.id, gameId),
      });
      if (!game || game.status !== "DISPUTED")
        return res
          .status(409)
          .json({ error: "Only disputed scores can be resolved" });
      const actor = currentUser(req, res);
      await db
        .update(games)
        .set({
          ...input,
          status: "FINAL",
          resolvedByUserId: actor.id,
          resolvedAt: new Date(),
        })
        .where(eq(games.id, gameId));
      await audit(actor.id, "game", gameId, "SCORE_RESOLVED", game, input);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  },
);
router.patch("/scores/:gameId", requireCommissioner, async (req, res, next) => {
  try {
    const gameId = z.coerce.number().int().positive().parse(req.params.gameId);
    const input = SubmitScoreBody.parse(req.body);
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });
    if (!game) return res.status(404).json({ error: "Game not found" });
    if (!canCommissionerDirectScore(game.status))
      return res.status(409).json({
        error:
          "Only published games or final-score corrections can use direct score entry",
      });
    const actor = currentUser(req, res);
    await db
      .update(games)
      .set({
        ...input,
        status: "FINAL",
        resolvedByUserId: actor.id,
        resolvedAt: new Date(),
      })
      .where(eq(games.id, gameId));
    await audit(
      actor.id,
      "game",
      gameId,
      game.status === "FINAL"
        ? "SCORE_CORRECTED"
        : "COMMISSIONER_SCORE_ENTERED",
      game,
      input,
    );
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
export default router;
