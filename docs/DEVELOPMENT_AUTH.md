# Dirty-30 development environment

This guide is for a development Clerk application and a development database.
Do not point it at the production Clerk tenant, production database, or
production league.

## Development Clerk application

Create or use a separate Clerk application for development. Enable:

- phone number sign-up;
- phone number sign-in;
- SMS verification;
- verified primary phone numbers.

The application uses custom inline Clerk phone flows, not hosted Clerk
`/sign-in` or `/sign-up` pages. It preserves invitation paths in browser
session storage and resumes `/invite/<token>` after the Clerk session becomes
active.

### Allowed development domains

Add the domains used by the development preview to the development Clerk
application:

- the current Replit development domain from `REPLIT_DEV_DOMAIN`;
- `http://localhost:5173` when running Vite locally;
- the local API origin if the Clerk dashboard requests one.

Do not add the production domain to the development application. The
production external Clerk application remains restricted to
`dirty30volleyball.com`.

## Required development variables

Set these in the development environment. Keep real values in Replit Secrets
or local environment configuration; never commit them.

| Variable                       | Purpose                                           |
| ------------------------------ | ------------------------------------------------- |
| `DATABASE_URL`                 | Development PostgreSQL connection                 |
| `SESSION_SECRET`               | Development session/signing secret                |
| `CLERK_PUBLISHABLE_KEY`        | Server-side Clerk configuration when needed       |
| `CLERK_SECRET_KEY`             | API server Clerk client                           |
| `VITE_CLERK_PUBLISHABLE_KEY`   | Browser Clerk publishable key                     |
| `BOOTSTRAP_COMMISSIONER_PHONE` | Development commissioner phone, matching the seed |
| `APP_ORIGIN`                   | Required only for production API CORS validation  |

`TEST_DATABASE_URL` is separate and is reserved for destructive PostgreSQL
integration tests. It must never equal `DATABASE_URL`.

## Development data setup

Run the migration and repeatable development fixture:

```sh
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/db run seed
```

The seed command requires development mode, runs in a transaction, and removes
only the prior `seed_` users plus the named development league before rebuilding
the fixture. It does not use production users or Clerk IDs.

The command prints the deterministic invitation path and its development test
phone. The seed invitation is:

```text
/invite/seed-player-invite-token
+12025550300
```

Create a separate development Clerk user with that phone, complete phone
verification, open the invitation path, and accept it. The API will link the
new development Clerk identity to the seeded pending user by verified phone and
promote access to `ACTIVE`.

For the seeded commissioner, use the development Clerk account with
`+12025550100`. The API bootstrap rule grants that phone commissioner access in
development. Seeded captain and player records are database fixtures; they are
not production Clerk accounts.

## Reset instructions

The seed is the safe reset path for the fixture:

```sh
pnpm --filter @workspace/db run seed:development
```

To rebuild a dedicated clean database from migrations only, use a database
connection intended for destructive testing, never production:

```sh
TEST_DATABASE_URL=... pnpm --filter @workspace/db run migrate:test
```

The integration suite owns its isolated test schema and must continue to use
`TEST_DATABASE_URL`.
