import { describe, expect, it } from "vitest";
import {
  canResendCode,
  isExistingAccountError,
  normalizePhoneForAuth,
} from "./phone-flow";

describe("phone OTP interface helpers", () => {
  it("normalizes a US mobile entry to E.164", () => {
    expect(normalizePhoneForAuth("(312) 555-0123")).toBe("+13125550123");
  });

  it("rejects incomplete and non-US phone values before requesting an SMS", () => {
    expect(() => normalizePhoneForAuth("555-0100")).toThrow(
      "valid United States mobile number",
    );
    expect(() => normalizePhoneForAuth("+44 20 7946 0018")).toThrow(
      "valid United States mobile number",
    );
  });

  it("detects Clerk's existing-account signup response", () => {
    expect(
      isExistingAccountError({
        errors: [
          {
            code: "form_identifier_exists",
            longMessage: "That phone number is already in use.",
          },
        ],
      }),
    ).toBe(true);
    expect(
      isExistingAccountError({
        errors: [
          { code: "form_param_format_invalid", message: "Invalid phone" },
        ],
      }),
    ).toBe(false);
  });

  it("allows resend only after cooldown and pending work finish", () => {
    expect(canResendCode(30, false)).toBe(false);
    expect(canResendCode(0, true)).toBe(false);
    expect(canResendCode(0, false)).toBe(true);
  });
});
