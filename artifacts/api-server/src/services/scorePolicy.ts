export function canCommissionerDirectScore(status: string) {
  return status === "PUBLISHED" || status === "FINAL";
}