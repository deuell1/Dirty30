import { Router, type IRouter } from "express";
import {
  CreateTeamBody,
  CreateTeamResponse,
  GetDashboardResponse,
  GetGameParams,
  GetGameResponse,
  GetScoreReviewQueueResponse,
  GetStandingsResponse,
  GetTeamParams,
  GetTeamResponse,
  GetTeamRosterParams,
  GetTeamRosterResponse,
  ListGamesQueryParams,
  ListGamesResponse,
  ListTeamsResponse,
  SubmitScoreBody,
  SubmitScoreParams,
  SubmitScoreResponse,
  UpdateTeamBody,
  UpdateTeamParams,
  UpdateTeamResponse,
} from "@workspace/api-zod";

type Team = {
  id: number;
  name: string;
  captainName: string;
  playerCount: number;
  active: boolean;
};

type Game = {
  id: number;
  date: string;
  startTime: string;
  venue: string;
  court: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  status: "SCHEDULED" | "CANCELLED" | "FINAL" | "PENDING_CONFIRMATION" | "DISPUTED";
  published: boolean;
  homeScore: number | null;
  awayScore: number | null;
};

const teams: Team[] = [
  { id: 1, name: "Hops & Dreams", captainName: "Casey Morgan", playerCount: 8, active: true },
  { id: 2, name: "Pitch Please", captainName: "Jordan Lee", playerCount: 7, active: true },
  { id: 3, name: "Ale Stars", captainName: "Sam Rivera", playerCount: 8, active: true },
  { id: 4, name: "The Keg Stands", captainName: "Taylor Brooks", playerCount: 6, active: true },
];

const rosters = new Map<number, Array<{ id: number; firstName: string; lastName: string; email: string; phone: string; status: "ACTIVE" | "PENDING" }>>([
  [1, [
    { id: 101, firstName: "Casey", lastName: "Morgan", email: "casey@dirty30.local", phone: "(312) 555-0116", status: "ACTIVE" },
    { id: 102, firstName: "Maya", lastName: "Patel", email: "maya@dirty30.local", phone: "(312) 555-0148", status: "ACTIVE" },
    { id: 103, firstName: "Drew", lastName: "Young", email: "drew@dirty30.local", phone: "(312) 555-0163", status: "ACTIVE" },
  ]],
  [2, [{ id: 201, firstName: "Jordan", lastName: "Lee", email: "jordan@dirty30.local", phone: "(773) 555-0142", status: "ACTIVE" }]],
  [3, [{ id: 301, firstName: "Sam", lastName: "Rivera", email: "sam@dirty30.local", phone: "(312) 555-0175", status: "ACTIVE" }]],
  [4, [{ id: 401, firstName: "Taylor", lastName: "Brooks", email: "taylor@dirty30.local", phone: "(773) 555-0188", status: "ACTIVE" }]],
]);

const games: Game[] = [
  { id: 1, date: "2026-08-27", startTime: "7:00 PM", venue: "Lakeside Sports Center", court: "Court 2", homeTeam: "Hops & Dreams", awayTeam: "Pitch Please", homeTeamId: 1, awayTeamId: 2, status: "SCHEDULED", published: true, homeScore: null, awayScore: null },
  { id: 2, date: "2026-08-27", startTime: "8:10 PM", venue: "Lakeside Sports Center", court: "Court 1", homeTeam: "Ale Stars", awayTeam: "The Keg Stands", homeTeamId: 3, awayTeamId: 4, status: "PENDING_CONFIRMATION", published: true, homeScore: 14, awayScore: 11 },
  { id: 3, date: "2026-08-20", startTime: "7:00 PM", venue: "Lakeside Sports Center", court: "Court 1", homeTeam: "Hops & Dreams", awayTeam: "Ale Stars", homeTeamId: 1, awayTeamId: 3, status: "FINAL", published: true, homeScore: 17, awayScore: 13 },
  { id: 4, date: "2026-08-20", startTime: "8:10 PM", venue: "Lakeside Sports Center", court: "Court 2", homeTeam: "Pitch Please", awayTeam: "The Keg Stands", homeTeamId: 2, awayTeamId: 4, status: "FINAL", published: true, homeScore: 9, awayScore: 15 },
];

