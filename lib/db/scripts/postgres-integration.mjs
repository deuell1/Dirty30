import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
let invitationFixture;
let drizzlePool;

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

async function byePersistenceCheck() {
  const inserted = (
    await setup.query(
      "INSERT INTO team_byes (season_id, team_id, schedule_week, play_date, source) VALUES ($1, $2, 1, '2026-06-01', 'MANUAL') RETURNING id",
      [fixture.season.id, fixture.home.id],
    )
  ).rows[0];
  assert.ok(inserted?.id, "a bye row should be insertable");
  await assert.rejects(
    setup.query(
      "INSERT INTO team_byes (season_id, team_id, schedule_week, play_date, source) VALUES ($1, $2, 1, '2026-06-01', 'MANUAL')",
      [fixture.season.id, fixture.home.id],
    ),
    /duplicate key|unique/i,
    "season/team/week must be unique",
  );
  const existingGame = await setup.query(
    "SELECT schedule_week, home_team_id, away_team_id, venue_id, court_id, scheduled_at, status FROM games WHERE season_id = $1 ORDER BY id LIMIT 1",
    [fixture.season.id],
  );
  assert.equal(existingGame.rows[0]?.schedule_week, null);
  assert.equal(existingGame.rows[0]?.home_team_id, fixture.home.id);
  assert.equal(existingGame.rows[0]?.away_team_id, fixture.away.id);
}

async function scheduleWeekMigrationBackfillCheck() {
  await setup.query(`
    CREATE TEMP TABLE schedule_weeks (
      id serial PRIMARY KEY,
      season_id integer NOT NULL,
      week_number integer NOT NULL,
      play_date date NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL
    );
    CREATE UNIQUE INDEX temp_schedule_weeks_season_week
      ON schedule_weeks (season_id, week_number);
    CREATE TEMP TABLE games (
      id serial PRIMARY KEY,
      season_id integer NOT NULL,
      scheduled_at timestamptz NOT NULL,
      schedule_week integer,
      schedule_week_id integer,
      home_team_id integer NOT NULL,
      away_team_id integer NOT NULL,
      court_id integer NOT NULL,
      status text NOT NULL,
      home_score integer,
      away_score integer
    );
    CREATE TEMP TABLE team_byes (
      id serial PRIMARY KEY,
      season_id integer NOT NULL,
      team_id integer NOT NULL,
      schedule_week integer NOT NULL,
      schedule_week_id integer,
      play_date date NOT NULL,
      source text NOT NULL
    );
  `);
  await setup.query(
    `INSERT INTO games
      (season_id, scheduled_at, schedule_week, home_team_id, away_team_id,
       court_id, status, home_score, away_score)
     VALUES
      (99, '2026-09-02T23:00:00Z', 1, 10, 11, 20, 'FINAL', 21, 18),
      (99, '2026-09-04T23:30:00Z', NULL, 12, 13, 21, 'PUBLISHED', NULL, NULL),
      (99, '2026-09-15T23:00:00Z', NULL, 10, 13, 20, 'DRAFT', NULL, NULL),
      (99, '2026-09-17T23:00:00Z', NULL, 11, 12, 21, 'PENDING_CONFIRMATION', 14, 14);
     INSERT INTO team_byes
      (season_id, team_id, schedule_week, play_date, source)
     VALUES (99, 14, 1, '2026-09-02', 'MANUAL');`,
  );
  const before = (
    await setup.query(
      `SELECT id, scheduled_at, schedule_week, home_team_id, away_team_id,
              court_id, status, home_score, away_score
       FROM games ORDER BY id`,
    )
  ).rows;
  const migrationSql = await readFile(
    new URL("../drizzle/0006_amused_cardiac.sql", import.meta.url),
    "utf8",
  );
  const backfillStart = migrationSql.indexOf("WITH numbered_days AS (");
  const backfillEnd = migrationSql.indexOf(
    'ALTER TABLE "games" ADD CONSTRAINT',
  );
  assert.ok(backfillStart >= 0 && backfillEnd > backfillStart);
  await setup.query("BEGIN");
  for (const statement of migrationSql
    .slice(backfillStart, backfillEnd)
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await setup.query(statement);
  }
  const after = (
    await setup.query(
      `SELECT id, scheduled_at, schedule_week, schedule_week_id, home_team_id,
              away_team_id, court_id, status, home_score, away_score
       FROM games ORDER BY id`,
    )
  ).rows;
  assert.deepEqual(
    after.map(({ schedule_week_id: _id, ...row }) => row),
    before,
    "the backfill must preserve every legacy game field",
  );
  assert.ok(after.every((row) => row.schedule_week_id));
  assert.equal(after[0].schedule_week_id, after[1].schedule_week_id);
  assert.equal(after[2].schedule_week_id, after[3].schedule_week_id);
  assert.notEqual(after[0].schedule_week_id, after[2].schedule_week_id);
  const weeks = await setup.query(
    `SELECT week_number,
            to_char(play_date, 'YYYY-MM-DD') AS play_date,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date
     FROM schedule_weeks ORDER BY week_number`,
  );
  assert.deepEqual(weeks.rows, [
    {
      week_number: 1,
      play_date: "2026-09-02",
      start_date: "2026-08-31",
      end_date: "2026-09-06",
    },
    {
      week_number: 2,
      play_date: "2026-09-15",
      start_date: "2026-09-14",
      end_date: "2026-09-20",
    },
  ]);
  const bye = (
    await setup.query(
      `SELECT schedule_week, schedule_week_id,
              to_char(play_date, 'YYYY-MM-DD') AS play_date,
              team_id, source
       FROM team_byes`,
    )
  ).rows[0];
  assert.deepEqual(bye, {
    schedule_week: 1,
    schedule_week_id: after[0].schedule_week_id,
    play_date: "2026-09-02",
    team_id: 14,
    source: "MANUAL",
  });
  await setup.query("ROLLBACK");
  await setup.query("DROP TABLE games, team_byes, schedule_weeks");
}

