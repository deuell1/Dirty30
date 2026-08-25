import { describe, expect, it } from "vitest";
import { MAX_ROSTER_POSITIONS, occupiedRosterPositions, RosterCapacityError } from "./rosterCapacity";

describe("roster capacity rules", () => {
  it("counts active memberships toward the eight occupied positions", () => {
    expect(occupiedRosterPositions(8, 0)).toBe(MAX_ROSTER_POSITIONS);
  });

  it("counts pending invitations toward the eight occupied positions", () => {
    expect(occupiedRosterPositions(7, 1)).toBe(MAX_ROSTER_POSITIONS);
  });

  it("frees a position after an invitation is cancelled, expired, or accepted", () => {
    expect(occupiedRosterPositions(7, 0)).toBeLessThan(MAX_ROSTER_POSITIONS);
  });

  it("uses a conflict response for a ninth occupied position", () => {
    const error = new RosterCapacityError();
    expect(error.status).toBe(409);
    expect(error.message).toContain("at most 8");
  });
});