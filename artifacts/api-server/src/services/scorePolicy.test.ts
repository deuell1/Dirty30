import { describe, expect, it } from "vitest";
import { canCommissionerDirectScore } from "./scorePolicy";

describe("commissioner direct-score policy", () => {
  it("allows a published game to receive an official score", () => {
    expect(canCommissionerDirectScore("PUBLISHED")).toBe(true);
  });

  it("allows a final score to be corrected", () => {
    expect(canCommissionerDirectScore("FINAL")).toBe(true);
  });

  it.each(["DRAFT", "CANCELLED", "PENDING_CONFIRMATION", "DISPUTED"])("rejects direct score entry for %s games", (status) => {
    expect(canCommissionerDirectScore(status)).toBe(false);
  });
});