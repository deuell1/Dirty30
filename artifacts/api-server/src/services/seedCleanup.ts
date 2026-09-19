import { and, eq, inArray, sql } from "drizzle-orm";
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
  users,
  venues,
} from "@workspace/db";
import { normalizeUsPhone } from "../lib/phone";

export const SEED_CONFIRMATION = "DELETE DIRTY30 SEED DATA";
const EXPECTED = {
  seedUsers: 15,
  leagues: 1,
  seasons: 1,
  teams: 4,
  memberships: 14,
  games: 10,
  invitations: 1,
  venues: 1,
  courts: 2,
} as const;
const TEAM_NAMES = [
  "Hops & Dreams",
  "Pitch Please",
  "Ale Stars",
  "The Keg Stands",
];
const SEED_USER_PREDICATE = sql`${users.externalAuthId} LIKE 'seed\\_%' ESCAPE '\\'`;
const NON_SEED_USER_PREDICATE = sql`${users.externalAuthId} NOT LIKE 'seed\\_%' ESCAPE '\\'`;

type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

export type SeedCleanupStatus = {
  safeToExecute: boolean;
  idempotent: boolean;
  counts: {
    seedUsers: number;
    nonSeedUsers: number;
    leagues: number;
    seasons: number;
    teams: number;
    memberships: number;
    games: number;
    invitations: number;
    venues: number;
    courts: number;
    auditEvents: number;
    nonSeedMembersOnSeededTeams: number;
    nonSeedUsersToDelete: number;
  };
  discrepancies: string[];
  blockers: string[];
  initialization: {
    requiresInitialization: boolean;
    hasActiveLeague: boolean;
    hasActiveSeason: boolean;
    leagueName: string | null;
  };
};

function countOf(rows: Array<{ count: number | string }>) {
  return Number(rows[0]?.count ?? 0);
}

async function countRows(executor: Executor, table: unknown, where?: unknown) {
  const query = executor
    .select({ count: sql<number>`count(*)` })
    .from(table as never);
  const rows = where ? await query.where(where as never) : await query;
  return countOf(rows as Array<{ count: number | string }>);
}

async function candidateIds(executor: Executor) {
  const leagueRows = await executor
    .select({ id: leagues.id })
    .from(leagues)
    .where(eq(leagues.name, "Dirty 30 Beer League"));
  const league = leagueRows.length === 1 ? leagueRows[0] : undefined;
  const seasonRows = league
    ? await executor
        .select({ id: seasons.id })
        .from(seasons)
        .where(
          and(eq(seasons.leagueId, league.id), eq(seasons.name, "Summer 2026")),
        )
    : [];
  const season = seasonRows.length === 1 ? seasonRows[0] : undefined;
  const teamRows = season
    ? await executor
        .select({ id: teams.id })
        .from(teams)
        .where(
          and(eq(teams.seasonId, season.id), inArray(teams.name, TEAM_NAMES)),
        )
    : [];
  const teamIds = teamRows.map((row) => row.id);
  const allSeasonTeamRows = season
    ? await executor
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.seasonId, season.id))
    : [];
  const allLeagueSeasonRows = league
    ? await executor
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.leagueId, league.id))
    : [];
  const allLeagueVenueRows = league
    ? await executor
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.leagueId, league.id))
    : [];
  const venueRows = league
    ? await executor
        .select({ id: venues.id })
        .from(venues)
        .where(
          and(
            eq(venues.leagueId, league.id),
            eq(venues.name, "Lakeside Sports Center"),
          ),
        )
    : [];
  const venueIds = venueRows.map((row) => row.id);
  const courtRows = venueIds.length
    ? await executor
        .select({ id: courts.id })
        .from(courts)
        .where(
          and(
            inArray(courts.venueId, venueIds),
            inArray(courts.name, ["Court 1", "Court 2"]),
          ),
        )
    : [];
  return {
    league,
    season,
    teamIds,
    allSeasonTeamCount: allSeasonTeamRows.length,
    allLeagueSeasonCount: allLeagueSeasonRows.length,
    allLeagueVenueCount: allLeagueVenueRows.length,
    venueIds,
    courtIds: courtRows.map((row) => row.id),
  };
}

