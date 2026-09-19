import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizePhoneForAuth(value: string) {
  const phone = parsePhoneNumberFromString(value.trim(), "US");
  if (!phone?.isValid() || phone.country !== "US")
    throw new Error("Enter a valid United States mobile number.");
  return phone.number;
}

type ClerkError = {
  code?: unknown;
  message?: unknown;
  longMessage?: unknown;
};

export function isExistingAccountError(error: unknown) {
  if (!error || typeof error !== "object" || !("errors" in error)) return false;
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return false;

  return errors.some((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return false;
    const clerkError = candidate as ClerkError;
    if (clerkError.code === "form_identifier_exists") return true;
    const message = [clerkError.longMessage, clerkError.message]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
    return (
      message.includes("already exists") || message.includes("already in use")
    );
  });
}

export function canResendCode(cooldown: number, pending: boolean) {
  return cooldown === 0 && !pending;
}
