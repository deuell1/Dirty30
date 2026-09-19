import { describe, expect, it } from "vitest";
import { sanitizeRequestPath } from "./requestPath";

describe("request path logging", () => {
  it("redacts invitation tokens from lookup and acceptance URLs", () => {
    expect(sanitizeRequestPath("/api/invitations/secret-token")).toBe(
      "/api/invitations/[REDACTED]",
    );
    expect(
      sanitizeRequestPath("/api/invitations/secret-token/accept?retry=true"),
    ).toBe("/api/invitations/[REDACTED]/accept");
  });

  it("preserves non-token request paths", () => {
    expect(sanitizeRequestPath("/api/teams/3/invitations")).toBe(
      "/api/teams/3/invitations",
    );
  });
});
