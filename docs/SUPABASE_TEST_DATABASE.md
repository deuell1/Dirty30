# Supabase test database

Dirty-30 uses Supabase only as an isolated PostgreSQL target for destructive integration tests. Application authentication remains Clerk.

## Replit secret

In Supabase, open the test project and select **Connect → Session pooler**. Copy the connection URI that uses port `5432`, replace the password placeholder, and store it in Replit Secrets as `TEST_DATABASE_URL`.

Do not use:

- the Supabase direct `db.<project-ref>.supabase.co` endpoint, which normally requires IPv6;
- transaction pooler port `6543`, which is incompatible with the session behavior and advisory locks used by the test suite;
- the same connection string as `DATABASE_URL`;
- a production database.

The repository never stores the real URL or password.

## Verification

From the Replit shell:

```sh
pnpm --filter @workspace/db run test:connection
pnpm --filter @workspace/db run migrate:test
```

The connection check prints only success or a sanitized error. It never prints the connection string.

If authentication fails, reset the Supabase database password and replace the complete Replit secret. The pooler username must be `postgres.<project-ref>`.
