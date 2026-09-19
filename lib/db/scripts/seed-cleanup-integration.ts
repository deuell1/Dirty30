import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
process.env.BOOTSTRAP_COMMISSIONER_PHONE = "+12025550001";

const client = new Client({ connectionString: databaseUrl });
const writer = new Client({ connectionString: databaseUrl });
const { db, pool } = await import("../src/index.ts");
const { executeSeedCleanup, getSeedCleanupStatus } =
  await import("../../../artifacts/api-server/src/services/seedCleanup.ts");

async function query(text: string, values: unknown[] = []) {
  return client.query(text, values);
}

await client.connect();
await writer.connect();
try {
  await query(
    "DELETE FROM audit_events WHERE entity_type = 'seed' AND entity_id = 1",
  );
  await query(
    "DELETE FROM player_invitations WHERE token_hash = 'integration-seed-token'",
  );
  await query(
    "DELETE FROM games WHERE season_id IN (SELECT id FROM seasons WHERE name = 'Summer 2026' AND league_id IN (SELECT id FROM leagues WHERE name = 'Dirty 30 Beer League'))",
  );
  await query(
    "DELETE FROM team_memberships WHERE team_id IN (SELECT id FROM teams WHERE season_id IN (SELECT id FROM seasons WHERE name = 'Summer 2026' AND league_id IN (SELECT id FROM leagues WHERE name = 'Dirty 30 Beer League')))",
  );
  await query(
    "DELETE FROM courts WHERE venue_id IN (SELECT id FROM venues WHERE name = 'Lakeside Sports Center')",
  );
  await query("DELETE FROM venues WHERE name = 'Lakeside Sports Center'");
  await query(
    "DELETE FROM teams WHERE season_id IN (SELECT id FROM seasons WHERE name = 'Summer 2026' AND league_id IN (SELECT id FROM leagues WHERE name = 'Dirty 30 Beer League'))",
  );
  await query(
    "DELETE FROM seasons WHERE name = 'Summer 2026' AND league_id IN (SELECT id FROM leagues WHERE name = 'Dirty 30 Beer League')",
  );
  await query("DELETE FROM leagues WHERE name = 'Dirty 30 Beer League'");
  await query(
    "DELETE FROM users WHERE external_auth_id LIKE 'seed_integration_%'",
  );
  await query(
    "DELETE FROM users WHERE external_auth_id LIKE 'integration_real_%'",
  );

  const users: Array<{ id: number }> = [];
  for (let index = 0; index < 15; index += 1) {
    users.push(
      (
        await query(
          "INSERT INTO users (external_auth_id, phone, first_name, last_name, role, access_state, active) VALUES ($1, $2, $3, 'Seed', $4, 'ACTIVE', true) RETURNING id",
          [
            `seed_integration_${index}`,
            `+12025551${String(index).padStart(3, "0")}`,
            `Seed${index}`,
            index < 4 ? "CAPTAIN" : "PLAYER",
          ],
        )
      ).rows[0],
    );
  }
  const nonSeed = [];
  for (let index = 0; index < 2; index += 1) {
    nonSeed.push(
      (
        await query(
          "INSERT INTO users (external_auth_id, phone, first_name, last_name, role, access_state, active) VALUES ($1, $2, $3, 'Real', $4, 'ACTIVE', true) RETURNING id",
          [
            `integration_real_${index}`,
            index === 0
              ? "+12025550001"
              : `+12025552${String(index).padStart(3, "0")}`,
            `Real${index}`,
            index === 0 ? "COMMISSIONER" : "PLAYER",
          ],
        )
      ).rows[0],
    );
  }
  const league = (
    await query(
      "INSERT INTO leagues (name, active) VALUES ('Dirty 30 Beer League', true) RETURNING id",
    )
  ).rows[0];
  const season = (
    await query(
      "INSERT INTO seasons (league_id, name, start_date, end_date, active) VALUES ($1, 'Summer 2026', '2026-06-01', '2026-09-30', true) RETURNING id",
      [league.id],
    )
  ).rows[0];
  const teamNames = [
    "Hops & Dreams",
    "Pitch Please",
    "Ale Stars",
    "The Keg Stands",
  ];
  const teamIds: number[] = [];
  for (const name of teamNames) {
    teamIds.push(
      (
        await query(
          "INSERT INTO teams (season_id, name) VALUES ($1, $2) RETURNING id",
          [season.id, name],
        )
      ).rows[0].id,
    );
  }
  const venue = (
    await query(
      "INSERT INTO venues (league_id, name, address, active) VALUES ($1, 'Lakeside Sports Center', 'Test', true) RETURNING id",
      [league.id],
    )
  ).rows[0];
  const courts: number[] = [];
  for (const name of ["Court 1", "Court 2"]) {
    courts.push(
      (
        await query(
          "INSERT INTO courts (venue_id, name, active) VALUES ($1, $2, true) RETURNING id",
          [venue.id, name],
        )
      ).rows[0].id,
    );
  }
  let membershipCount = 0;
  for (let index = 0; index < 14; index += 1) {
    const teamId = teamIds[index < 7 ? 0 : index < 10 ? 1 : index < 12 ? 2 : 3];
    await query(
      "INSERT INTO team_memberships (team_id, user_id, membership_role, active) VALUES ($1, $2, $3, true)",
      [teamId, users[index]!.id, index < 4 ? "CAPTAIN" : "PLAYER"],
    );
    membershipCount += 1;
  }
  await query(
    "INSERT INTO player_invitations (team_id, invited_phone, invited_by_user_id, token_hash, status, expires_at) VALUES ($1, '+12025559999', $2, 'integration-seed-token', 'PENDING', now() + interval '7 days')",
    [teamIds[0], users[0]!.id],
  );
  for (let index = 0; index < 10; index += 1) {
    await query(
      "INSERT INTO games (season_id, home_team_id, away_team_id, venue_id, court_id, scheduled_at, status, home_score, away_score, submitted_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, 'FINAL', 10, 8, $7)",
      [
        season.id,
        teamIds[index % 4],
        teamIds[(index + 1) % 4],
        venue.id,
        courts[index % 2],
        new Date(Date.UTC(2026, 6, index + 1, 19, 0)),
        users[0]!.id,
      ],
    );
  }
  await query(
    "INSERT INTO audit_events (league_id, actor_user_id, entity_type, entity_id, action) VALUES ($1, $2, 'seed', 1, 'SEEDED')",
    [league.id, users[0]!.id],
  );

  const dryRun = await getSeedCleanupStatus(db);
  assert.equal(dryRun.safeToExecute, true);
  assert.equal(dryRun.counts.seedUsers, 15);
  assert.equal(dryRun.counts.teams, 4);
  assert.equal(dryRun.counts.memberships, membershipCount);
  assert.equal(dryRun.counts.games, 10);
  assert.equal(dryRun.counts.invitations, 1);

  await assert.rejects(
    db.transaction((tx) =>
      executeSeedCleanup(
        tx,
        {
          id: nonSeed[0]!.id,
          role: "COMMISSIONER",
          accessState: "ACTIVE",
          phone: "+12025550001",
        },
        { failAfterDeletes: true },
      ),
    ),
  );
  const afterRollback = await getSeedCleanupStatus(db);
  assert.equal(afterRollback.counts.seedUsers, 15);
  assert.equal(afterRollback.counts.games, 10);

  const crossLeague = (
    await query(
      "INSERT INTO leagues (name, active) VALUES ('Cross-season fixture', false) RETURNING id",
    )
  ).rows[0];
  const crossSeason = (
    await query(
      "INSERT INTO seasons (league_id, name, start_date, end_date, active) VALUES ($1, 'Cross-season', '2026-01-01', '2026-12-31', false) RETURNING id",
      [crossLeague.id],
    )
  ).rows[0];
  const crossTeam = (
    await query(
      "INSERT INTO teams (season_id, name) VALUES ($1, 'Cross-season team') RETURNING id",
      [crossSeason.id],
    )
  ).rows[0];
  await query(
    "INSERT INTO games (season_id, home_team_id, away_team_id, venue_id, court_id, scheduled_at, status) VALUES ($1, $2, $3, $4, $5, '2026-08-01T19:00:00Z', 'DRAFT')",
    [crossSeason.id, teamIds[0], crossTeam.id, venue.id, courts[0]],
  );
  const crossSeasonStatus = await getSeedCleanupStatus(db);
  assert.equal(crossSeasonStatus.safeToExecute, false);
  assert.ok(
    crossSeasonStatus.blockers.some((blocker) =>
      blocker.includes("Seeded teams are referenced"),
    ),
  );
  await query("DELETE FROM games WHERE season_id = $1", [crossSeason.id]);
  await query("DELETE FROM teams WHERE id = $1", [crossTeam.id]);
  await query("DELETE FROM seasons WHERE id = $1", [crossSeason.id]);
  await query("DELETE FROM leagues WHERE id = $1", [crossLeague.id]);

  const completed = await db.transaction((tx) =>
    executeSeedCleanup(
      tx,
      {
        id: nonSeed[0]!.id,
        role: "COMMISSIONER",
        accessState: "ACTIVE",
        phone: "+12025550001",
      },
      {
        afterPreflight: async () => {
          await writer.query("SET lock_timeout TO '250ms'");
          await assert.rejects(
            writer.query(
              "INSERT INTO team_memberships (team_id, user_id, membership_role, active) VALUES ($1, $2, 'PLAYER', true)",
              [teamIds[0], nonSeed[1]!.id],
            ),
            (error: { code?: string }) => error.code === "55P03",
          );
          await writer.query("SET lock_timeout TO '0'");
        },
      },
    ),
  );
  assert.equal(completed.complete, true);
  assert.equal(completed.preservedNonSeedUsers, 2);
  assert.equal(completed.activeBootstrapCommissioner, true);
  const duplicate = await db.transaction((tx) =>
    executeSeedCleanup(tx, {
      id: nonSeed[0]!.id,
      role: "COMMISSIONER",
      accessState: "ACTIVE",
      phone: "+12025550001",
    }),
  );
  assert.equal(duplicate.idempotent, true);
  assert.equal(duplicate.activeBootstrapCommissioner, true);
  assert.equal(
    (
      await query(
        "SELECT count(*)::int AS count FROM users WHERE external_auth_id LIKE 'seed\\_%' ESCAPE '\\'",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await query(
        "SELECT count(*)::int AS count FROM users WHERE external_auth_id NOT LIKE 'seed\\_%' ESCAPE '\\'",
      )
    ).rows[0].count,
    2,
  );
  console.info("Seed cleanup PostgreSQL integration checks: 4 passed.");
} finally {
  await client
    .query(
      "DELETE FROM games WHERE season_id IN (SELECT id FROM seasons WHERE league_id IN (SELECT id FROM leagues WHERE name = 'Cross-season fixture'))",
    )
    .catch(() => undefined);
  await client
    .query(
      "DELETE FROM teams WHERE season_id IN (SELECT id FROM seasons WHERE league_id IN (SELECT id FROM leagues WHERE name = 'Cross-season fixture'))",
    )
    .catch(() => undefined);
  await client
    .query(
      "DELETE FROM seasons WHERE league_id IN (SELECT id FROM leagues WHERE name = 'Cross-season fixture')",
    )
    .catch(() => undefined);
  await client
    .query("DELETE FROM leagues WHERE name = 'Cross-season fixture'")
    .catch(() => undefined);
  await client
    .query(
      "DELETE FROM audit_events WHERE entity_type = 'seed' AND entity_id = 1",
    )
    .catch(() => undefined);
  await client
    .query("DELETE FROM users WHERE external_auth_id LIKE 'integration_real_%'")
    .catch(() => undefined);
  await client.end();
  await writer.end();
  await pool.end();
}
