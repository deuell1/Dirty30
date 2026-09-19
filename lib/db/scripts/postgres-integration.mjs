import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import pg from "pg";

const rawTestDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!rawTestDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL integration tests. Refusing to use DATABASE_URL.",
  );
}
if (rawTestDatabaseUrl === process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "TEST_DATABASE_URL must be a dedicated database and must not equal DATABASE_URL.",
  );
}

const parsedTestDatabaseUrl = new URL(rawTestDatabaseUrl);
if (parsedTestDatabaseUrl.hostname.endsWith(".pooler.supabase.com")) {
  if (!parsedTestDatabaseUrl.searchParams.has("sslmode")) {
    parsedTestDatabaseUrl.searchParams.set("sslmode", "require");
  }
  if (
    parsedTestDatabaseUrl.searchParams.get("sslmode") === "require" &&
    !parsedTestDatabaseUrl.searchParams.has("uselibpqcompat")
  ) {
    parsedTestDatabaseUrl.searchParams.set("uselibpqcompat", "true");
  }
}
const testDatabaseUrl = parsedTestDatabaseUrl.toString();

const migrate = spawnSync(
  "pnpm",
  ["--filter", "@workspace/db", "run", "migrate"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const { Client } = pg;
const setup = new Client({ connectionString: testDatabaseUrl });
const first = new Client({ connectionString: testDatabaseUrl });
const second = new Client({ connectionString: testDatabaseUrl });
const marker = `integration-${Date.now()}-${process.pid}`;
let fixture;
let initializationFixture;

async function createFixture() {
  const league = (
    await setup.query(
      "INSERT INTO leagues (name, active) VALUES ($1, false) RETURNING id",
      [`${marker}-league`],
    )
  ).rows[0];
  const season = (
    await setup.query(
      "INSERT INTO seasons (league_id, name, start_date, end_date, active) VALUES ($1, $2, '2026-01-01', '2026-12-31', false) RETURNING id",
      [league.id, `${marker}-season`],
    )
  ).rows[0];
  const home = (
    await setup.query(
      "INSERT INTO teams (season_id, name) VALUES ($1, $2) RETURNING id",
      [season.id, `${marker}-home`],
    )
  ).rows[0];
  const away = (
    await setup.query(
      "INSERT INTO teams (season_id, name) VALUES ($1, $2) RETURNING id",
      [season.id, `${marker}-away`],
    )
  ).rows[0];
  const venue = (
    await setup.query(
      "INSERT INTO venues (league_id, name) VALUES ($1, $2) RETURNING id",
      [league.id, `${marker}-venue`],
    )
  ).rows[0];
  const court = (
    await setup.query(
      "INSERT INTO courts (venue_id, name) VALUES ($1, $2) RETURNING id",
      [venue.id, `${marker}-court`],
    )
  ).rows[0];
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
      [
        fixture.season.id,
        fixture.home.id,
        fixture.away.id,
        fixture.venue.id,
        fixture.court.id,
        scheduledAt,
      ],
    );
    await second.query("COMMIT");
    return "inserted";
  })();

  await first.query(
    "INSERT INTO games (season_id, home_team_id, away_team_id, venue_id, court_id, scheduled_at, status) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')",
    [
      fixture.season.id,
      fixture.home.id,
      fixture.away.id,
      fixture.venue.id,
      fixture.court.id,
      scheduledAt,
    ],
  );
  await first.query("COMMIT");
  assert.equal(
    await blockedWriter,
    "rejected",
    "a conflicting game must not be inserted after the advisory lock releases",
  );
}

async function leagueInitializationConcurrencyCheck() {
  const existing = await setup.query(
    "SELECT l.id FROM leagues l JOIN seasons s ON s.league_id = l.id WHERE l.active = true AND s.active = true LIMIT 1",
  );
  assert.equal(
    existing.rowCount,
    0,
    "the dedicated test database must not contain an active initialized league",
  );

  await first.query("BEGIN");
  await second.query("BEGIN");
  await first.query("SELECT pg_advisory_xact_lock(30031)");

  const blockedInitializer = (async () => {
    await second.query("SELECT pg_advisory_xact_lock(30031)");
    const initialized = await second.query(
      "SELECT l.id FROM leagues l JOIN seasons s ON s.league_id = l.id WHERE l.active = true AND s.active = true LIMIT 1",
    );
    if (initialized.rowCount > 0) {
      await second.query("ROLLBACK");
      return "rejected";
    }
    await second.query("ROLLBACK");
    return "would-initialize";
  })();

  const league = (
    await first.query(
      "INSERT INTO leagues (name, active) VALUES ($1, true) RETURNING id",
      [`${marker}-initialized-league`],
    )
  ).rows[0];
  const season = (
    await first.query(
      "INSERT INTO seasons (league_id, name, start_date, end_date, active) VALUES ($1, $2, '2026-09-01', '2026-12-01', true) RETURNING id",
      [league.id, `${marker}-initialized-season`],
    )
  ).rows[0];
  initializationFixture = { league, season };
  await first.query("COMMIT");

  assert.equal(
    await blockedInitializer,
    "rejected",
    "a second initializer must detect the committed active league and season after the advisory lock releases",
  );
}

function seedCleanupCheck() {
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "@workspace/db",
      "exec",
      "tsx",
      "scripts/seed-cleanup-integration.ts",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
      },
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  await Promise.all([setup.connect(), first.connect(), second.connect()]);
  try {
    const migration = await setup.query(
      "SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'access_state'",
    );
    assert.equal(
      migration.rows[0]?.column_default,
      "'PENDING'::user_access_state",
      "migrations must establish pending access by default",
    );
    fixture = await createFixture();
    seedCleanupCheck();
    await scheduleConcurrencyCheck();
    await leagueInitializationConcurrencyCheck();
    console.info(
      "PostgreSQL integration checks: 7 passed (migration default, seed cleanup, schedule concurrency, league initialization concurrency).",
    );
  } finally {
    await first.query("ROLLBACK").catch(() => undefined);
    await second.query("ROLLBACK").catch(() => undefined);
    if (initializationFixture) {
      await setup.query("DELETE FROM seasons WHERE id = $1", [
        initializationFixture.season.id,
      ]);
      await setup.query("DELETE FROM leagues WHERE id = $1", [
        initializationFixture.league.id,
      ]);
    }
    if (fixture) {
      await setup.query("DELETE FROM games WHERE season_id = $1", [
        fixture.season.id,
      ]);
      await setup.query("DELETE FROM courts WHERE id = $1", [fixture.court.id]);
      await setup.query("DELETE FROM venues WHERE id = $1", [fixture.venue.id]);
      await setup.query("DELETE FROM teams WHERE season_id = $1", [
        fixture.season.id,
      ]);
      await setup.query("DELETE FROM seasons WHERE id = $1", [
        fixture.season.id,
      ]);
      await setup.query("DELETE FROM leagues WHERE id = $1", [
        fixture.league.id,
      ]);
    }
    await Promise.all([setup.end(), first.end(), second.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
