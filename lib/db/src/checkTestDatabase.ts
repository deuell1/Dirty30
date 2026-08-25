import pg from "pg";
import { getTestDatabaseUrl } from "./testDatabaseUrl";

const { Pool } = pg;
const pool = new Pool({
  connectionString: getTestDatabaseUrl(),
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  const result = await pool.query<{ ok: number }>("select 1::int as ok");

  if (result.rows[0]?.ok !== 1) {
    throw new Error("The test database returned an unexpected result.");
  }

  console.log("TEST_DATABASE_URL connection succeeded.");
} catch (error) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "UNKNOWN";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`TEST_DATABASE_URL connection failed [${code}]: ${message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
