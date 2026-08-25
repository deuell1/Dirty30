import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Dirty-30 accepts United States league phone numbers only and persists the
 * canonical E.164 value. Identity verification itself remains Clerk's job.
 */
export function normalizeUsPhone(value: string): string {
  const phone = parsePhoneNumberFromString(value.trim(), "US");
  if (!phone?.isValid() || phone.country !== "US") {
    throw Object.assign(new Error("Enter a valid United States mobile number"), { status: 422 });
  }

  return phone.number;
}