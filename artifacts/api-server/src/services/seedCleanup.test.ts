import { afterEach, describe, expect, it } from "vitest";
import { isBootstrapCommissioner, SEED_CONFIRMATION } from "./seedCleanup";

describe("seed cleanup authorization guard", () => {
  const previous = process.env.BOOTSTRAP_COMMISSIONER_PHONE;

  afterEach(() => {
    if (previous === undefined) delete process.env.BOOTSTRAP_COMMISSIONER_PHONE;
    else process.env.BOOTSTRAP_COMMISSIONER_PHONE = previous;
  });

  it("requires an active commissioner and normalized bootstrap phone", () => {
    process.env.BOOTSTRAP_COMMISSIONER_PHONE = "(202) 555-0100";
    expect(
      isBootstrapCommissioner({
        role: "COMMISSIONER",
        accessState: "ACTIVE",
        phone: "+12025550100",
      }),
    ).toBe(true);
    expect(
      isBootstrapCommissioner({
        role: "COMMISSIONER",
        accessState: "PENDING",
        phone: "+12025550100",
      }),
    ).toBe(false);
    expect(
      isBootstrapCommissioner({
        role: "PLAYER",
        accessState: "ACTIVE",
        phone: "+12025550100",
      }),
    ).toBe(false);
    expect(
      isBootstrapCommissioner({
        role: "COMMISSIONER",
        accessState: "ACTIVE",
        phone: "+12025550101",
      }),
    ).toBe(false);
  });

  it("keeps the destructive confirmation exact", () => {
    expect(SEED_CONFIRMATION).toBe("DELETE DIRTY30 SEED DATA");
  });
});
