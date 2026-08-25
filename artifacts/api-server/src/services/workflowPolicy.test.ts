import { describe, expect, it } from "vitest";
import { auditActionForScore, calculateStandings, canManageRoster, hasRosterCapacity, isGameVisibleToRole, nextScoreState, schedulesConflict } from "./workflowPolicy";

describe("role-aware league workflows", () => {
  it("keeps roster management with commissioners and a captain's own team", () => {
    expect(canManageRoster("COMMISSIONER", false)).toBe(true);
    expect(canManageRoster("CAPTAIN", true)).toBe(true);
    expect(canManageRoster("CAPTAIN", false)).toBe(false);
    expect(canManageRoster("PLAYER", true)).toBe(false);
  });

  it("keeps draft games commissioner-only", () => {
    expect(isGameVisibleToRole(false, "COMMISSIONER")).toBe(true);
    expect(isGameVisibleToRole(false, "CAPTAIN")).toBe(false);
    expect(isGameVisibleToRole(true, "PLAYER")).toBe(true);
  });

  it("counts pending invitations when protecting all eight roster positions", () => {
    expect(hasRosterCapacity(7, 0)).toBe(true);
    expect(hasRosterCapacity(7, 1)).toBe(false);
    expect(hasRosterCapacity(8, 0)).toBe(false);
  });
});

describe("schedule and score acceptance policy", () => {
  it("blocks a shared team or court inside the 90-minute game window", () => {
    const existing = { startsAt: new Date("2026-08-25T19:00:00Z"), homeTeamId: 1, awayTeamId: 2, courtId: 10 };
    expect(schedulesConflict(existing, { startsAt: new Date("2026-08-25T20:00:00Z"), homeTeamId: 3, awayTeamId: 4, courtId: 10 })).toBe(true);
    expect(schedulesConflict(existing, { startsAt: new Date("2026-08-25T20:00:00Z"), homeTeamId: 2, awayTeamId: 4, courtId: 11 })).toBe(true);
    expect(schedulesConflict(existing, { startsAt: new Date("2026-08-25T21:00:00Z"), homeTeamId: 3, awayTeamId: 4, courtId: 11 })).toBe(false);
  });

  it("enforces submit, confirm/dispute, resolve, and correction score transitions with audit actions", () => {
    expect(nextScoreState("PUBLISHED", "SUBMIT")).toBe("PENDING_CONFIRMATION");
    expect(nextScoreState("PENDING_CONFIRMATION", "DISPUTE")).toBe("DISPUTED");
    expect(nextScoreState("DISPUTED", "RESOLVE")).toBe("FINAL");
    expect(nextScoreState("FINAL", "CORRECT")).toBe("FINAL");
    expect(nextScoreState("DRAFT", "CORRECT")).toBeUndefined();
    expect(auditActionForScore("DISPUTED", "RESOLVE")).toBe("SCORE_RESOLVED");
    expect(auditActionForScore("FINAL", "CORRECT")).toBe("SCORE_CORRECTED");
  });

  it("calculates standings only from final results", () => {
    const standings = calculateStandings(["Amber", "Black", "Coral"], [
      { homeTeam: "Amber", awayTeam: "Black", homeScore: 9, awayScore: 4, final: true },
      { homeTeam: "Black", awayTeam: "Coral", homeScore: 8, awayScore: 2, final: false },
    ]);
    expect(standings[0]).toMatchObject({ teamName: "Amber", wins: 1, pointsFor: 9, differential: 5 });
    expect(standings.find((row) => row.teamName === "Coral")).toMatchObject({ played: 0, wins: 0 });
  });
});