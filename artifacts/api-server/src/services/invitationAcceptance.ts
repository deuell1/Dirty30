import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  db,
  playerInvitations,
  seasons,
  teamMemberships,
  teams,
  users,
} from "@workspace/db";
import { invitationFailure } from "./invitationPolicy";
import { lockRoster, requireRosterSlot } from "./rosterCapacity";

type AcceptanceActor = {
  id: number;
  phone: string | null;
};

export async function acceptInvitationTransaction(
  tokenHash: string,
  actor: AcceptanceActor,
  onLookup?: (found: boolean) => void,
  database: typeof db = db,
) {
  return database.transaction(async (tx) => {
    const invitation = await tx.query.playerInvitations.findFirst({
      where: eq(playerInvitations.tokenHash, tokenHash),
    });
    onLookup?.(Boolean(invitation));
    const failure = invitationFailure(invitation);
    if (failure)
      throw Object.assign(new Error(failure.message), {
        status: failure.status,
      });
    if (!invitation)
      throw Object.assign(new Error("Invitation is invalid"), { status: 410 });
    if (invitation.invitedPhone !== actor.phone)
      throw Object.assign(
        new Error(
          "This invitation belongs to a different verified phone number",
        ),
        { status: 403 },
      );

    return lockRoster(tx, invitation.teamId, async () => {
      const membershipRole = invitation.intendedRole;
      if (membershipRole === "CAPTAIN") {
        const currentCaptain = await tx.query.teamMemberships.findFirst({
          where: and(
            eq(teamMemberships.teamId, invitation.teamId),
            eq(teamMemberships.membershipRole, "CAPTAIN"),
            eq(teamMemberships.active, true),
          ),
        });
        if (currentCaptain && currentCaptain.userId !== actor.id)
          throw Object.assign(new Error("This team already has a captain"), {
            status: 409,
          });
      }

      const [updated] = await tx
        .update(playerInvitations)
        .set({ status: "ACCEPTED", acceptedAt: new Date() })
        .where(
          and(
            eq(playerInvitations.id, invitation.id),
            eq(playerInvitations.status, "PENDING"),
          ),
        )
        .returning();
      if (!updated)
        throw Object.assign(new Error("Invitation was already accepted"), {
          status: 409,
        });

      await requireRosterSlot(tx, invitation.teamId);
      const existing = await tx.query.teamMemberships.findFirst({
        where: and(
          eq(teamMemberships.teamId, invitation.teamId),
          eq(teamMemberships.userId, actor.id),
          eq(teamMemberships.active, true),
        ),
      });
      if (!existing)
        await tx.insert(teamMemberships).values({
          teamId: invitation.teamId,
          userId: actor.id,
          membershipRole,
        });
      else if (existing.membershipRole !== membershipRole)
        await tx
          .update(teamMemberships)
          .set({ membershipRole })
          .where(eq(teamMemberships.id, existing.id));

      await tx
        .update(users)
        .set({
          accessState: "ACTIVE",
          active: true,
          ...(membershipRole === "CAPTAIN" ? { role: "CAPTAIN" as const } : {}),
        })
        .where(eq(users.id, actor.id));

      const [league] = await tx
        .select({ id: seasons.leagueId })
        .from(teams)
        .innerJoin(seasons, eq(seasons.id, teams.seasonId))
        .where(eq(teams.id, invitation.teamId))
        .limit(1);
      if (!league) throw new Error("Invitation team has no league");
      await tx.insert(auditEvents).values({
        leagueId: league.id,
        actorUserId: actor.id,
        entityType: "invitation",
        entityId: updated.id,
        action: "ACCEPTED",
        afterData: { userId: actor.id, membershipRole },
      });
      return { ...updated, membershipRole };
    });
  });
}
