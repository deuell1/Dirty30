# Dirty-30 database schema audit

**Audit scope:** development and read-only production catalog inspection before
any database or migration changes.

**Application source of truth:** `lib/db/src/schema/index.ts` and the committed
Drizzle migrations in `lib/db/drizzle/`.

## Method

The audit compared:

- the current Drizzle schema and committed migration files;
- the development PostgreSQL catalog;
- the read-only production PostgreSQL catalog;
- the `drizzle.__drizzle_migrations` journal in each environment.

The installed Supabase connector was also checked. Its PostgREST proxy returned
`Proxy configuration error: Invalid URL`, so it was not used for writes or
treated as a reliable production catalog source. The repository documents
Supabase as the isolated integration-test database, not the application
database.

No production data or schema was modified during this audit.

## Expected application model

The current Drizzle schema defines these 11 tables:

`users`, `leagues`, `seasons`, `teams`, `team_memberships`,
`player_invitations`, `venues`, `courts`, `schedule_weeks`, `games`,
`team_byes`, and `audit_events`.

The product-required entities are present in the source model:

- users/access state;
- leagues and seasons;
- teams and memberships;
- phone invitations with persisted `intended_role`;
- canonical schedule weeks;
- games and scores;
- team byes;
- audit events.

## Observed development schema

Development currently contains:

`audit_events`, `courts`, `games`, `leagues`, `player_invitations`, `seasons`,
`team_byes`, `team_memberships`, `teams`, `users`, and `venues`.

The following current-schema objects are missing:

| Object                                   | Expected reason                                      |
| ---------------------------------------- | ---------------------------------------------------- |
| `schedule_weeks` table                   | Canonical week/date-range entity from migration 0006 |
| `games.schedule_week_id`                 | Canonical game-to-week reference                     |
| `team_byes.schedule_week_id`             | Canonical bye-to-week reference                      |
| `schedule_weeks_season_week`             | One week number per season                           |
| `schedule_weeks_id_season`               | Composite target for season-scoped foreign keys      |
| `games_schedule_week_idx`                | Schedule-week game lookup                            |
| `team_byes_schedule_week_idx`            | Schedule-week bye lookup                             |
| `schedule_weeks_season_id_seasons_id_fk` | Week-to-season referential integrity                 |
| `games_schedule_week_season_fk`          | Game week must belong to the same season             |
| `team_byes_schedule_week_season_fk`      | Bye week must belong to the same season              |
| `schedule_weeks_*` checks                | Positive week number and valid date ranges           |

All other expected application tables and the observed legacy columns are
present. The `intended_role` invitation column is present.

## Observed production schema

The read-only production catalog contains the same 11-table legacy set and the
same missing canonical schedule-week objects listed above. It also has
`player_invitations.intended_role`, `users.access_state`, and `team_byes`, so
the phone/access, bye, and persisted-invitation-role changes are present in
the schema.

Production is therefore not at the current application schema. This work does
not modify it.

## Migration journal and drift

| Environment | Journal state                                              | Finding                                                                                                                                                  |
| ----------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development | migrations 0000 through 0006 recorded                      | Journal claims 0006 is applied, but its `schedule_weeks` table, columns, indexes, checks, and foreign keys are absent                                    |
| Production  | migrations 0000 through 0002 recorded in the catalog query | The live schema includes changes represented by later committed migrations, including `intended_role`, but those later migrations are not recorded there |

The development journal discrepancy is migration drift: migration history says
the canonical schedule-week migration ran, while the catalog does not contain
its objects. The production journal discrepancy indicates manually applied or
otherwise untracked production schema changes. The exact untracked production
changes identifiable from the catalog are:

- `team_byes` and `games.schedule_week`, represented by migration 0003;
- `intended_role`, represented by migration 0005.

The production catalog does not contain the canonical schedule-week migration
0006 objects.

## Index and constraint audit

The shared legacy indexes are present in both environments, including:

- team, membership, invitation, season, game schedule, and bye indexes;
- unique user identity indexes;
- the persisted invitation token index.

The schedule-week indexes and composite foreign keys from migration 0006 are
missing in both environments. The current source schema remains the authority
for rebuilding these objects in a migration.

## Change plan after this report

1. Add a new forward-only migration that reconciles the missing canonical
   schedule-week objects without manually patching tables.
2. Add a development-only, repeatable seed command that creates realistic
   six-team beta data, including schedule weeks, byes, completed/pending/
   disputed games, invitations, memberships, and audit events.
3. Document development Clerk setup, environment variables, redirect domains,
   and test-user flow without reusing production identities.
4. Apply and validate only against development and the isolated test database.
5. Leave production data, production schema, production Clerk, DNS, and the
   production league unchanged.
