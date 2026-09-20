# Dirty-30 development environment

This guide is for a development Clerk application and a development database.
Do not point it at the production Clerk tenant, production database, or
production league.

## Development Clerk application

Create or use a separate external Clerk application for development. The
development application must have its own test/development key pair and its
own user store. Do not copy values from the production application.

In the Clerk dashboard for the external account, open the development
application and obtain:

- the development publishable key (`pk_test_...`);
- the matching development secret key (`sk_test_...`).

Store them in Replit Secrets as:

- `VITE_CLERK_DEVELOPMENT_PUBLISHABLE_KEY`;
- `CLERK_DEVELOPMENT_SECRET_KEY`.

The application selects these names only when the frontend/API runs in
development. Production continues to use `VITE_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY`.

Enable in the development application:

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

- `https://79f49f4e-ea3c-45da-8fce-c0b4301437a7-00-2onhm0tj7m7gk.worf.replit.dev`;
- `http://localhost:5173`;
- `http://localhost:3000` if using a different local frontend port;
- the matching API origin only if the Clerk dashboard requires a separate
  origin entry. Dirty-30 normally serves the API under the same origin at
  `/api`.

The Replit preview hostname can change. Check `REPLIT_DEV_DOMAIN` before
creating a new preview-specific allowed-origin entry.

Do not add the production domain to the development application. The
production external Clerk application remains restricted to
`dirty30volleyball.com`.

## Required development variables

Set the development-specific values in Replit Secrets or local environment
configuration; never commit them. Keep the production values in the
production environment and do not reuse them in preview.

| Variable                                 | Purpose                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `DATABASE_URL`                           | Development PostgreSQL connection                 |
| `SESSION_SECRET`                         | Development session/signing secret                |
| `VITE_CLERK_DEVELOPMENT_PUBLISHABLE_KEY` | Development browser publishable key               |
| `CLERK_DEVELOPMENT_SECRET_KEY`           | Development API Clerk secret key                  |
| `CLERK_PUBLISHABLE_KEY`                  | Production publishable key, unchanged             |
| `CLERK_SECRET_KEY`                       | Production secret key, unchanged                  |
| `VITE_CLERK_PUBLISHABLE_KEY`             | Production browser key, unchanged                 |
| `BOOTSTRAP_COMMISSIONER_PHONE`           | Development commissioner phone, matching the seed |
| `APP_ORIGIN`                             | Required only for production API CORS validation  |

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
