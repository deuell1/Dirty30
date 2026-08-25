import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import {
  CreateTeamBody, CreateTeamResponse, GetDashboardResponse, GetGameParams, GetGameResponse,
  GetScoreReviewQueueResponse, GetStandingsResponse, GetTeamParams, GetTeamResponse,
  GetTeamRosterParams, GetTeamRosterResponse, ListGamesQueryParams, ListGamesResponse,
  ListTeamsResponse, SubmitScoreBody, SubmitScoreParams, SubmitScoreResponse,
  UpdateTeamBody, UpdateTeamParams, UpdateTeamResponse,
} from "@workspace/api-zod";
import {
  auditEvents, courts, db, games, leagues, playerInvitations, seasons, teamMemberships,
  teams, users, venues,
} from "@workspace/db";
import { currentUser, requireCommissioner, resolveCurrentUser } from "../middlewares/auth";

type ApiGame = {
  id: number; date: string; startTime: string; venue: string; court: string;
  homeTeam: string; awayTeam: string; homeTeamId: number; awayTeamId: number;
  status: "SCHEDULED" | "CANCELLED" | "FINAL" | "PENDING_CONFIRMATION" | "DISPUTED";
  published: boolean; homeScore: number | null; awayScore: number | null;
};

const router: IRouter = Router();
router.use(resolveCurrentUser);
const awayTeams = alias(teams, "away_teams");

const scheduleInput = z.object({
  homeTeamId: z.number().int().positive(), awayTeamId: z.number().int().positive(),
  venueId: z.number().int().positive(), courtId: z.number().int().positive(),
  scheduledAt: z.string().datetime(),
});
const inviteInput = z.object({ email: z.string().email() });
const disputeInput = z.object({ reason: z.string().trim().min(3).max(1000) });

function statusForGame(status: typeof games.$inferSelect.status): ApiGame["status"] {
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "FINAL") return "FINAL";
  if (status === "PENDING_CONFIRMATION") return "PENDING_CONFIRMATION";
  if (status === "DISPUTED") return "DISPUTED";
  return "SCHEDULED";
}
function timeParts(value: Date) {
  const date = value.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const startTime = value.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
  return { date, startTime };
}
async function activeSeason() {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.active, true) });
  if (!season) throw new Error("No active season configured");
  return season;
}
async function audit(actorUserId: number, entityType: string, entityId: number, action: string, beforeData?: unknown, afterData?: unknown) {
  const league = await db.query.leagues.findFirst({ where: eq(leagues.active, true) });
  if (!league) throw new Error("No active league configured");
  await db.insert(auditEvents).values({ leagueId: league.id, actorUserId, entityType, entityId, action, beforeData, afterData });
}
async function teamList() {
  const season = await activeSeason();
  const rows = await db.select().from(teams).where(eq(teams.seasonId, season.id)).orderBy(asc(teams.name));
  const memberships = rows.length ? await db.select().from(teamMemberships).where(and(inArray(teamMemberships.teamId, rows.map((item) => item.id)), eq(teamMemberships.active, true))) : [];
  const memberUsers = memberships.length ? await db.select().from(users).where(inArray(users.id, memberships.map((item) => item.userId))) : [];
  const byUser = new Map(memberUsers.map((user) => [user.id, user]));
  return rows.map((team) => {
    const teamMembers = memberships.filter((membership) => membership.teamId === team.id);
    const captain = teamMembers.find((membership) => membership.membershipRole === "CAPTAIN");
    const person = captain ? byUser.get(captain.userId) : undefined;
    return { id: team.id, name: team.name, captainName: person ? `${person.firstName} ${person.lastName}`.trim() : "", playerCount: teamMembers.length, active: team.active };
  });
}
async function apiGames(teamId?: number, date?: string): Promise<ApiGame[]> {
  const season = await activeSeason();
  const rows = await db.select({ game: games, home: teams, away: teams, venue: venues, court: courts })
    .from(games)
    .innerJoin(teams, eq(games.homeTeamId, teams.id))
    .innerJoin(venues, eq(games.venueId, venues.id))
    .innerJoin(courts, eq(games.courtId, courts.id))
    .innerJoin(awayTeams, eq(games.awayTeamId, awayTeams.id))
    .where(eq(games.seasonId, season.id)).orderBy(asc(games.scheduledAt));
  // Drizzle aliases are verbose; hydrate away teams separately to keep this join portable.
  const allTeams = await db.select().from(teams).where(eq(teams.seasonId, season.id));
  const byId = new Map(allTeams.map((team) => [team.id, team]));
  return rows.map(({ game, home, venue, court }) => {
    const parts = timeParts(game.scheduledAt);
    return { id: game.id, ...parts, venue: venue.name, court: court.name, homeTeam: home.name, awayTeam: byId.get(game.awayTeamId)?.name ?? "Unknown", homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, status: statusForGame(game.status), published: game.status !== "DRAFT", homeScore: game.homeScore, awayScore: game.awayScore };
  }).filter((game) => (!teamId || game.homeTeamId === teamId || game.awayTeamId === teamId) && (!date || game.date === date));
}
async function assertCaptainOrCommissioner(userId: number, teamIds: number[]) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.role === "COMMISSIONER") return;
  const membership = await db.query.teamMemberships.findFirst({ where: and(inArray(teamMemberships.teamId, teamIds), eq(teamMemberships.userId, userId), eq(teamMemberships.membershipRole, "CAPTAIN"), eq(teamMemberships.active, true)) });
  if (!membership) throw Object.assign(new Error("Captain access required"), { status: 403 });
}

