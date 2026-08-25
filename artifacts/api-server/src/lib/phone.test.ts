import { describe, expect, it } from "vitest";
import { normalizeUsPhone } from "./phone";

describe("normalizeUsPhone", () => {
  it("stores United States phones as E.164", () => {
    expect(normalizeUsPhone("(312) 555-0123")).toBe("+13125550123");
    expect(normalizeUsPhone("+1 312 555 0123")).toBe("+13125550123");
  });

  it("rejects invalid or non-US values before they reach identity or invitations", () => {
    expect(() => normalizeUsPhone("555-0100")).toThrow("valid United States mobile number");
    expect(() => normalizeUsPhone("+44 20 7946 0018")).toThrow("valid United States mobile number");
  });
});