import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizePhoneForAuth(value: string) {
  const phone = parsePhoneNumberFromString(value.trim(), "US");
  if (!phone?.isValid() || phone.country !== "US") throw new Error("Enter a valid United States mobile number.");
  return phone.number;
}

export function canResendCode(cooldown: number, pending: boolean) {
  return cooldown === 0 && !pending;
}