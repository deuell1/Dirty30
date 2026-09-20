import { createHash } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, pool } from "./index";
import {
  auditEvents,
  courts,
  games,
  leagues,
  playerInvitations,
  scheduleWeeks,
  seasons,
  teamByes,
  teamMemberships,
  teams,
  users,
  venues,
} from "./schema";

const DEVELOPMENT_LEAGUE_NAME = "Dirty 30 Development League";
const LEGACY_SEED_LEAGUE_NAMES = [
  DEVELOPMENT_LEAGUE_NAME,
  "Dirty 30 Beer League",
] as const;
const DEVELOPMENT_INVITE_TOKEN = "seed-player-invite-token";

function requireDevelopment() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "Development seed refused: run with NODE_ENV=development. Production seeding is disabled.",
    );
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function resetSeedFixture(tx: Transaction) {
  const seedUsers = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.externalAuthId} LIKE 'seed_%'`);
  const seedUserIds = seedUsers.map((user) => user.id);

  const seedLeagues = await tx
    .select({ id: leagues.id })
    .from(leagues)
    .where(
      or(...LEGACY_SEED_LEAGUE_NAMES.map((name) => eq(leagues.name, name))),
    );
  const seedLeagueIds = seedLeagues.map((league) => league.id);
  const seedSeasonIds = seedLeagueIds.length
    ? (
        await tx
          .select({ id: seasons.id })
          .from(seasons)
          .where(inArray(seasons.leagueId, seedLeagueIds))
      ).map((season) => season.id)
    : [];
  const seedTeamIds = seedSeasonIds.length
    ? (
        await tx
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.seasonId, seedSeasonIds))
      ).map((team) => team.id)
    : [];

  if (seedLeagueIds.length) {
    await tx
      .delete(auditEvents)
      .where(inArray(auditEvents.leagueId, seedLeagueIds));
  }
  if (seedTeamIds.length) {
    await tx
      .delete(playerInvitations)
      .where(inArray(playerInvitations.teamId, seedTeamIds));
    await tx
      .delete(teamMemberships)
      .where(inArray(teamMemberships.teamId, seedTeamIds));
  }
  if (seedUserIds.length) {
    await tx
      .delete(playerInvitations)
      .where(inArray(playerInvitations.invitedByUserId, seedUserIds));
    await tx
      .delete(teamMemberships)
      .where(inArray(teamMemberships.userId, seedUserIds));
    await tx
      .delete(auditEvents)
      .where(inArray(auditEvents.actorUserId, seedUserIds));
  }
  if (seedSeasonIds.length) {
    await tx.delete(games).where(inArray(games.seasonId, seedSeasonIds));
    await tx.delete(teamByes).where(inArray(teamByes.seasonId, seedSeasonIds));
    await tx
      .delete(scheduleWeeks)
      .where(inArray(scheduleWeeks.seasonId, seedSeasonIds));
  }
  if (seedTeamIds.length) {
    await tx.delete(teams).where(inArray(teams.id, seedTeamIds));
  }
  if (seedLeagueIds.length) {
    await tx.delete(courts).where(
      inArray(
        courts.venueId,
        (
          await tx
            .select({ id: venues.id })
            .from(venues)
            .where(inArray(venues.leagueId, seedLeagueIds))
        ).map((venue) => venue.id),
      ),
    );
    await tx.delete(venues).where(inArray(venues.leagueId, seedLeagueIds));
    await tx.delete(seasons).where(inArray(seasons.id, seedSeasonIds));
    await tx.delete(leagues).where(inArray(leagues.id, seedLeagueIds));
  }
  if (seedUserIds.length) {
    await tx.delete(users).where(inArray(users.id, seedUserIds));
  }
}

async function insertUser(
  tx: Transaction,
  values: {
    externalAuthId: string;
    phone: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "COMMISSIONER" | "CAPTAIN" | "PLAYER";
  },
) {
  const [user] = await tx
    .insert(users)
    .values({ ...values, accessState: "ACTIVE" })
    .returning();
  return user!;
}

async function seed() {
  requireDevelopment();

  const result = await db.transaction(async (tx) => {
    await resetSeedFixture(tx);

    const [league] = await tx
      .insert(leagues)
      .values({ name: DEVELOPMENT_LEAGUE_NAME })
      .returning();
    const [season] = await tx
      .insert(seasons)
      .values({
        leagueId: league!.id,
        name: "Summer 2026",
        startDate: "2026-06-01",
        endDate: "2026-07-19",
      })
      .returning();
    const commissioner = await insertUser(tx, {
      externalAuthId: "seed_commissioner",
      phone: "+12025550100",
      email: "commissioner@dirty30.local",
      firstName: "Jordan",
      lastName: "Miles",
      role: "COMMISSIONER",
    });

    const [venue] = await tx
      .insert(venues)
      .values({
        leagueId: league!.id,
        name: "Lakeside Sports Center",
        address: "Chicago, IL",
      })
      .returning();
    const seededCourts = await tx
      .insert(courts)
      .values([
        { venueId: venue!.id, name: "Court 1" },
        { venueId: venue!.id, name: "Court 2" },
      ])
      .returning();

    const teamNames = [
      "Hops & Dreams",
      "Pitch Please",
      "Ale Stars",
      "The Keg Stands",
      "Block Party",
      "Set It Off",
    ];
    const seededTeams = await tx
      .insert(teams)
      .values(teamNames.map((name) => ({ seasonId: season!.id, name })))
      .returning();

    const captains = [];
    for (const [index, team] of seededTeams.entries()) {
      const captain = await insertUser(tx, {
        externalAuthId: `seed_captain_${index + 1}`,
        phone: `+120255501${String(index + 1).padStart(2, "0")}`,
        email: `captain${index + 1}@dirty30.local`,
        firstName: ["Casey", "Jordan", "Sam", "Taylor", "Morgan", "Riley"][
          index
        ]!,
        lastName: ["Morgan", "Lee", "Rivera", "Brooks", "Tate", "Park"][index]!,
        role: "CAPTAIN",
      });
      captains.push(captain);
      await tx.insert(teamMemberships).values({
        teamId: team.id,
        userId: captain.id,
        membershipRole: "CAPTAIN",
      });
    }

    const playerNames = [
      ["Maya", "Patel"],
      ["Drew", "Young"],
      ["Alex", "Chen"],
      ["Robin", "Diaz"],
      ["Avery", "Bell"],
      ["Cameron", "Fox"],
      ["Quinn", "Stone"],
      ["Parker", "Wells"],
      ["Jamie", "Reed"],
      ["Devon", "Price"],
      ["Skyler", "Ross"],
      ["Emerson", "Cole"],
    ] as const;
    for (const [index, [firstName, lastName]] of playerNames.entries()) {
      const player = await insertUser(tx, {
        externalAuthId: `seed_player_${index + 1}`,
        phone: `+120255502${String(index + 1).padStart(2, "0")}`,
        email: `player${index + 1}@dirty30.local`,
        firstName,
        lastName,
        role: "PLAYER",
      });
      await tx.insert(teamMemberships).values({
        teamId: seededTeams[Math.floor(index / 2)]!.id,
        userId: player.id,
        membershipRole: "PLAYER",
      });
    }

    const weekDates = [
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
      "2026-07-06",
      "2026-07-13",
    ];
    const weeks = await tx
      .insert(scheduleWeeks)
      .values(
        weekDates.map((startDate, index) => ({
          seasonId: season!.id,
          weekNumber: index + 1,
          playDate: startDate,
          startDate,
          endDate: addDays(startDate, 6),
        })),
      )
      .returning();
    const weekByNumber = new Map(weeks.map((week) => [week.weekNumber, week]));

    const roundRobin = [
      [
        [0, 5],
        [1, 4],
        [2, 3],
      ],
      [
        [0, 4],
        [5, 3],
        [1, 2],
      ],
      [
        [0, 3],
        [4, 2],
        [5, 1],
      ],
      [
        [0, 2],
        [3, 1],
        [4, 5],
      ],
      [
        [0, 1],
        [2, 5],
        [3, 4],
      ],
    ] as const;
    const scoreStates = [
      { status: "FINAL" as const, homeScore: 15, awayScore: 11 },
      { status: "FINAL" as const, homeScore: 10, awayScore: 15 },
      { status: "FINAL" as const, homeScore: 15, awayScore: 8 },
      { status: "FINAL" as const, homeScore: 15, awayScore: 12 },
      { status: "FINAL" as const, homeScore: 12, awayScore: 15 },
      { status: "FINAL" as const, homeScore: 15, awayScore: 13 },
      {
        status: "PENDING_CONFIRMATION" as const,
        homeScore: 14,
        awayScore: 11,
      },
      { status: "DISPUTED" as const, homeScore: 13, awayScore: 15 },
    ];
    const gamesToInsert: Array<typeof games.$inferInsert> = [];
    let scoreStateIndex = 0;
    for (const [roundIndex, pairings] of roundRobin.entries()) {
      const week = weekByNumber.get(roundIndex + 1)!;
      for (const [slot, [homeIndex, awayIndex]] of pairings.entries()) {
        const state = scoreStates[scoreStateIndex] ?? {
          status: "PUBLISHED" as const,
          homeScore: null,
          awayScore: null,
        };
        scoreStateIndex += 1;
        const submitted =
          state.status === "PENDING_CONFIRMATION" ||
          state.status === "DISPUTED";
        const scheduledAt = new Date(
          `${week.playDate}T${slot === 2 ? "20:45" : "19:00"}:00-05:00`,
        );
        gamesToInsert.push({
          seasonId: season!.id,
          homeTeamId: seededTeams[homeIndex]!.id,
          awayTeamId: seededTeams[awayIndex]!.id,
          venueId: venue!.id,
          courtId: seededCourts[slot % seededCourts.length]!.id,
          scheduledAt,
          scheduleWeek: week.weekNumber,
          scheduleWeekId: week.id,
          status: state.status,
          homeScore: state.homeScore,
          awayScore: state.awayScore,
          submittedByUserId: submitted ? captains[homeIndex]!.id : undefined,
          submittedAt: submitted
            ? new Date(`${week.playDate}T22:00:00-05:00`)
            : undefined,
          confirmedByUserId:
            state.status === "FINAL" ? commissioner.id : undefined,
          confirmedAt:
            state.status === "FINAL"
              ? new Date(`${week.playDate}T23:00:00-05:00`)
              : undefined,
          disputedByUserId:
            state.status === "DISPUTED" ? captains[awayIndex]!.id : undefined,
          disputedAt:
            state.status === "DISPUTED"
              ? new Date(`${week.playDate}T22:30:00-05:00`)
              : undefined,
          disputeReason:
            state.status === "DISPUTED"
              ? "Captains reported different final scores."
              : undefined,
        });
      }
    }
    const seededGames = await tx
      .insert(games)
      .values(gamesToInsert)
      .returning();

    await tx.insert(teamByes).values(
      seededTeams.map((team) => ({
        seasonId: season!.id,
        teamId: team.id,
        scheduleWeek: 6,
        scheduleWeekId: weekByNumber.get(6)!.id,
        playDate: weekByNumber.get(6)!.playDate,
        source: "GENERATED" as const,
        createdByUserId: commissioner.id,
      })),
    );

    await tx.insert(playerInvitations).values({
      teamId: seededTeams[0]!.id,
      invitedPhone: "+12025550300",
      invitedByUserId: captains[0]!.id,
      tokenHash: tokenHash(DEVELOPMENT_INVITE_TOKEN),
      intendedRole: "PLAYER",
      expiresAt: new Date("2026-12-31T23:59:59Z"),
    });

    await tx.insert(auditEvents).values([
      {
        leagueId: league!.id,
        actorUserId: commissioner.id,
        entityType: "league",
        entityId: league!.id,
        action: "SEEDED",
        afterData: { seasonId: season!.id, teamCount: seededTeams.length },
      },
      {
        leagueId: league!.id,
        actorUserId: commissioner.id,
        entityType: "schedule",
        entityId: season!.id,
        action: "GENERATED",
        afterData: {
          scheduleWeekCount: weeks.length,
          gameCount: seededGames.length,
          byeCount: seededTeams.length,
        },
      },
      {
        leagueId: league!.id,
        actorUserId: commissioner.id,
        entityType: "score",
        entityId: seededGames[6]!.id,
        action: "PENDING_CONFIRMATION",
        afterData: { homeScore: 14, awayScore: 11 },
      },
      {
        leagueId: league!.id,
        actorUserId: captains[3]!.id,
        entityType: "score",
        entityId: seededGames[7]!.id,
        action: "DISPUTED",
        afterData: { homeScore: 13, awayScore: 15 },
      },
    ]);

    return {
      leagueId: league!.id,
      seasonId: season!.id,
      teamCount: seededTeams.length,
      userCount: 1 + captains.length + playerNames.length,
      scheduleWeekCount: weeks.length,
      gameCount: seededGames.length,
      byeCount: seededTeams.length,
      invitationPath: `/invite/${DEVELOPMENT_INVITE_TOKEN}`,
      invitationPhone: "+12025550300",
    };
  });

  console.info("Dirty-30 development seed is ready.");
  console.info(JSON.stringify(result, null, 2));
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
