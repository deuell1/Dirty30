export type LeagueRole = "COMMISSIONER" | "CAPTAIN" | "PLAYER";
export type ScoreState = "DRAFT" | "PUBLISHED" | "PENDING_CONFIRMATION" | "DISPUTED" | "FINAL" | "CANCELLED";

export function canManageRoster(role: LeagueRole, isOwnCaptainTeam: boolean) {
  return role === "COMMISSIONER" || (role === "CAPTAIN" && isOwnCaptainTeam);
}

export function isGameVisibleToRole(published: boolean, role: LeagueRole) {
  return published || role === "COMMISSIONER";
}

export function hasRosterCapacity(activeMembers: number, pendingInvitations: number) {
  return activeMembers + pendingInvitations < 8;
}

export function schedulesConflict(
  existing: { startsAt: Date; homeTeamId: number; awayTeamId: number; courtId: number; cancelled?: boolean },
  proposed: { startsAt: Date; homeTeamId: number; awayTeamId: number; courtId: number },
) {
  if (existing.cancelled) return false;
  const withinGameWindow = Math.abs(existing.startsAt.getTime() - proposed.startsAt.getTime()) < 90 * 60_000;
  const sharesTeam = [existing.homeTeamId, existing.awayTeamId].some((id) => id === proposed.homeTeamId || id === proposed.awayTeamId);
  return withinGameWindow && (sharesTeam || existing.courtId === proposed.courtId);
}

export function nextScoreState(state: ScoreState, action: "SUBMIT" | "CONFIRM" | "DISPUTE" | "RESOLVE" | "CORRECT") {
  const transitions: Record<ScoreState, Partial<Record<typeof action, ScoreState>>> = {
    DRAFT: {},
    PUBLISHED: { SUBMIT: "PENDING_CONFIRMATION", CORRECT: "FINAL" },
    PENDING_CONFIRMATION: { CONFIRM: "FINAL", DISPUTE: "DISPUTED" },
    DISPUTED: { RESOLVE: "FINAL" },
    FINAL: { CORRECT: "FINAL" },
    CANCELLED: {},
  };
  return transitions[state][action];
}

export function auditActionForScore(state: ScoreState, action: "SUBMIT" | "CONFIRM" | "DISPUTE" | "RESOLVE" | "CORRECT") {
  if (!nextScoreState(state, action)) return undefined;
  return ({ SUBMIT: "SCORE_SUBMITTED", CONFIRM: "SCORE_CONFIRMED", DISPUTE: "SCORE_DISPUTED", RESOLVE: "SCORE_RESOLVED", CORRECT: state === "FINAL" ? "SCORE_CORRECTED" : "COMMISSIONER_SCORE_ENTERED" })[action];
}

export function calculateStandings(
  teams: string[],
  results: Array<{ homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; final: boolean }>,
) {
  const rows = new Map(teams.map((teamName) => [teamName, { teamName, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }]));
  for (const result of results) {
    if (!result.final) continue;
    const home = rows.get(result.homeTeam);
    const away = rows.get(result.awayTeam);
    if (!home || !away) continue;
    home.played++; away.played++;
    home.pointsFor += result.homeScore; home.pointsAgainst += result.awayScore;
    away.pointsFor += result.awayScore; away.pointsAgainst += result.homeScore;
    if (result.homeScore > result.awayScore) { home.wins++; away.losses++; }
    if (result.awayScore > result.homeScore) { away.wins++; home.losses++; }
  }
  return [...rows.values()].map((row) => ({ ...row, differential: row.pointsFor - row.pointsAgainst })).sort((a, b) => b.wins - a.wins || b.differential - a.differential || b.pointsFor - a.pointsFor);
}