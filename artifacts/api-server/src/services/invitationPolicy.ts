export type InvitationState = {
  status: "PENDING" | "ACCEPTED" | "CANCELLED" | "EXPIRED";
  expiresAt: Date;
};

export type InvitationFailure = {
  status: 409 | 410;
  message: string;
};

export function invitationFailure(
  invitation: InvitationState | undefined,
  now = new Date(),
): InvitationFailure | undefined {
  if (!invitation) {
    return { status: 410, message: "Invitation is invalid" };
  }
  if (invitation.status === "ACCEPTED") {
    return { status: 409, message: "Invitation was already accepted" };
  }
  if (
    invitation.status === "EXPIRED" ||
    (invitation.status === "PENDING" && invitation.expiresAt <= now)
  ) {
    return { status: 410, message: "Invitation has expired" };
  }
  if (invitation.status !== "PENDING") {
    return { status: 410, message: "Invitation is no longer active" };
  }
  return undefined;
}

export function invitationIntendedRole(
  invitedByRole: "COMMISSIONER" | "CAPTAIN" | "PLAYER",
  teamHasCaptain: boolean,
) {
  return invitedByRole === "COMMISSIONER" && !teamHasCaptain
    ? ("CAPTAIN" as const)
    : ("PLAYER" as const);
}
