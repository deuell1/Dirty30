# Dirty-30

Dirty-30 is a mobile-first home base for an adult recreational beer league. It keeps teams, rosters, schedules, submitted scores, review status, and standings in one phone-friendly application.

## Architecture

- **Web:** React, Vite, React Query, and the existing Dirty-30 design system.
- **API:** Express with Zod request validation and server-side authorization.
- **Authentication:** Replit-managed Clerk. The API resolves the authenticated Clerk identity into a local user record on first sign-in.
- **Database:** PostgreSQL with Drizzle ORM. All league state is persisted; the API does not use process memory for teams, rosters, games, or scores.

## Required environment

Replit provisions the following managed secrets for this workspace:

- `DATABASE_URL`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `BOOTSTRAP_COMMISSIONER_EMAIL`

Set `BOOTSTRAP_COMMISSIONER_EMAIL` to the email address that should become the first commissioner. That account is assigned the commissioner role the first time it signs in. Never commit real values; `.env.example` contains safe placeholders only.

## Database setup

Generate a reviewed migration after changing the Drizzle schema:

```bash
pnpm --filter @workspace/db run generate
```

Apply the schema to the configured development database:

```bash
pnpm --filter @workspace/db run push
```

Load the idempotent Summer 2026 development fixture:

```bash
pnpm --filter @workspace/db run seed
```

The seed includes four teams, captain accounts, a venue with two courts, future games, a pending score, and finalized results. It is safe to run repeatedly.

## Run locally

The artifact workflows supply `PORT` and `BASE_PATH`. For normal Replit use, start the managed API and web workflows from the workspace. For a shell session:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/dirty-30 run dev
```

The unauthenticated web application presents Clerk sign-in. The API health endpoint is public at `/api/healthz`; league endpoints require a valid Clerk session.

## Roles and workflows

- **Commissioner:** creates and edits teams, creates/publishes schedule entries, and sees the score review queue.
- **Captain:** manages invitations for their own team and submits, confirms, or disputes scores involving their team.
- **Player:** has access to the league schedule, rosters, and standings.

Rosters are constrained to exactly 8 occupied positions: each active membership and each non-expired pending invitation consumes one position. Invitations are token-hashed, expire after seven days, and prevent duplicate pending invitations for the same team/email pair. Mutating API actions create audit records.

## Validation

```bash
pnpm run typecheck
PORT=5173 BASE_PATH=/dirty-30 pnpm --filter @workspace/dirty-30 run build
PORT=3001 pnpm --filter @workspace/api-server run build
```

After a schema change, rerun the migration generation and seed commands above. The OpenAPI contract remains the source for generated React Query hooks and Zod validators:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Deployment

Use the managed artifact deployment. It supplies service routing and environment secrets; do not use a local filesystem or in-memory process state for production data. Before publishing, validate the deployment database schema against the production environment and confirm Clerk sign-in with the intended commissioner email.