router.get("/dashboard", async (_req, res, next) => {
  try {
    const user = currentUser(_req, res);
    const [season, league, allGames, allTeams] = await Promise.all([activeSeason(), db.query.leagues.findFirst({ where: eq(leagues.active, true) }), apiGames(), teamList()]);
    const nextGame = allGames.find((game) => game.status === "SCHEDULED") ?? null;
    const attentionItems = [
      ...allGames.filter((game) => game.status === "PENDING_CONFIRMATION").map(() => "1 score awaiting confirmation"),
      ...(user.role === "COMMISSIONER" ? [`${allTeams.reduce((sum, team) => sum + Math.max(0, 15 - team.playerCount), 0)} roster spots open across the league`] : []),
    ];
    res.json(GetDashboardResponse.parse({ leagueName: league?.name ?? "Dirty 30", seasonName: season.name, role: user.role, nextGame, attentionItems, recentResults: allGames.filter((game) => game.status === "FINAL") }));
  } catch (error) { next(error); }
});
router.get("/teams", async (_req, res, next) => { try { res.json(ListTeamsResponse.parse(await teamList())); } catch (error) { next(error); } });
router.post("/teams", requireCommissioner, async (req, res, next) => {
  try { const input = CreateTeamBody.parse(req.body); const season = await activeSeason(); const [team] = await db.insert(teams).values({ seasonId: season.id, name: input.name }).returning(); await audit(currentUser(req, res).id, "team", team!.id, "CREATED", undefined, team); res.status(201).json(CreateTeamResponse.parse((await teamList()).find((item) => item.id === team!.id))); } catch (error) { next(error); }
});
router.get("/teams/:teamId", async (req, res, next) => { try { const { teamId } = GetTeamParams.parse(req.params); const team = (await teamList()).find((item) => item.id === teamId); if (!team) return res.status(404).json({ error: "Team not found" }); return res.json(GetTeamResponse.parse(team)); } catch (error) { next(error); } });
router.patch("/teams/:teamId", requireCommissioner, async (req, res, next) => {
  try { const { teamId } = UpdateTeamParams.parse(req.params); const input = UpdateTeamBody.parse(req.body); const before = await db.query.teams.findFirst({ where: eq(teams.id, teamId) }); if (!before) return res.status(404).json({ error: "Team not found" }); await db.update(teams).set(input).where(eq(teams.id, teamId)); const after = await db.query.teams.findFirst({ where: eq(teams.id, teamId) }); await audit(currentUser(req, res).id, "team", teamId, "UPDATED", before, after); return res.json(UpdateTeamResponse.parse((await teamList()).find((item) => item.id === teamId))); } catch (error) { next(error); }
});
router.get("/teams/:teamId/roster", async (req, res, next) => {
  try { const { teamId } = GetTeamRosterParams.parse(req.params); const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) }); if (!team) return res.status(404).json({ error: "Team not found" }); const memberships = await db.select({ membership: teamMemberships, user: users }).from(teamMemberships).innerJoin(users, eq(teamMemberships.userId, users.id)).where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.active, true))); const pending = await db.select().from(playerInvitations).where(and(eq(playerInvitations.teamId, teamId), eq(playerInvitations.status, "PENDING"))); return res.json(GetTeamRosterResponse.parse([...memberships.map(({ user }) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone ?? "", status: "ACTIVE" })), ...pending.map((invite) => ({ id: -invite.id, firstName: "Invited", lastName: "Player", email: invite.invitedEmail, phone: "", status: "PENDING" }))])); } catch (error) { next(error); }
});
router.post("/teams/:teamId/invitations", async (req, res, next) => {
  try { const teamId = z.coerce.number().int().positive().parse(req.params.teamId); const input = inviteInput.parse(req.body); const actor = currentUser(req, res); await assertCaptainOrCommissioner(actor.id, [teamId]); const count = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.active, true))); if (count.length >= 15) return res.status(409).json({ error: "Team roster is at its 15 player limit" }); const token = randomBytes(24).toString("hex"); const [invite] = await db.insert(playerInvitations).values({ teamId, invitedEmail: input.email.toLowerCase(), invitedByUserId: actor.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400000) }).returning(); await audit(actor.id, "invitation", invite!.id, "CREATED", undefined, { teamId, email: input.email }); return res.status(201).json({ id: invite!.id, expiresAt: invite!.expiresAt, token }); } catch (error) { next(error); }
});
router.get("/schedule", async (req, res, next) => { try { const filters = ListGamesQueryParams.parse(req.query); res.json(ListGamesResponse.parse(await apiGames(filters.teamId, filters.date))); } catch (error) { next(error); } });
router.get("/schedule/:gameId", async (req, res, next) => { try { const { gameId } = GetGameParams.parse(req.params); const game = (await apiGames()).find((item) => item.id === gameId); if (!game) return res.status(404).json({ error: "Game not found" }); return res.json(GetGameResponse.parse(game)); } catch (error) { next(error); } });
router.post("/schedule", requireCommissioner, async (req, res, next) => { try { const input = scheduleInput.parse(req.body); if (input.homeTeamId === input.awayTeamId) return res.status(422).json({ error: "A team cannot play itself" }); const season = await activeSeason(); const [game] = await db.insert(games).values({ ...input, seasonId: season.id, scheduledAt: new Date(input.scheduledAt), status: "DRAFT" }).returning(); await audit(currentUser(req, res).id, "game", game!.id, "CREATED", undefined, game); res.status(201).json(game); } catch (error) { next(error); } });
router.post("/schedule/:gameId/publish", requireCommissioner, async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); await db.update(games).set({ status: "PUBLISHED" }).where(eq(games.id, gameId)); await audit(currentUser(req, res).id, "game", gameId, "PUBLISHED"); res.status(204).end(); } catch (error) { next(error); } });
router.get("/standings", async (_req, res, next) => { try { const rows = (await teamList()).filter((team) => team.active).map((team) => ({ teamName: team.name, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, differential: 0 })); const map = new Map(rows.map((row) => [row.teamName, row])); for (const game of await apiGames()) { if (game.status !== "FINAL" || game.homeScore === null || game.awayScore === null) continue; const home = map.get(game.homeTeam); const away = map.get(game.awayTeam); if (!home || !away) continue; home.played++; away.played++; home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore; away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore; if (game.homeScore > game.awayScore) { home.wins++; away.losses++; } else if (game.awayScore > game.homeScore) { away.wins++; home.losses++; } } res.json(GetStandingsResponse.parse(rows.map((row) => ({ ...row, differential: row.pointsFor - row.pointsAgainst })).sort((a,b) => b.wins-a.wins || b.differential-a.differential || b.pointsFor-a.pointsFor).map((row,index) => ({ rank:index+1,...row })))); } catch (error) { next(error); } });
router.post("/scores/:gameId", async (req, res, next) => { try { const { gameId } = SubmitScoreParams.parse(req.params); const input = SubmitScoreBody.parse(req.body); const game = await db.query.games.findFirst({ where: eq(games.id, gameId) }); if (!game) return res.status(404).json({ error: "Game not found" }); if (game.status !== "PUBLISHED") return res.status(409).json({ error: "Only published, unsubmitted games can receive a score" }); const actor = currentUser(req, res); await assertCaptainOrCommissioner(actor.id, [game.homeTeamId, game.awayTeamId]); await db.update(games).set({ ...input, status: "PENDING_CONFIRMATION", submittedByUserId: actor.id, submittedAt: new Date() }).where(and(eq(games.id, gameId), eq(games.status, "PUBLISHED"))); await audit(actor.id, "game", gameId, "SCORE_SUBMITTED", game, input); res.json(SubmitScoreResponse.parse({ gameId, ...input, status: "PENDING_CONFIRMATION" })); } catch (error) { next(error); } });
router.get("/scores/review", requireCommissioner, async (_req, res, next) => { try { res.json(GetScoreReviewQueueResponse.parse((await apiGames()).filter((game) => game.status === "PENDING_CONFIRMATION" || game.status === "DISPUTED"))); } catch (error) { next(error); } });
router.post("/scores/:gameId/confirm", async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); const game = await db.query.games.findFirst({ where: eq(games.id, gameId) }); if (!game || game.status !== "PENDING_CONFIRMATION") return res.status(409).json({ error: "This score cannot be confirmed" }); const actor = currentUser(req, res); await assertCaptainOrCommissioner(actor.id, [game.homeTeamId, game.awayTeamId]); if (actor.id === game.submittedByUserId) return res.status(403).json({ error: "A different captain must confirm this score" }); await db.update(games).set({ status: "FINAL", confirmedByUserId: actor.id, confirmedAt: new Date() }).where(eq(games.id, gameId)); await audit(actor.id, "game", gameId, "SCORE_CONFIRMED"); res.status(204).end(); } catch (error) { next(error); } });
router.post("/scores/:gameId/dispute", async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); const input = disputeInput.parse(req.body); const game = await db.query.games.findFirst({ where: eq(games.id, gameId) }); if (!game) return res.status(404).json({ error: "Game not found" }); if (game.status !== "PENDING_CONFIRMATION") return res.status(409).json({ error: "Only submitted scores can be disputed" }); const actor = currentUser(req, res); await assertCaptainOrCommissioner(actor.id, [game.homeTeamId, game.awayTeamId]); await db.update(games).set({ status: "DISPUTED", disputeReason: input.reason, disputedByUserId: actor.id, disputedAt: new Date() }).where(and(eq(games.id, gameId), eq(games.status, "PENDING_CONFIRMATION"))); await audit(actor.id, "game", gameId, "SCORE_DISPUTED", undefined, input); res.status(204).end(); } catch (error) { next(error); } });
export default router;