const getStandings = () => {
  const rows = teams.filter((team) => team.active).map((team) => ({
    teamName: team.name,
    played: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    differential: 0,
  }));
  const byName = new Map(rows.map((row) => [row.teamName, row]));

  games.filter((game) => game.status === "FINAL" && game.homeScore !== null && game.awayScore !== null).forEach((game) => {
    const home = byName.get(game.homeTeam);
    const away = byName.get(game.awayTeam);
    if (!home || !away || game.homeScore === null || game.awayScore === null) return;
    home.played += 1; away.played += 1;
    home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore;
    if (game.homeScore > game.awayScore) { home.wins += 1; away.losses += 1; } else { away.wins += 1; home.losses += 1; }
  });

  return rows
    .map((row) => ({ ...row, differential: row.pointsFor - row.pointsAgainst }))
    .sort((a, b) => b.wins - a.wins || b.differential - a.differential || b.pointsFor - a.pointsFor)
    .map((row, index) => ({ rank: index + 1, ...row }));
};

const router: IRouter = Router();

router.get("/dashboard", (_req, res) => {
  const nextGame = games.find((game) => game.status === "SCHEDULED") ?? null;
  const data = GetDashboardResponse.parse({
    leagueName: "Dirty 30",
    seasonName: "Summer 2026",
    role: "COMMISSIONER",
    nextGame,
    attentionItems: ["1 score awaiting confirmation", "2 roster spots open across the league"],
    recentResults: games.filter((game) => game.status === "FINAL"),
  });
  res.json(data);
});

router.get("/teams", (_req, res) => res.json(ListTeamsResponse.parse(teams)));

router.post("/teams", (req, res) => {
  const input = CreateTeamBody.parse(req.body);
  const team = { id: Math.max(...teams.map((item) => item.id)) + 1, name: input.name, captainName: "Unassigned", playerCount: 0, active: true };
  teams.push(team);
  res.status(201).json(CreateTeamResponse.parse(team));
});

router.get("/teams/:teamId", (req, res) => {
  const { teamId } = GetTeamParams.parse(req.params);
  const team = teams.find((item) => item.id === teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  return res.json(GetTeamResponse.parse(team));
});

router.patch("/teams/:teamId", (req, res) => {
  const { teamId } = UpdateTeamParams.parse(req.params);
  const update = UpdateTeamBody.parse(req.body);
  const team = teams.find((item) => item.id === teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (update.name !== undefined) team.name = update.name;
  if (update.active !== undefined) team.active = update.active;
  return res.json(UpdateTeamResponse.parse(team));
});

router.get("/teams/:teamId/roster", (req, res) => {
  const { teamId } = GetTeamRosterParams.parse(req.params);
  if (!teams.some((item) => item.id === teamId)) return res.status(404).json({ error: "Team not found" });
  return res.json(GetTeamRosterResponse.parse(rosters.get(teamId) ?? []));
});

router.get("/schedule", (req, res) => {
  const filters = ListGamesQueryParams.parse(req.query);
  const filtered = games.filter((game) =>
    (!filters.teamId || game.homeTeamId === filters.teamId || game.awayTeamId === filters.teamId) &&
    (!filters.date || game.date === filters.date),
  );
  res.json(ListGamesResponse.parse(filtered));
});

router.get("/schedule/:gameId", (req, res) => {
  const { gameId } = GetGameParams.parse(req.params);
  const game = games.find((item) => item.id === gameId);
  if (!game) return res.status(404).json({ error: "Game not found" });
  return res.json(GetGameResponse.parse(game));
});

router.get("/standings", (_req, res) => res.json(GetStandingsResponse.parse(getStandings())));

router.post("/scores/:gameId", (req, res) => {
  const { gameId } = SubmitScoreParams.parse(req.params);
  const input = SubmitScoreBody.parse(req.body);
  const game = games.find((item) => item.id === gameId);
  if (!game) return res.status(404).json({ error: "Game not found" });
  if (game.status === "FINAL") return res.status(409).json({ error: "Final scores are locked" });
  game.homeScore = input.homeScore;
  game.awayScore = input.awayScore;
  game.status = "PENDING_CONFIRMATION";
  return res.json(SubmitScoreResponse.parse({ gameId, ...input, status: "PENDING_CONFIRMATION" }));
});

router.get("/scores/review", (_req, res) => {
  res.json(GetScoreReviewQueueResponse.parse(games.filter((game) => game.status === "PENDING_CONFIRMATION" || game.status === "DISPUTED")));
});

export default router;