export async function getSeedCleanupStatus(
  executor: Executor = db,
): Promise<SeedCleanupStatus> {
  const ids = await candidateIds(executor);
  const seedUsers = await countRows(executor, users, SEED_USER_PREDICATE);
  const nonSeedUsers = await countRows(
    executor,
    users,
    NON_SEED_USER_PREDICATE,
  );
  const leagueCount = await countRows(
    executor,
    leagues,
    eq(leagues.name, "Dirty 30 Beer League"),
  );
  const seasonCount = ids.league
    ? await countRows(
        executor,
        seasons,
        and(
          eq(seasons.leagueId, ids.league.id),
          eq(seasons.name, "Summer 2026"),
        ),
      )
    : 0;
  const teamCount = ids.season
    ? await countRows(
        executor,
        teams,
        and(eq(teams.seasonId, ids.season.id), inArray(teams.name, TEAM_NAMES)),
      )
    : 0;
  const membershipCount = ids.teamIds.length
    ? await countRows(
        executor,
        teamMemberships,
        inArray(teamMemberships.teamId, ids.teamIds),
      )
    : 0;
  const gameCount = ids.season
    ? await countRows(executor, games, eq(games.seasonId, ids.season.id))
    : 0;
  const invitationCount = ids.teamIds.length
    ? await countRows(
        executor,
        playerInvitations,
        inArray(playerInvitations.teamId, ids.teamIds),
      )
    : 0;
  const venueCount = ids.league
    ? await countRows(executor, venues, eq(venues.leagueId, ids.league.id))
    : 0;
  const courtCount = ids.venueIds.length
    ? await countRows(executor, courts, inArray(courts.venueId, ids.venueIds))
    : 0;
  const auditCount = ids.league
    ? await countRows(
        executor,
        auditEvents,
        eq(auditEvents.leagueId, ids.league.id),
      )
    : 0;
  const nonSeedMembers = ids.teamIds.length
    ? await countRows(
        executor,
        teamMemberships,
        and(
          inArray(teamMemberships.teamId, ids.teamIds),
          sql`${teamMemberships.userId} NOT IN (SELECT id FROM users WHERE external_auth_id LIKE 'seed\\_%' ESCAPE '\\')`,
        ),
      )
    : 0;
  const seedUsersOnNonSeedTeams = await countRows(
    executor,
    teamMemberships,
    and(
      sql`${teamMemberships.userId} IN (SELECT id FROM users WHERE external_auth_id LIKE 'seed\\_%' ESCAPE '\\')`,
      ids.teamIds.length
        ? sql`${teamMemberships.teamId} NOT IN (${sql.join(
            ids.teamIds.map((id) => sql`${id}`),
            sql`, `,
          )})`
        : sql`true`,
    ),
  );
  const seedUsersInNonSeedInvitations = await countRows(
    executor,
    playerInvitations,
    and(
      sql`${playerInvitations.invitedByUserId} IN (SELECT id FROM users WHERE external_auth_id LIKE 'seed\\_%' ESCAPE '\\')`,
      ids.teamIds.length
        ? sql`${playerInvitations.teamId} NOT IN (${sql.join(
            ids.teamIds.map((id) => sql`${id}`),
            sql`, `,
          )})`
        : sql`true`,
    ),
  );
  const seedUsersInNonSeedGames = await countRows(
    executor,
    games,
    and(
      sql`(
        ${games.submittedByUserId} IN (SELECT id FROM users WHERE external_auth_id LIKE 'seed\\_%' ESCAPE '\\')
        OR ${games.confirmedByUserId} IN (SELECT id FROM users WHERE external_auth_id LIKE 'seed\\_%' ESCAPE '\\')
        OR ${games.disputedByUserId} IN (SELECT id FROM users WHERE external_auth_id LIKE 'seed\\_%' ESCAPE '\\')
        OR ${games.resolvedByUserId} IN (SELECT id FROM users WHERE external_auth_id LIKE 'seed\\_%' ESCAPE '\\')
      )`,
      ids.season ? sql`${games.seasonId} <> ${ids.season.id}` : sql`true`,
    ),
  );
  const seedUsersInNonSeedAudit = await countRows(
    executor,
    auditEvents,
    and(
      sql`${auditEvents.actorUserId} IN (SELECT id FROM users WHERE external_auth_id LIKE 'seed\\_%' ESCAPE '\\')`,
      ids.league ? sql`${auditEvents.leagueId} <> ${ids.league.id}` : sql`true`,
    ),
  );
  const seededVenuesInOtherGames = ids.venueIds.length
    ? await countRows(
        executor,
        games,
        and(
          sql`${games.venueId} IN (${sql.join(
            ids.venueIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          ids.season ? sql`${games.seasonId} <> ${ids.season.id}` : sql`true`,
        ),
      )
    : 0;
  const seededCourtsInOtherGames = ids.courtIds.length
    ? await countRows(
        executor,
        games,
        and(
          sql`${games.courtId} IN (${sql.join(
            ids.courtIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          ids.season ? sql`${games.seasonId} <> ${ids.season.id}` : sql`true`,
        ),
      )
    : 0;
  const seededTeamsInOtherGames = ids.teamIds.length
    ? await countRows(
        executor,
        games,
        and(
          sql`(
            ${games.homeTeamId} IN (${sql.join(
              ids.teamIds.map((id) => sql`${id}`),
              sql`, `,
            )})
            OR ${games.awayTeamId} IN (${sql.join(
              ids.teamIds.map((id) => sql`${id}`),
              sql`, `,
            )})
          )`,
          ids.season ? sql`${games.seasonId} <> ${ids.season.id}` : sql`true`,
        ),
      )
    : 0;
  const counts = {
    seedUsers,
    nonSeedUsers,
    leagues: leagueCount,
    seasons: seasonCount,
    teams: teamCount,
    memberships: membershipCount,
    games: gameCount,
    invitations: invitationCount,
    venues: venueCount,
    courts: courtCount,
    auditEvents: auditCount,
    nonSeedMembersOnSeededTeams: nonSeedMembers,
    nonSeedUsersToDelete: 0,
  };
  const idempotent = [
    counts.seedUsers,
    counts.leagues,
    counts.seasons,
    counts.teams,
    counts.memberships,
    counts.games,
    counts.invitations,
    counts.venues,
    counts.courts,
    counts.auditEvents,
  ].every((count) => count === 0);
  const discrepancies: string[] = [];
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const actual = counts[key as keyof typeof EXPECTED];
    if (actual !== expected && !idempotent)
      discrepancies.push(`${key} expected ${expected}, found ${actual}`);
  }
  const blockers: string[] = [];
  if (leagueCount > 1)
    blockers.push("Seed league is not uniquely identifiable");
  if (seasonCount > 1)
    blockers.push("Seed season is not uniquely identifiable");
  if (teamCount !== 0 && teamCount !== TEAM_NAMES.length)
    blockers.push("Seed team count is unexpected");
  if (ids.allSeasonTeamCount !== teamCount)
    blockers.push("Unexpected teams reference the seeded season");
  if (ids.allLeagueSeasonCount !== seasonCount)
    blockers.push("Unexpected seasons reference the seeded league");
  if (ids.allLeagueVenueCount !== venueCount)
    blockers.push("Unexpected venues reference the seeded league");
  if (venueCount !== 1)
    blockers.push("Seed venue identity is incomplete or ambiguous");
  if (ids.courtIds.length !== 2 || courtCount !== 2)
    blockers.push("Seed court identity is incomplete or ambiguous");
  if (nonSeedMembers > 0)
    blockers.push("Non-seed memberships exist on seeded teams");
  if (seedUsersOnNonSeedTeams > 0)
    blockers.push("Seed users have memberships outside seeded teams");
  if (seedUsersInNonSeedInvitations > 0)
    blockers.push(
      "Seed users are referenced by invitations outside seeded teams",
    );
  if (seedUsersInNonSeedGames > 0)
    blockers.push(
      "Seed users are referenced by games outside the seeded season",
    );
  if (seedUsersInNonSeedAudit > 0)
    blockers.push(
      "Seed users are referenced by audit events outside the seeded league",
    );
  if (seededVenuesInOtherGames > 0)
    blockers.push(
      "Seeded venues are referenced by games outside the seeded season",
    );
  if (seededCourtsInOtherGames > 0)
    blockers.push(
      "Seeded courts are referenced by games outside the seeded season",
    );
  if (seededTeamsInOtherGames > 0)
    blockers.push(
      "Seeded teams are referenced by games outside the seeded season",
    );
  if (discrepancies.length)
    blockers.push("Seed counts differ from the known dataset");
  if (counts.nonSeedUsersToDelete !== 0)
    blockers.push("A non-seed user would be deleted");
  const activeLeague = await executor
    .select({ name: leagues.name })
    .from(leagues)
    .where(eq(leagues.active, true))
    .limit(1);
  const activeSeason = await executor
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.active, true))
    .limit(1);
  return {
    safeToExecute:
      idempotent ||
      (blockers.length === 0 && leagueCount === 1 && seasonCount === 1),
    idempotent,
    counts,
    discrepancies,
    blockers,
    initialization: {
      requiresInitialization:
        activeLeague.length === 0 || activeSeason.length === 0,
      hasActiveLeague: activeLeague.length > 0,
      hasActiveSeason: activeSeason.length > 0,
      leagueName: activeLeague[0]?.name ?? null,
    },
  };
}

