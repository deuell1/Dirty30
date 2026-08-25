# Dirty-30

Dirty-30 is a mobile-first home base for one recreational adult beer league. It brings together teams, rosters, game-night schedule, score review, and standings in a phone-friendly interface.

## Run locally

The web app and API are managed as separate services:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/dirty-30 run dev
```

Then open the app preview. The API health endpoint is available at `/api/healthz`.

## Development data

The initial beta includes a realistic Dirty-30 Summer 2026 fixture set:

- Hops & Dreams
- Pitch Please
- Ale Stars
- The Keg Stands

It is intentionally small so every required screen has meaningful data on day one. The standings endpoint derives ranks from finalized game scores only, and score submissions are reflected in the review queue.

## Validation

Run the full TypeScript check:

```bash
pnpm run typecheck
```

Regenerate typed client and server validators after updating `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Production hardening checklist

Before opening the beta to a live league, move the seeded development dataset into the configured PostgreSQL schema and use the provisioned Clerk tenant for live email/password accounts. That production pass should enforce role membership in API handlers, persist audit events, and run the roster, scheduling, score-dispute, and standings test cases described in the product brief.

## Deployment

Publish the Dirty-30 web artifact after the production database and authentication pass is complete. The managed app services already bind through the platform routing layer, so no user data should be stored on a deployment filesystem.

Dirty-30 exists to alleviate the typical headaches of organizing an hour away from family for adult recreational sports.
