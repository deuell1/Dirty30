import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import pg from "pg";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests. Refusing to use DATABASE_URL.");
}
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must be a dedicated database and must not equal DATABASE_URL.");
}

const migrate = spawnSync("pnpm", ["--filter", "@workspace/db", "run", "migrate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testDatabaseUrl },
});
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const { Client } = pg;
const setup = new Client({ connectionString: testDatabaseUrl });
const first = new Client({ connectionString: testDatabaseUrl });
const second = new Client({ connectionString: testDatabaseUrl });
const marker = `integration-${Date.now()}-${process.pid}`;
let fixture;

async function createFixture() {
  const league = (await setup.query("INSERT INTO leagues (name, active) VALUES ($1, false) RETURNING id", [`${marker}-league`])).rows[0];
  const season = (await setup.query("INSERT INTO seasons (league_id, name, start_date, end_date, active) VALUES ($1, $2, '2026-01-01', '2026-12-31', false) RETURNING id", [league.id, `${marker}-season`])).rows[0];
  const home = (await setup.query("INSERT INTO teams (season_id, name) VALUES ($1, $2) RETURNING id", [season.id, `${marker}-home`])).rows[0];
  const away = (await setup.query("INSERT INTO teams (season_id, name) VALUES ($1, $2) RETURNING id", [season.id, `${marker}-away`])).rows[0];
  const venue = (await setup.query("INSERT INTO venues (league_id, name) VALUES ($1, $2) RETURNING id", [league.id, `${marker}-venue`])).rows[0];
  const court = (await setup.query("INSERT INTO courts (venue_id, name) VALUES ($1, $2) RETURNING id", [venue.id, `${marker}-court`])).rows[0];
  return { league, season, home, away, venue, court };
}

async function conflictExists(client, scheduledAt) {
  const result = await client.query(
    "SELECT id FROM games WHERE season_id = $1 AND status <> 'CANCELLED' AND scheduled_at < $2::timestamptz + interval '90 minutes' AND scheduled_at > $2::timestamptz - interval '90 minutes' AND court_id = $3",
    [fixture.season.id, scheduledAt, fixture.court.id],
  );
  return result.rowCount > 0;
}

async function scheduleConcurrencyCheck() {
  const scheduledAt = "2026-06-12T19:00:00.000Z";
  await first.query("BEGIN");
  await second.query("BEGIN");
  await first.query("SELECT pg_advisory_xact_lock(30030)");
  assert.equal(await conflictExists(first, scheduledAt), false);

  const blockedWriter = (async () => {
    await second.query("SELECT pg_advisory_xact_lock(30030)");
    const conflict = await conflictExists(second, scheduledAt);
    if (conflict) {
      await second.query("ROLLBACK");
      return "rejected";
    }
    await second.query(
      "INSERT INTO games (season_id, home_team_id, away_team_id, venue_id, court_id, scheduled_at, status) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')",
      [fixture.season.id, fixture.home.id, fixture.away.id, fixture.venue.id, fixture.court.id, scheduledAt],
    );
    await second.query("COMMIT");
    return "inserted";
  })();

  await first.query(
    "INSERT INTO games (season_id, home_team_id, away_team_id, venue_id, court_id, scheduled_at, status) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')",
    [fixture.season.id, fixture.home.id, fixture.away.id, fixture.venue.id, fixture.court.id, scheduledAt],
  );
  await first.query("COMMIT");
  assert.equal(await blockedWriter, "rejected", "a conflicting game must not be inserted after the advisory lock releases");
}

async function main() {
  await Promise.all([setup.connect(), first.connect(), second.connect()]);
  try {
    const migration = await setup.query("SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'access_state'");
    assert.equal(migration.rows[0]?.column_default, "'PENDING'::user_access_state", "migrations must establish pending access by default");
    fixture = await createFixture();
    await scheduleConcurrencyCheck();
    console.info("PostgreSQL integration checks: 2 passed (migration default, schedule concurrency).");
  } finally {
    await first.query("ROLLBACK").catch(() => undefined);
    await second.query("ROLLBACK").catch(() => undefined);
    if (fixture) {
      await setup.query("DELETE FROM games WHERE season_id = $1", [fixture.season.id]);
      await setup.query("DELETE FROM courts WHERE id = $1", [fixture.court.id]);
      await setup.query("DELETE FROM venues WHERE id = $1", [fixture.venue.id]);
      await setup.query("DELETE FROM teams WHERE season_id = $1", [fixture.season.id]);
      await setup.query("DELETE FROM seasons WHERE id = $1", [fixture.season.id]);
      await setup.query("DELETE FROM leagues WHERE id = $1", [fixture.league.id]);
    }
    await Promise.all([setup.end(), first.end(), second.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});