export type AccessLevel =
  | "PUBLIC"
  | "AUTHENTICATED_PENDING"
  | "AUTHENTICATED_ACTIVE"
  | "COMMISSIONER"
  | "CAPTAIN_OWNING_TEAM"
  | "PARTICIPATING_TEAM_CAPTAIN"
  | "OPPOSING_TEAM_CAPTAIN";

export const authorizationMatrix = {
  "GET /api/healthz": "PUBLIC",
  "GET /api/readyz": "PUBLIC",
  "GET /api/me": "AUTHENTICATED_PENDING",
  "POST /api/invitations/:token/accept": "AUTHENTICATED_PENDING",
  "GET /api/dashboard": "AUTHENTICATED_ACTIVE",
  "GET /api/teams*": "AUTHENTICATED_ACTIVE",
  "GET /api/schedule*": "AUTHENTICATED_ACTIVE",
  "GET /api/standings": "AUTHENTICATED_ACTIVE",
  "POST /api/teams": "COMMISSIONER",
  "PATCH /api/users/:userId/access": "COMMISSIONER",
  "POST|PATCH /api/venues*": "COMMISSIONER",
  "POST|PATCH /api/courts*": "COMMISSIONER",
  "POST|PATCH /api/schedule*": "COMMISSIONER",
  "POST /api/scores/:gameId/resolve": "COMMISSIONER",
  "PATCH /api/scores/:gameId": "COMMISSIONER",
  "POST /api/teams/:teamId/invitations": "CAPTAIN_OWNING_TEAM",
  "POST /api/scores/:gameId": "PARTICIPATING_TEAM_CAPTAIN",
  "POST /api/scores/:gameId/confirm": "OPPOSING_TEAM_CAPTAIN",
  "POST /api/scores/:gameId/dispute": "OPPOSING_TEAM_CAPTAIN",
} as const satisfies Record<string, AccessLevel>;