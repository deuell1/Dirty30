import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("captain invitation migration", () => {
  it("backfills only the earliest live pending invite per captainless team", () => {
    const migration = readFileSync(
      new URL(
        "../../../../lib/db/drizzle/0005_careful_kabuki.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toContain(`invitation."expires_at" > NOW()`);
    expect(migration).toContain(`DISTINCT ON (invitation."team_id")`);
    expect(migration).toContain(
      `ORDER BY invitation."team_id", invitation."created_at", invitation."id"`,
    );
  });
});
