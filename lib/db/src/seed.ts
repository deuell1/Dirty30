import { and, eq, or } from "drizzle-orm";
import { db } from "./index";
import { courts, games, leagues, playerInvitations, seasons, teamMemberships, teams, users, venues } from "./schema";

async function firstOrCreate<T extends { id: number }>(find: () => Promise<T | undefined>, create: () => Promise<T>) {
  return (await find()) ?? create();
}

async function seedUser(externalAuthId: string, phone: string, firstName: string, lastName: string, role: "COMMISSIONER" | "CAPTAIN" | "PLAYER") {
  const existing = await db.query.users.findFirst({ where: or(eq(users.phone, phone), eq(users.externalAuthId, externalAuthId)) });
  if (existing) {
    const [updated] = await db.update(users).set({ phone, firstName, lastName, role, accessState: "ACTIVE", active: true }).where(eq(users.id, existing.id)).returning();
    return updated!;
  }
  return (await db.insert(users).values({ externalAuthId, phone, firstName, lastName, role, accessState: "ACTIVE" }).returning())[0]!;
}

async function seedMembership(teamId: number, userId: number, membershipRole: "CAPTAIN" | "PLAYER") {
  const existing = await db.query.teamMemberships.findFirst({ where: and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId), eq(teamMemberships.active, true)) });
  if (!existing) await db.insert(teamMemberships).values({ teamId, userId, membershipRole });
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
  await seedUser("seed_commissioner", "+12025550100", "Jordan", "Miles", "COMMISSIONER");
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
    ["seed_casey", "+12025550101", "Casey", "Morgan", "Hops & Dreams"],
    ["seed_jordan_captain", "+12025550102", "Jordan", "Lee", "Pitch Please"],
    ["seed_sam", "+12025550103", "Sam", "Rivera", "Ale Stars"],
    ["seed_taylor", "+12025550104", "Taylor", "Brooks", "The Keg Stands"],
  ] as const;
  const seededTeams: Array<typeof teams.$inferSelect> = [];
  const captains = new Map<string, typeof users.$inferSelect>();
  for (const [externalAuthId, phone, firstName, lastName, teamName] of captainData) {
    const captain = await seedUser(externalAuthId, phone, firstName, lastName, "CAPTAIN");
    captains.set(externalAuthId, captain);
    const team = await firstOrCreate(
      () => db.query.teams.findFirst({ where: and(eq(teams.seasonId, season.id), eq(teams.name, teamName)) }),
      async () => (await db.insert(teams).values({ seasonId: season.id, name: teamName }).returning())[0]!,
    );
    seededTeams.push(team);
    await seedMembership(team.id, captain.id, "CAPTAIN");
  }

  const hops = seededTeams[0]!;
  for (const [index, name] of ["Maya Patel", "Drew Young", "Alex Chen", "Robin Diaz", "Morgan Tate", "Avery Bell"].entries()) {
    const [firstName, lastName] = name.split(" ");
    const player = await seedUser(`seed_hops_${index}`, `+120255501${10 + index}`, firstName!, lastName!, "PLAYER");
    await seedMembership(hops.id, player.id, "PLAYER");
  }
  for (const [teamIndex, name] of ["Riley Park", "Cameron Fox", "Quinn Stone"].entries()) {
    const [firstName, lastName] = name.split(" ");
    const player = await seedUser(`seed_player_${teamIndex}`, `+120255501${20 + teamIndex}`, firstName!, lastName!, "PLAYER");
    await seedMembership(seededTeams[teamIndex + 1]!.id, player.id, "PLAYER");
  }
  const pendingPhone = "+12025550199";
  const seedInvitationTokenHash = "development-seed-invitation-token-hash";
  const existingInvite = await db.query.playerInvitations.findFirst({ where: and(eq(playerInvitations.teamId, hops.id), eq(playerInvitations.status, "PENDING"), or(eq(playerInvitations.invitedPhone, pendingPhone), eq(playerInvitations.tokenHash, seedInvitationTokenHash))) });
  if (!existingInvite) {
    const captain = captains.get("seed_casey");
    await db.insert(playerInvitations).values({ teamId: hops.id, invitedPhone: pendingPhone, invitedByUserId: captain!.id, tokenHash: seedInvitationTokenHash, expiresAt: new Date(Date.now() + 7 * 86400000) });
  } else if (existingInvite.invitedPhone !== pendingPhone) {
    await db.update(playerInvitations).set({ invitedPhone: pendingPhone }).where(eq(playerInvitations.id, existingInvite.id));
  }

  const gameRows = [
    [seededTeams[0]!, seededTeams[1]!, courtTwo, "2026-08-13T19:00:00-05:00", "DRAFT", null, null],
    [seededTeams[2]!, seededTeams[3]!, courtOne, "2026-08-27T19:00:00-05:00", "PUBLISHED", null, null],
    [seededTeams[0]!, seededTeams[1]!, courtOne, "2026-08-27T20:10:00-05:00", "PENDING_CONFIRMATION", 14, 11],
    [seededTeams[2]!, seededTeams[3]!, courtTwo, "2026-08-20T19:00:00-05:00", "DISPUTED", 12, 12],
    [seededTeams[0]!, seededTeams[2]!, courtOne, "2026-08-20T20:10:00-05:00", "FINAL", 17, 13],
    [seededTeams[1]!, seededTeams[3]!, courtTwo, "2026-08-06T19:00:00-05:00", "FINAL", 9, 15],
  ] as const;
  for (const [home, away, court, scheduled, status, homeScore, awayScore] of gameRows) {
    const values = { seasonId: season.id, homeTeamId: home.id, awayTeamId: away.id, venueId: venue.id, courtId: court.id, scheduledAt: new Date(scheduled), status, homeScore, awayScore };
    const existing = await db.query.games.findFirst({ where: and(eq(games.homeTeamId, home.id), eq(games.awayTeamId, away.id), eq(games.scheduledAt, values.scheduledAt)) });
    if (existing) await db.update(games).set(values).where(eq(games.id, existing.id));
    else await db.insert(games).values(values);
  }
  console.info("Dirty-30 development seed is ready (Hops & Dreams has 8 occupied roster positions).");
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});