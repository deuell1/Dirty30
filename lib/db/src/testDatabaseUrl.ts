export function getTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.TEST_DATABASE_URL?.trim();

  if (!raw) {
    throw new Error(
      "TEST_DATABASE_URL must be set to an isolated PostgreSQL test database.",
    );
  }

  if (env.DATABASE_URL?.trim() === raw) {
    throw new Error(
      "TEST_DATABASE_URL must not be the same value as DATABASE_URL.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use postgres:// or postgresql://.");
  }

  const isSupabaseDirect =
    parsed.hostname.startsWith("db.") &&
    parsed.hostname.endsWith(".supabase.co");
  const isSupabasePooler = parsed.hostname.endsWith(
    ".pooler.supabase.com",
  );

  if (isSupabaseDirect) {
    throw new Error(
      "Use the Supabase Session Pooler URL in Replit; the direct Supabase endpoint normally requires IPv6.",
    );
  }

  if (isSupabasePooler) {
    if (parsed.port !== "5432") {
      throw new Error(
        "Dirty-30 tests require the Supabase Session Pooler on port 5432, not transaction mode on port 6543.",
      );
    }

    if (!decodeURIComponent(parsed.username).startsWith("postgres.")) {
      throw new Error(
        "The Supabase pooler username must use postgres.<project-ref>.",
      );
    }

    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
  }

  return parsed.toString();
}
