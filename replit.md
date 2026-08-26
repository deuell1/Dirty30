# Dirty-30

Mobile-first closed-beta administration for an adult recreational beer league.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run generate` — generate a reviewed migration after schema edits
- `pnpm --filter @workspace/db run migrate` — apply committed migrations to development
- `TEST_DATABASE_URL=… pnpm run test:integration` — run PostgreSQL checks against a dedicated test database only
- `pnpm verify` — generated-client drift, formatting, lint, types, unit tests, PostgreSQL integration, and production builds
- Production required env: `DATABASE_URL`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `BOOTSTRAP_COMMISSIONER_PHONE`, `APP_ORIGIN`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — Drizzle schema and committed migration source
- `lib/api-spec/openapi.yaml` — API contract; regenerated clients belong in `lib/api-client-react` and `lib/api-zod`
- `artifacts/api-server/src/routes/league.ts` — league workflow routes and transaction-protected schedule mutations
- `artifacts/dirty-30/src/` — mobile web app and guarded invitation flow

## Architecture decisions

- Verified phone identities start pending; only a matching accepted invitation promotes access to active.
- Schedule validation and writes share one transaction connection beneath a PostgreSQL advisory lock.
- `TEST_DATABASE_URL` is mandatory for destructive integration checks; never point them at development or production.

## Product

Teams, eight-position rosters, captain invitations, schedules, score reporting/review, and standings.

## User preferences

Do not expand beyond the closed-beta roster, schedule, score-reporting, and standings scope.

## Gotchas

- Do not use `drizzle-kit push` or automatic seed data in staging/production.
- The active Replit-managed Clerk tenant does not support SMS OTP; never claim a real OTP journey passed until a supported tenant completes it.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
