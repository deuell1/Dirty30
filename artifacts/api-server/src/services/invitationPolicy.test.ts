import { describe, expect, it } from "vitest";
import { invitationFailure, invitationIntendedRole } from "./invitationPolicy";

const future = new Date("2026-10-01T00:00:00.000Z");
const now = new Date("2026-09-19T00:00:00.000Z");

describe("captain invitation acceptance policy", () => {
  it("assigns an existing authenticated user as the first captain", () => {
    expect(invitationIntendedRole("COMMISSIONER", false)).toBe("CAPTAIN");
  });

  it("assigns a newly authenticated user as the first captain", () => {
    expect(invitationIntendedRole("COMMISSIONER", false)).toBe("CAPTAIN");
  });

  it("keeps later and captain-created roster invitations as players", () => {
    expect(invitationIntendedRole("COMMISSIONER", true)).toBe("PLAYER");
    expect(invitationIntendedRole("CAPTAIN", false)).toBe("PLAYER");
  });

  it("reports an invalid invitation", () => {
    expect(invitationFailure(undefined, now)).toEqual({
      status: 410,
      message: "Invitation is invalid",
    });
  });

  it("reports an expired invitation", () => {
    expect(
      invitationFailure(
        { status: "PENDING", expiresAt: new Date("2026-09-18T00:00:00.000Z") },
        now,
      ),
    ).toEqual({ status: 410, message: "Invitation has expired" });
  });

  it("handles an already accepted invitation without accepting twice", () => {
    expect(
      invitationFailure({ status: "ACCEPTED", expiresAt: future }, now),
    ).toEqual({ status: 409, message: "Invitation was already accepted" });
  });
});
