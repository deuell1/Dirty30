import { and, eq, gt, sql } from "drizzle-orm";
import { playerInvitations, teamMemberships } from "@workspace/db";

export const MAX_ROSTER_POSITIONS = 8;

export class RosterCapacityError extends Error {
  readonly status = 409;
  constructor() {
    super(`Team roster is full. A team may have at most ${MAX_ROSTER_POSITIONS} occupied positions.`);
  }
}

export function occupiedRosterPositions(activeMemberships: number, pendingInvitations: number) {
  return activeMemberships + pendingInvitations;
}

type Transaction = Parameters<Parameters<typeof import("@workspace/db").db.transaction>[0]>[0];

export async function lockRoster<T>(
  tx: Transaction,
  teamId: number,
  action: () => Promise<T>,
): Promise<T> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${teamId})`);
  await tx.update(playerInvitations)
    .set({ status: "EXPIRED" })
    .where(and(eq(playerInvitations.teamId, teamId), eq(playerInvitations.status, "PENDING"), sql`${playerInvitations.expiresAt} <= NOW()`));
  return action();
}

export async function requireRosterSlot(tx: Transaction, teamId: number) {
  const [memberCount, pendingCount] = await Promise.all([
    tx.select({ count: sql<number>`count(*)` }).from(teamMemberships).where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.active, true))),
    tx.select({ count: sql<number>`count(*)` }).from(playerInvitations).where(and(eq(playerInvitations.teamId, teamId), eq(playerInvitations.status, "PENDING"), gt(playerInvitations.expiresAt, new Date()))),
  ]);
  const occupied = occupiedRosterPositions(Number(memberCount[0]?.count ?? 0), Number(pendingCount[0]?.count ?? 0));
  if (occupied >= MAX_ROSTER_POSITIONS) throw new RosterCapacityError();
}