export function isBootstrapCommissioner(user: {
  role: string;
  accessState: string;
  phone: string;
}) {
  const configured = process.env.BOOTSTRAP_COMMISSIONER_PHONE?.trim();
  if (
    !configured ||
    user.role !== "COMMISSIONER" ||
    user.accessState !== "ACTIVE"
  )
    return false;
  return normalizeUsPhone(configured) === user.phone;
}

export async function executeSeedCleanup(
  executor: Transaction,
  actor: { id: number; role: string; accessState: string; phone: string },
  options?: {
    failAfterDeletes?: boolean;
    afterPreflight?: () => Promise<void>;
  },
) {
  // SHARE ROW EXCLUSIVE permits ordinary reads while conflicting with the
  // RowExclusive locks acquired by INSERT/UPDATE/DELETE. Keep this in the
  // service so direct callers receive the same TOCTOU protection as the route.
  await executor.execute(sql`
    SELECT pg_advisory_xact_lock(30032);
    LOCK TABLE users, leagues, seasons, teams, team_memberships,
      player_invitations, venues, courts, games, audit_events
      IN SHARE ROW EXCLUSIVE MODE
  `);
  const actorRows = await executor
    .select({
      role: users.role,
      accessState: users.accessState,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, actor.id));
  const actorIsBootstrap =
    actorRows.length === 1 &&
    isBootstrapCommissioner(actorRows[0]!) &&
    isBootstrapCommissioner(actor);
  if (!actorIsBootstrap)
    throw Object.assign(new Error("Bootstrap commissioner access required"), {
      status: 403,
    });
  const before = await getSeedCleanupStatus(executor);
  const preservedBefore = before.counts.nonSeedUsers;
  if (before.idempotent) {
    return {
      ...before,
      complete: true,
      removed: before.counts,
      preservedNonSeedUsers: before.counts.nonSeedUsers,
      activeBootstrapCommissioner: actorIsBootstrap,
    };
  }
  if (!before.safeToExecute)
    throw Object.assign(new Error("Seed cleanup is not safe to execute"), {
      status: 409,
    });
  await options?.afterPreflight?.();
  await executor
    .delete(auditEvents)
    .where(eq(auditEvents.leagueId, (await candidateIds(executor)).league!.id));
  const ids = await candidateIds(executor);
  await executor
    .delete(playerInvitations)
    .where(inArray(playerInvitations.teamId, ids.teamIds));
  await executor.delete(games).where(eq(games.seasonId, ids.season!.id));
  await executor
    .delete(teamMemberships)
    .where(inArray(teamMemberships.teamId, ids.teamIds));
  await executor.delete(courts).where(inArray(courts.id, ids.courtIds));
  await executor.delete(venues).where(inArray(venues.id, ids.venueIds));
  await executor.delete(teams).where(inArray(teams.id, ids.teamIds));
  await executor.delete(seasons).where(eq(seasons.id, ids.season!.id));
  await executor.delete(leagues).where(eq(leagues.id, ids.league!.id));
  await executor.delete(users).where(SEED_USER_PREDICATE);
  if (options?.failAfterDeletes)
    throw new Error("Injected cleanup verification failure");
  const after = await getSeedCleanupStatus(executor);
  if (!after.idempotent) throw new Error("Cleanup verification failed");
  if (
    !after.initialization.requiresInitialization ||
    after.initialization.hasActiveLeague ||
    after.initialization.hasActiveSeason
  )
    throw new Error("League initialization verification failed");
  const preserved = await countRows(executor, users, NON_SEED_USER_PREDICATE);
  if (preserved !== preservedBefore)
    throw new Error("Non-seed user preservation verification failed");
  const bootstrap = await executor
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, "COMMISSIONER"),
        eq(users.accessState, "ACTIVE"),
        eq(users.id, actor.id),
      ),
    );
  if (!bootstrap.length || !actorIsBootstrap)
    throw new Error("Active bootstrap commissioner verification failed");
  return {
    ...after,
    complete: true,
    removed: before.counts,
    preservedNonSeedUsers: preserved,
    activeBootstrapCommissioner: bootstrap.length > 0,
  };
}