async function invitationAcceptanceCheck() {
  const commissioner = (
    await setup.query(
      "INSERT INTO users (external_auth_id, phone, role, access_state, active) VALUES ($1, '+13125550001', 'COMMISSIONER', 'ACTIVE', true) RETURNING id",
      [`${marker}-commissioner`],
    )
  ).rows[0];
  const captain = (
    await setup.query(
      "INSERT INTO users (external_auth_id, phone, role, access_state, active) VALUES ($1, '+13125550002', 'PLAYER', 'PENDING', true) RETURNING id",
      [`${marker}-captain`],
    )
  ).rows[0];
  const player = (
    await setup.query(
      "INSERT INTO users (external_auth_id, phone, role, access_state, active) VALUES ($1, '+13125550003', 'PLAYER', 'PENDING', true) RETURNING id",
      [`${marker}-player`],
    )
  ).rows[0];
  const captainInvitation = (
    await setup.query(
      "INSERT INTO player_invitations (team_id, invited_phone, invited_by_user_id, token_hash, intended_role, expires_at) VALUES ($1, '+13125550002', $2, $3, 'CAPTAIN', NOW() + interval '1 day') RETURNING id",
      [fixture.home.id, commissioner.id, `${marker}-captain-token-hash`],
    )
  ).rows[0];
  const playerInvitation = (
    await setup.query(
      "INSERT INTO player_invitations (team_id, invited_phone, invited_by_user_id, token_hash, intended_role, expires_at) VALUES ($1, '+13125550003', $2, $3, 'PLAYER', NOW() + interval '1 day') RETURNING id",
      [fixture.home.id, commissioner.id, `${marker}-player-token-hash`],
    )
  ).rows[0];
  const expiredInvitation = (
    await setup.query(
      "INSERT INTO player_invitations (team_id, invited_phone, invited_by_user_id, token_hash, intended_role, expires_at) VALUES ($1, '+13125550003', $2, $3, 'PLAYER', NOW() - interval '1 day') RETURNING id",
      [fixture.away.id, commissioner.id, `${marker}-expired-token-hash`],
    )
  ).rows[0];
  invitationFixture = {
    commissioner,
    captain,
    player,
    invitations: [captainInvitation, playerInvitation, expiredInvitation],
  };

  process.env.DATABASE_URL = testDatabaseUrl;
  const [{ acceptInvitationTransaction }, workspaceDb] = await Promise.all([
    import("../../../artifacts/api-server/src/services/invitationAcceptance.ts"),
    import("@workspace/db"),
  ]);
  drizzlePool = workspaceDb.pool;
  await acceptInvitationTransaction(`${marker}-captain-token-hash`, {
    id: captain.id,
    phone: "+13125550002",
  });
  await acceptInvitationTransaction(`${marker}-player-token-hash`, {
    id: player.id,
    phone: "+13125550003",
  });

  const states = await Promise.all([
    setup.query(
      "SELECT i.status, i.accepted_at, m.membership_role, u.role, u.access_state, a.action FROM player_invitations i JOIN team_memberships m ON m.team_id = i.team_id AND m.user_id = $2 JOIN users u ON u.id = m.user_id JOIN audit_events a ON a.entity_type = 'invitation' AND a.entity_id = i.id WHERE i.id = $1",
      [captainInvitation.id, captain.id],
    ),
    setup.query(
      "SELECT i.status, i.accepted_at, m.membership_role, u.role, u.access_state, a.action FROM player_invitations i JOIN team_memberships m ON m.team_id = i.team_id AND m.user_id = $2 JOIN users u ON u.id = m.user_id JOIN audit_events a ON a.entity_type = 'invitation' AND a.entity_id = i.id WHERE i.id = $1",
      [playerInvitation.id, player.id],
    ),
  ]);
  assert.deepEqual(
    states
      .map(({ rows }) => ({
        ...rows[0],
      }))
      .map((row) => ({
        status: row.status,
        accepted: Boolean(row.accepted_at),
        membershipRole: row.membership_role,
        userRole: row.role,
        accessState: row.access_state,
        auditAction: row.action,
      })),
    [
      {
        status: "ACCEPTED",
        accepted: true,
        membershipRole: "CAPTAIN",
        userRole: "CAPTAIN",
        accessState: "ACTIVE",
        auditAction: "ACCEPTED",
      },
      {
        status: "ACCEPTED",
        accepted: true,
        membershipRole: "PLAYER",
        userRole: "PLAYER",
        accessState: "ACTIVE",
        auditAction: "ACCEPTED",
      },
    ],
  );
  await assert.rejects(
    acceptInvitationTransaction(`${marker}-captain-token-hash`, {
      id: captain.id,
      phone: "+13125550002",
    }),
    (error) => error?.status === 409,
    "an accepted invitation cannot be applied twice",
  );
  await assert.rejects(
    acceptInvitationTransaction(`${marker}-expired-token-hash`, {
      id: player.id,
      phone: "+13125550003",
    }),
    (error) => error?.status === 410,
    "an expired invitation must be rejected",
  );
  await assert.rejects(
    acceptInvitationTransaction(`${marker}-missing-token-hash`, {
      id: player.id,
      phone: "+13125550003",
    }),
    (error) => error?.status === 410,
    "an invalid invitation must be rejected",
  );
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
    await scheduleWeekMigrationBackfillCheck();
    await scheduleConcurrencyCheck();
    await byePersistenceCheck();
    await invitationAcceptanceCheck();
    await leagueInitializationConcurrencyCheck();
    console.info(
      "PostgreSQL integration checks: 6 passed (migration default, schedule week backfill, schedule concurrency, bye persistence, invitation acceptance, league initialization concurrency).",
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
      if (invitationFixture) {
        await setup.query(
          "DELETE FROM audit_events WHERE entity_type = 'invitation' AND entity_id = ANY($1::int[])",
          [invitationFixture.invitations.map((invitation) => invitation.id)],
        );
        await setup.query(
          "DELETE FROM team_memberships WHERE user_id = ANY($1::int[])",
          [[invitationFixture.captain.id, invitationFixture.player.id]],
        );
        await setup.query(
          "DELETE FROM player_invitations WHERE id = ANY($1::int[])",
          [invitationFixture.invitations.map((invitation) => invitation.id)],
        );
        await setup.query("DELETE FROM users WHERE id = ANY($1::int[])", [
          [
            invitationFixture.captain.id,
            invitationFixture.player.id,
            invitationFixture.commissioner.id,
          ],
        ]);
      }
      await setup.query("DELETE FROM team_byes WHERE season_id = $1", [
        fixture.season.id,
      ]);
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
    await drizzlePool?.end().catch(() => undefined);
    await Promise.all([setup.end(), first.end(), second.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
