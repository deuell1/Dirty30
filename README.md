# Dirty-30

Dirty-30 is a mobile-first home base for an adult recreational beer league. It keeps teams, rosters, schedules, submitted scores, review status, and standings in one phone-friendly application.

## Architecture

- **Web:** React, Vite, React Query, and the existing Dirty-30 design system.
- **API:** Express with Zod request validation and server-side authorization.
- **Authentication:** Clerk phone SMS OTP. The API resolves only a verified primary Clerk phone into a local user record.
- **Database:** PostgreSQL with Drizzle ORM. All league state is persisted; the API does not use process memory for teams, rosters, games, or scores.

## Required environment

Replit provisions the following managed secrets for this workspace:

- `DATABASE_URL`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `BOOTSTRAP_COMMISSIONER_PHONE`

Set `BOOTSTRAP_COMMISSIONER_PHONE` to the normalized E.164 phone number that should become the first commissioner. That account is assigned the commissioner role only the first time it signs in with that exact verified Clerk phone. Never commit real values; `.env.example` contains a reserved test placeholder only.

### Clerk phone OTP prerequisite

Before using the beta, configure the Clerk instance to:

1. Enable phone-number sign-up and sign-in with SMS OTP.
2. Require a verified primary phone number.
3. Restrict SMS delivery to the United States.
4. Disable email, password, username, and social sign-in methods.

This workspace currently uses Replit-managed Clerk, which reports that phone/SMS sign-in is unavailable and that the relevant Dashboard settings require personal Pro access. The application intentionally shows a phone-only flow and will surface Clerk’s configuration error instead of falling back to email. Do not claim the beta is phone-login ready until the tenant supports and has enabled the settings above.

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

The seed includes four teams, captain accounts, a venue with two courts, future games, a pending phone invitation, a pending score, and finalized results. It uses reserved 202-555 development numbers only; these numbers are not production identities and are safe to run repeatedly.

## Run locally

The artifact workflows supply `PORT` and `BASE_PATH`. For normal Replit use, start the managed API and web workflows from the workspace. For a shell session:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/dirty-30 run dev
```

The unauthenticated web application presents a Clerk phone SMS OTP flow. The API health endpoint is public at `/api/healthz`; league endpoints require a valid Clerk session with a verified primary United States phone number.

## Roles and workflows

- **Commissioner:** creates and edits teams, creates/publishes schedule entries, and sees the score review queue.
- **Captain:** manages invitations for their own team and submits, confirms, or disputes scores involving their team.
- **Player:** has access to the league schedule, rosters, and standings.

Rosters are constrained to exactly 8 occupied positions: each active membership and each non-expired pending invitation consumes one position. Invitations are token-hashed, expire after seven days, are matched only to the invited normalized E.164 phone, and prevent duplicate pending invitations for the same team/phone pair. Phone numbers are returned only to the commissioner or that team’s captain. Mutating API actions create audit records.

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

For authentication checks, use Clerk’s documented test-phone and test-code configuration in a supported test instance. Do not send real SMS during automated verification and do not treat Dirty-30’s reserved development fixture numbers as Clerk test credentials.

## Deployment

Use the managed artifact deployment. It supplies service routing and environment secrets; do not use a local filesystem or in-memory process state for production data. Before publishing, validate the deployment database schema through Replit’s Publish flow, configure the production Clerk tenant for the required phone OTP settings, and confirm a verified-phone sign-in for the intended commissioner.