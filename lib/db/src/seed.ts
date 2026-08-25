import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { courts, games, leagues, seasons, teamMemberships, teams, users, venues } from "./schema";

async function firstOrCreate<T extends { id: number }>(
  find: () => Promise<T | undefined>,
  create: () => Promise<T>,
): Promise<T> {
  return (await find()) ?? create();
}

async function seed() {
  const league = await firstOrCreate(
    () => db.query.leagues.findFirst({ where: eq(leagues.name, "Dirty 30 Beer League") }),
    async () => (await db.insert(leagues).values({ name: "Dirty 30 Beer League" }).returning())[0]!,
  );
  const season = await firstOrCreate(
    () => db.query.seasons.findFirst({ where: and(eq(seasons.leagueId, league.id), eq(seasons.name, "Summer 2026")) }),
    async () => (await db.insert(seasons).values({ leagueId: league.id, name: "Summer 2026", startDate: "2026-06-01", endDate: "2026-09-30" }).returning())[0]!,
  );
  const venue = await firstOrCreate(
    () => db.query.venues.findFirst({ where: and(eq(venues.leagueId, league.id), eq(venues.name, "Lakeside Sports Center")) }),
    async () => (await db.insert(venues).values({ leagueId: league.id, name: "Lakeside Sports Center", address: "Chicago, IL" }).returning())[0]!,
  );
  const courtOne = await firstOrCreate(
    () => db.query.courts.findFirst({ where: and(eq(courts.venueId, venue.id), eq(courts.name, "Court 1")) }),
    async () => (await db.insert(courts).values({ venueId: venue.id, name: "Court 1" }).returning())[0]!,
  );
  const courtTwo = await firstOrCreate(
    () => db.query.courts.findFirst({ where: and(eq(courts.venueId, venue.id), eq(courts.name, "Court 2")) }),
    async () => (await db.insert(courts).values({ venueId: venue.id, name: "Court 2" }).returning())[0]!,
  );

  const captainData = [
    ["seed_casey", "casey@dirty30.local", "Casey", "Morgan", "Hops & Dreams"],
    ["seed_jordan", "jordan@dirty30.local", "Jordan", "Lee", "Pitch Please"],
    ["seed_sam", "sam@dirty30.local", "Sam", "Rivera", "Ale Stars"],
    ["seed_taylor", "taylor@dirty30.local", "Taylor", "Brooks", "The Keg Stands"],
  ] as const;
  const seededTeams: Array<typeof teams.$inferSelect> = [];
  for (const [externalAuthId, email, firstName, lastName, teamName] of captainData) {
    const user = await firstOrCreate(
      () => db.query.users.findFirst({ where: eq(users.email, email) }),
      async () => (await db.insert(users).values({ externalAuthId, email, firstName, lastName, role: "CAPTAIN" }).returning())[0]!,
    );
    const team = await firstOrCreate(
      () => db.query.teams.findFirst({ where: and(eq(teams.seasonId, season.id), eq(teams.name, teamName)) }),
      async () => (await db.insert(teams).values({ seasonId: season.id, name: teamName }).returning())[0]!,
    );
    seededTeams.push(team);
    const membership = await db.query.teamMemberships.findFirst({ where: and(eq(teamMemberships.teamId, team.id), eq(teamMemberships.userId, user.id), eq(teamMemberships.active, true)) });
    if (!membership) await db.insert(teamMemberships).values({ teamId: team.id, userId: user.id, membershipRole: "CAPTAIN" });
  }
  const gameRows = [
    [seededTeams[0]!, seededTeams[1]!, courtTwo, "2026-08-27T19:00:00-05:00", "PUBLISHED", null, null],
    [seededTeams[2]!, seededTeams[3]!, courtOne, "2026-08-27T20:10:00-05:00", "PENDING_CONFIRMATION", 14, 11],
    [seededTeams[0]!, seededTeams[2]!, courtOne, "2026-08-20T19:00:00-05:00", "FINAL", 17, 13],
    [seededTeams[1]!, seededTeams[3]!, courtTwo, "2026-08-20T20:10:00-05:00", "FINAL", 9, 15],
  ] as const;
  for (const [home, away, court, scheduled, status, homeScore, awayScore] of gameRows) {
    const existing = await db.query.games.findFirst({ where: and(eq(games.homeTeamId, home.id), eq(games.awayTeamId, away.id), eq(games.scheduledAt, new Date(scheduled))) });
    if (!existing) await db.insert(games).values({ seasonId: season.id, homeTeamId: home.id, awayTeamId: away.id, venueId: venue.id, courtId: court.id, scheduledAt: new Date(scheduled), status, homeScore, awayScore });
  }
  console.info("Dirty-30 development seed is ready.");
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});