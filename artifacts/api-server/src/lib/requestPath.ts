export function sanitizeRequestPath(url?: string) {
  const path = url?.split("?")[0] ?? "";
  return path.replace(
    /^(\/api)?\/invitations\/[^/]+/,
    (_match, apiPrefix: string | undefined) =>
      `${apiPrefix ?? ""}/invitations/[REDACTED]`,
  );
}
