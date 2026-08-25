import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
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
  teams, users, venues, type User,
} from "@workspace/db";
import { currentUser, requireCommissioner, resolveCurrentUser } from "../middlewares/auth";
import { lockRoster, MAX_ROSTER_POSITIONS, requireRosterSlot } from "../services/rosterCapacity";
import { normalizeUsPhone } from "../lib/phone";
import { canCommissionerDirectScore } from "../services/scorePolicy";

type ApiGame = {
  id: number; date: string; startTime: string; venue: string; court: string;
  homeTeam: string; awayTeam: string; homeTeamId: number; awayTeamId: number; venueId: number; courtId: number;
  status: "SCHEDULED" | "CANCELLED" | "FINAL" | "PENDING_CONFIRMATION" | "DISPUTED";
  published: boolean; homeScore: number | null; awayScore: number | null;
  scoreSubmittedByCurrentUser?: boolean; disputeReason?: string | null;
  canSubmitScore?: boolean; canConfirmOrDisputeScore?: boolean; canManageScore?: boolean;
};

const router: IRouter = Router();
router.use(resolveCurrentUser);
const awayTeams = alias(teams, "away_teams");

const scheduleInput = z.object({
  homeTeamId: z.number().int().positive(), awayTeamId: z.number().int().positive(),
  venueId: z.number().int().positive(), courtId: z.number().int().positive(),
  scheduledAt: z.string().datetime(),
});
const inviteInput = z.object({ phone: z.string().trim().min(1).max(40) });
const disputeInput = z.object({ reason: z.string().trim().min(3).max(1000) });
const profileInput = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100) });
const captainInput = z.object({ userId: z.number().int().positive() });
const venueInput = z.object({ name: z.string().trim().min(1).max(160), address: z.string().trim().max(1000).default("") });
const courtInput = z.object({ name: z.string().trim().min(1).max(100) });

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
async function teamList(viewer?: Pick<User, "id" | "role">) {
  const season = await activeSeason();
  const rows = await db.select().from(teams).where(eq(teams.seasonId, season.id)).orderBy(asc(teams.name));
  const memberships = rows.length ? await db.select().from(teamMemberships).where(and(inArray(teamMemberships.teamId, rows.map((item) => item.id)), eq(teamMemberships.active, true))) : [];
  const memberUsers = memberships.length ? await db.select().from(users).where(inArray(users.id, memberships.map((item) => item.userId))) : [];
  const byUser = new Map(memberUsers.map((user) => [user.id, user]));
  return rows.map((team) => {
    const teamMembers = memberships.filter((membership) => membership.teamId === team.id);
    const captain = teamMembers.find((membership) => membership.membershipRole === "CAPTAIN");
    const person = captain ? byUser.get(captain.userId) : undefined;
    return { id: team.id, name: team.name, captainName: person ? `${person.firstName} ${person.lastName}`.trim() : "", playerCount: teamMembers.length, active: team.active, canManageRoster: viewer?.role === "COMMISSIONER" || teamMembers.some((membership) => membership.userId === viewer?.id && membership.membershipRole === "CAPTAIN") };
  });
}
async function apiGames(teamId?: number, date?: string, viewer?: Pick<User, "id" | "role">): Promise<ApiGame[]> {
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
  const captainMemberships = viewer?.role === "COMMISSIONER" ? [] : viewer ? await db.select().from(teamMemberships).where(and(eq(teamMemberships.userId, viewer.id), eq(teamMemberships.membershipRole, "CAPTAIN"), eq(teamMemberships.active, true))) : [];
  const captainTeamIds = new Set(captainMemberships.map((membership) => membership.teamId));
  const submittingUserIds = rows.map(({ game }) => game.submittedByUserId).filter((id): id is number => id !== null);
  const submitterMemberships = submittingUserIds.length
    ? await db.select().from(teamMemberships).where(and(inArray(teamMemberships.userId, submittingUserIds), eq(teamMemberships.active, true)))
    : [];
  return rows.map(({ game, home, venue, court }) => {
    const parts = timeParts(game.scheduledAt);
    const isCommissioner = viewer?.role === "COMMISSIONER";
    const isCaptainForGame = captainTeamIds.has(game.homeTeamId) || captainTeamIds.has(game.awayTeamId);
    const submittedByViewer = viewer ? game.submittedByUserId === viewer.id : undefined;
    const submitterTeamId = submitterMemberships.find((membership) => membership.userId === game.submittedByUserId && (membership.teamId === game.homeTeamId || membership.teamId === game.awayTeamId))?.teamId;
    const opposingTeamId = submitterTeamId === game.homeTeamId ? game.awayTeamId : submitterTeamId === game.awayTeamId ? game.homeTeamId : undefined;
    const canOpposingCaptainReview = opposingTeamId !== undefined && captainTeamIds.has(opposingTeamId);
    return { id: game.id, ...parts, venue: venue.name, court: court.name, homeTeam: home.name, awayTeam: byId.get(game.awayTeamId)?.name ?? "Unknown", homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, venueId: game.venueId, courtId: game.courtId, status: statusForGame(game.status), published: game.status !== "DRAFT", homeScore: game.homeScore, awayScore: game.awayScore, scoreSubmittedByCurrentUser: submittedByViewer, disputeReason: game.disputeReason, canSubmitScore: Boolean(isCommissioner || isCaptainForGame) && game.status === "PUBLISHED", canConfirmOrDisputeScore: game.status === "PENDING_CONFIRMATION" && Boolean(isCommissioner || canOpposingCaptainReview), canManageScore: Boolean(isCommissioner) };
  }).filter((game) => (!teamId || game.homeTeamId === teamId || game.awayTeamId === teamId) && (!date || game.date === date));
}
async function assertCaptainOrCommissioner(userId: number, teamIds: number[]) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.role === "COMMISSIONER") return;
  const membership = await db.query.teamMemberships.findFirst({ where: and(inArray(teamMemberships.teamId, teamIds), eq(teamMemberships.userId, userId), eq(teamMemberships.membershipRole, "CAPTAIN"), eq(teamMemberships.active, true)) });
  if (!membership) throw Object.assign(new Error("Captain access required"), { status: 403 });
}
async function assertOpposingCaptainOrCommissioner(userId: number, game: typeof games.$inferSelect) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.role === "COMMISSIONER") return;
  if (!game.submittedByUserId) throw Object.assign(new Error("Score has no submitting captain"), { status: 409 });
  const submitter = await db.query.teamMemberships.findFirst({ where: and(eq(teamMemberships.userId, game.submittedByUserId), eq(teamMemberships.active, true), inArray(teamMemberships.teamId, [game.homeTeamId, game.awayTeamId])) });
  if (!submitter) throw Object.assign(new Error("Score submitter is no longer a team captain"), { status: 409 });
  const opposingTeamId = submitter.teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
  const opposingCaptain = await db.query.teamMemberships.findFirst({ where: and(eq(teamMemberships.userId, userId), eq(teamMemberships.teamId, opposingTeamId), eq(teamMemberships.membershipRole, "CAPTAIN"), eq(teamMemberships.active, true)) });
  if (!opposingCaptain) throw Object.assign(new Error("Only the opposing team's captain can confirm or dispute this score"), { status: 403 });
}
async function validateGameInput(input: z.infer<typeof scheduleInput>, excludeGameId?: number) {
  const [season, league] = await Promise.all([activeSeason(), db.query.leagues.findFirst({ where: eq(leagues.active, true) })]);
  if (!league) throw Object.assign(new Error("No active league configured"), { status: 409 });
  const startsAt = new Date(input.scheduledAt);
  if (Number.isNaN(startsAt.getTime()) || startsAt.toISOString().slice(0, 10) < season.startDate || startsAt.toISOString().slice(0, 10) > season.endDate) throw Object.assign(new Error("Game time must be within the active season"), { status: 422 });
  if (input.homeTeamId === input.awayTeamId) throw Object.assign(new Error("A team cannot play itself"), { status: 422 });
  const [home, away, venue, court] = await Promise.all([
    db.query.teams.findFirst({ where: and(eq(teams.id, input.homeTeamId), eq(teams.seasonId, season.id), eq(teams.active, true)) }),
    db.query.teams.findFirst({ where: and(eq(teams.id, input.awayTeamId), eq(teams.seasonId, season.id), eq(teams.active, true)) }),
    db.query.venues.findFirst({ where: and(eq(venues.id, input.venueId), eq(venues.leagueId, league.id), eq(venues.active, true)) }),
    db.query.courts.findFirst({ where: and(eq(courts.id, input.courtId), eq(courts.venueId, input.venueId), eq(courts.active, true)) }),
  ]);
  if (!home || !away || !venue || !court) throw Object.assign(new Error("Teams, venue, and court must be active in the current league"), { status: 422 });
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  const conflicting = await db.select({ id: games.id }).from(games).where(and(
    eq(games.seasonId, season.id),
    ne(games.status, "CANCELLED"),
    lt(games.scheduledAt, endsAt),
    gt(games.scheduledAt, new Date(startsAt.getTime() - 90 * 60_000)),
    excludeGameId ? ne(games.id, excludeGameId) : undefined,
    or(inArray(games.homeTeamId, [input.homeTeamId, input.awayTeamId]), inArray(games.awayTeamId, [input.homeTeamId, input.awayTeamId]), eq(games.courtId, input.courtId)),
  ));
  if (conflicting.length) throw Object.assign(new Error("A team or court is already scheduled during this game window"), { status: 409 });
  return season;
}
async function withScheduleMutationLock<T>(operation: () => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(30030)`);
    return operation();
  });
}

router.get("/dashboard", async (_req, res, next) => {
  try {
    const user = currentUser(_req, res);
    const [season, league, allGames, allTeams] = await Promise.all([activeSeason(), db.query.leagues.findFirst({ where: eq(leagues.active, true) }), apiGames(undefined, undefined, user), teamList()]);
    const nextGame = allGames.find((game) => game.status === "SCHEDULED") ?? null;
    const attentionItems = [
      ...allGames.filter((game) => game.status === "PENDING_CONFIRMATION").map(() => "1 score awaiting confirmation"),
      ...(user.role === "COMMISSIONER" ? [`${allTeams.reduce((sum, team) => sum + Math.max(0, MAX_ROSTER_POSITIONS - team.playerCount), 0)} roster spots open across the league`] : []),
    ];
    res.json(GetDashboardResponse.parse({ leagueName: league?.name ?? "Dirty 30", seasonName: season.name, role: user.role, nextGame, attentionItems, recentResults: allGames.filter((game) => game.status === "FINAL") }));
  } catch (error) { next(error); }
});
router.get("/me", (req, res) => {
  const user = currentUser(req, res);
  res.json({ id: user.id, email: user.email ?? undefined, firstName: user.firstName, lastName: user.lastName, phone: user.phone, role: user.role });
});
router.patch("/me", async (req, res, next) => {
  try {
    const user = currentUser(req, res);
    const input = profileInput.parse(req.body);
    const [updated] = await db.update(users).set(input).where(eq(users.id, user.id)).returning();
    await audit(user.id, "user", user.id, "PROFILE_UPDATED", user, updated);
    return res.json({ id: updated!.id, email: updated!.email ?? undefined, firstName: updated!.firstName, lastName: updated!.lastName, phone: updated!.phone, role: updated!.role });
  } catch (error) { return next(error); }
});
router.get("/teams", async (req, res, next) => { try { res.json(ListTeamsResponse.parse(await teamList(currentUser(req, res)))); } catch (error) { next(error); } });
router.post("/teams", requireCommissioner, async (req, res, next) => {
  try { const input = CreateTeamBody.parse(req.body); const season = await activeSeason(); const [team] = await db.insert(teams).values({ seasonId: season.id, name: input.name }).returning(); await audit(currentUser(req, res).id, "team", team!.id, "CREATED", undefined, team); res.status(201).json(CreateTeamResponse.parse((await teamList()).find((item) => item.id === team!.id))); } catch (error) { next(error); }
});
router.get("/teams/:teamId", async (req, res, next) => { try { const { teamId } = GetTeamParams.parse(req.params); const team = (await teamList(currentUser(req, res))).find((item) => item.id === teamId); if (!team) return res.status(404).json({ error: "Team not found" }); return res.json(GetTeamResponse.parse(team)); } catch (error) { return next(error); } });
router.patch("/teams/:teamId", requireCommissioner, async (req, res, next) => {
  try { const { teamId } = UpdateTeamParams.parse(req.params); const input = UpdateTeamBody.parse(req.body); const before = await db.query.teams.findFirst({ where: eq(teams.id, teamId) }); if (!before) return res.status(404).json({ error: "Team not found" }); await db.update(teams).set(input).where(eq(teams.id, teamId)); const after = await db.query.teams.findFirst({ where: eq(teams.id, teamId) }); await audit(currentUser(req, res).id, "team", teamId, "UPDATED", before, after); return res.json(UpdateTeamResponse.parse((await teamList()).find((item) => item.id === teamId))); } catch (error) { return next(error); }
});
router.get("/teams/:teamId/roster", async (req, res, next) => {
  try {
    const { teamId } = GetTeamRosterParams.parse(req.params);
    const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
    if (!team) return res.status(404).json({ error: "Team not found" });
    const viewer = currentUser(req, res);
    const canViewPhone = viewer.role === "COMMISSIONER" || Boolean(await db.query.teamMemberships.findFirst({
      where: and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, viewer.id), eq(teamMemberships.membershipRole, "CAPTAIN"), eq(teamMemberships.active, true)),
    }));
    const memberships = await db.select({ membership: teamMemberships, user: users }).from(teamMemberships).innerJoin(users, eq(teamMemberships.userId, users.id)).where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.active, true)));
    const pending = canViewPhone ? await db.select().from(playerInvitations).where(and(eq(playerInvitations.teamId, teamId), eq(playerInvitations.status, "PENDING"))) : [];
    return res.json(GetTeamRosterResponse.parse([
      ...memberships.map(({ user }) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, phone: canViewPhone ? user.phone : undefined, status: "ACTIVE" })),
      ...pending.map((invite) => ({ id: -invite.id, firstName: "Invited", lastName: "Player", phone: invite.invitedPhone, status: "PENDING" })),
    ]));
  } catch (error) { return next(error); }
});
router.patch("/teams/:teamId/captain", requireCommissioner, async (req, res, next) => {
  try {
    const teamId = z.coerce.number().int().positive().parse(req.params.teamId);
    const { userId } = captainInput.parse(req.body);
    const actor = currentUser(req, res);
    const member = await db.query.teamMemberships.findFirst({ where: and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId), eq(teamMemberships.active, true)) });
    if (!member) return res.status(422).json({ error: "Captain must be an active member of this team" });
    await db.transaction(async (tx) => {
      const oldCaptains = await tx.select().from(teamMemberships).where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.membershipRole, "CAPTAIN"), eq(teamMemberships.active, true)));
      await tx.update(teamMemberships).set({ membershipRole: "PLAYER" }).where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.active, true)));
      await tx.update(teamMemberships).set({ membershipRole: "CAPTAIN" }).where(eq(teamMemberships.id, member.id));
      for (const old of oldCaptains) await tx.update(users).set({ role: "PLAYER" }).where(eq(users.id, old.userId));
      await tx.update(users).set({ role: "CAPTAIN" }).where(eq(users.id, userId));
    });
    await audit(actor.id, "team", teamId, "CAPTAIN_REPLACED", undefined, { userId });
    return res.status(204).end();
  } catch (error) { return next(error); }
});
router.post("/teams/:teamId/invitations", async (req, res, next) => {
  try {
    const teamId = z.coerce.number().int().positive().parse(req.params.teamId);
    const input = inviteInput.parse(req.body);
    const invitedPhone = normalizeUsPhone(input.phone);
    const actor = currentUser(req, res);
    await assertCaptainOrCommissioner(actor.id, [teamId]);
    const token = randomBytes(24).toString("hex");
    const invite = await db.transaction(async (tx) => lockRoster(tx, teamId, async () => {
      const existingPending = await tx.query.playerInvitations.findFirst({
        where: and(eq(playerInvitations.teamId, teamId), eq(playerInvitations.invitedPhone, invitedPhone), eq(playerInvitations.status, "PENDING")),
      });
      if (existingPending) throw Object.assign(new Error("A pending invitation already exists for this phone number"), { status: 409 });
      await requireRosterSlot(tx, teamId);
      const [created] = await tx.insert(playerInvitations).values({
        teamId, invitedPhone, invitedByUserId: actor.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      }).returning();
      return created!;
    }));
    await audit(actor.id, "invitation", invite.id, "CREATED", undefined, { teamId, invitedPhone });
    return res.status(201).json({ id: invite.id, expiresAt: invite.expiresAt, token });
  } catch (error) { return next(error); }
});
router.post("/invitations/:token/accept", async (req, res, next) => {
  try {
    const token = z.string().min(20).parse(req.params.token);
    const actor = currentUser(req, res);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const accepted = await db.transaction(async (tx) => {
      const invitation = await tx.query.playerInvitations.findFirst({ where: eq(playerInvitations.tokenHash, tokenHash) });
      if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) throw Object.assign(new Error("Invitation is invalid or expired"), { status: 410 });
      if (invitation.invitedPhone !== actor.phone) throw Object.assign(new Error("This invitation belongs to a different verified phone number"), { status: 403 });
      return lockRoster(tx, invitation.teamId, async () => {
        const [updated] = await tx.update(playerInvitations).set({ status: "ACCEPTED", acceptedAt: new Date() }).where(and(eq(playerInvitations.id, invitation.id), eq(playerInvitations.status, "PENDING"))).returning();
        if (!updated) throw Object.assign(new Error("Invitation was already accepted"), { status: 409 });
        await requireRosterSlot(tx, invitation.teamId);
        const existing = await tx.query.teamMemberships.findFirst({ where: and(eq(teamMemberships.teamId, invitation.teamId), eq(teamMemberships.userId, actor.id), eq(teamMemberships.active, true)) });
        if (!existing) await tx.insert(teamMemberships).values({ teamId: invitation.teamId, userId: actor.id, membershipRole: "PLAYER" });
        return updated;
      });
    });
    await audit(actor.id, "invitation", accepted.id, "ACCEPTED", undefined, { userId: actor.id });
    return res.json({ teamId: accepted.teamId });
  } catch (error) { return next(error); }
});
router.post("/teams/:teamId/invitations/:invitationId/regenerate", async (req, res, next) => {
  try {
    const teamId = z.coerce.number().int().positive().parse(req.params.teamId);
    const invitationId = z.coerce.number().int().positive().parse(req.params.invitationId);
    const actor = currentUser(req, res);
    await assertCaptainOrCommissioner(actor.id, [teamId]);
    const token = randomBytes(24).toString("hex");
    const [updated] = await db.update(playerInvitations).set({ tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400000), status: "PENDING" }).where(and(eq(playerInvitations.id, invitationId), eq(playerInvitations.teamId, teamId), eq(playerInvitations.status, "PENDING"))).returning();
    if (!updated) return res.status(404).json({ error: "Pending invitation not found" });
    await audit(actor.id, "invitation", invitationId, "REGENERATED");
    return res.json({ id: invitationId, expiresAt: updated.expiresAt, token });
  } catch (error) { return next(error); }
});
router.delete("/teams/:teamId/invitations/:invitationId", async (req, res, next) => {
  try {
    const teamId = z.coerce.number().int().positive().parse(req.params.teamId);
    const invitationId = z.coerce.number().int().positive().parse(req.params.invitationId);
    const actor = currentUser(req, res);
    await assertCaptainOrCommissioner(actor.id, [teamId]);
    const [updated] = await db.update(playerInvitations).set({ status: "CANCELLED", cancelledAt: new Date() }).where(and(eq(playerInvitations.id, invitationId), eq(playerInvitations.teamId, teamId), eq(playerInvitations.status, "PENDING"))).returning();
    if (!updated) return res.status(404).json({ error: "Pending invitation not found" });
    await audit(actor.id, "invitation", invitationId, "CANCELLED");
    return res.status(204).end();
  } catch (error) { return next(error); }
});
router.delete("/teams/:teamId/players/:userId", async (req, res, next) => {
  try {
    const teamId = z.coerce.number().int().positive().parse(req.params.teamId);
    const userId = z.coerce.number().int().positive().parse(req.params.userId);
    const actor = currentUser(req, res);
    await assertCaptainOrCommissioner(actor.id, [teamId]);
    const target = await db.query.teamMemberships.findFirst({ where: and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId), eq(teamMemberships.active, true)) });
    if (!target) return res.status(404).json({ error: "Active player not found" });
    if (target.membershipRole === "CAPTAIN" && actor.role !== "COMMISSIONER") return res.status(403).json({ error: "Only a commissioner can remove a captain" });
    await db.update(teamMemberships).set({ active: false, removedAt: new Date(), membershipRole: "PLAYER" }).where(eq(teamMemberships.id, target.id));
    await db.update(users).set({ role: "PLAYER" }).where(and(eq(users.id, userId), eq(users.role, "CAPTAIN")));
    await audit(actor.id, "membership", target.id, "REMOVED", target);
    return res.status(204).end();
  } catch (error) { return next(error); }
});
router.patch("/teams/:teamId/active", requireCommissioner, async (req, res, next) => {
  try {
    const teamId = z.coerce.number().int().positive().parse(req.params.teamId);
    const active = z.boolean().parse(req.body.active);
    const [updated] = await db.update(teams).set({ active }).where(eq(teams.id, teamId)).returning();
    if (!updated) return res.status(404).json({ error: "Team not found" });
    await audit(currentUser(req, res).id, "team", teamId, active ? "ACTIVATED" : "DEACTIVATED", undefined, updated);
    const response = (await teamList()).find((item) => item.id === updated.id);
    return res.json(response);
  } catch (error) { return next(error); }
});
router.get("/venues", requireCommissioner, async (_req, res, next) => {
  try { const league = await db.query.leagues.findFirst({ where: eq(leagues.active, true) }); res.json(league ? await db.select().from(venues).where(eq(venues.leagueId, league.id)).orderBy(asc(venues.name)) : []); } catch (error) { next(error); }
});
router.post("/venues", requireCommissioner, async (req, res, next) => {
  try { const input = venueInput.parse(req.body); const league = await db.query.leagues.findFirst({ where: eq(leagues.active, true) }); if (!league) return res.status(409).json({ error: "No active league configured" }); const [venue] = await db.insert(venues).values({ ...input, leagueId: league.id }).returning(); await audit(currentUser(req, res).id, "venue", venue!.id, "CREATED", undefined, venue); return res.status(201).json(venue); } catch (error) { return next(error); }
});
router.patch("/venues/:venueId", requireCommissioner, async (req, res, next) => {
  try { const venueId = z.coerce.number().int().positive().parse(req.params.venueId); const input = venueInput.partial().extend({ active: z.boolean().optional() }).parse(req.body); const [venue] = await db.update(venues).set(input).where(eq(venues.id, venueId)).returning(); if (!venue) return res.status(404).json({ error: "Venue not found" }); await audit(currentUser(req, res).id, "venue", venueId, "UPDATED", undefined, venue); return res.json(venue); } catch (error) { return next(error); }
});
router.get("/venues/:venueId/courts", requireCommissioner, async (req, res, next) => {
  try { const venueId = z.coerce.number().int().positive().parse(req.params.venueId); res.json(await db.select().from(courts).where(eq(courts.venueId, venueId)).orderBy(asc(courts.name))); } catch (error) { next(error); }
});
router.post("/venues/:venueId/courts", requireCommissioner, async (req, res, next) => {
  try { const venueId = z.coerce.number().int().positive().parse(req.params.venueId); const input = courtInput.parse(req.body); const [court] = await db.insert(courts).values({ ...input, venueId }).returning(); await audit(currentUser(req, res).id, "court", court!.id, "CREATED", undefined, court); return res.status(201).json(court); } catch (error) { return next(error); }
});
router.patch("/courts/:courtId", requireCommissioner, async (req, res, next) => {
  try { const courtId = z.coerce.number().int().positive().parse(req.params.courtId); const input = courtInput.partial().extend({ active: z.boolean().optional() }).parse(req.body); const [court] = await db.update(courts).set(input).where(eq(courts.id, courtId)).returning(); if (!court) return res.status(404).json({ error: "Court not found" }); await audit(currentUser(req, res).id, "court", courtId, "UPDATED", undefined, court); return res.json(court); } catch (error) { return next(error); }
});
router.get("/schedule", async (req, res, next) => { try { const filters = ListGamesQueryParams.parse(req.query); const user = currentUser(req, res); const all = await apiGames(filters.teamId, filters.date, user); res.json(ListGamesResponse.parse(user.role === "COMMISSIONER" ? all : all.filter((game) => game.published))); } catch (error) { next(error); } });
router.get("/schedule/:gameId", async (req, res, next) => { try { const { gameId } = GetGameParams.parse(req.params); const user = currentUser(req, res); const game = (await apiGames(undefined, undefined, user)).find((item) => item.id === gameId); if (!game || (!game.published && user.role !== "COMMISSIONER")) return res.status(404).json({ error: "Game not found" }); return res.json(GetGameResponse.parse(game)); } catch (error) { return next(error); } });
router.post("/schedule", requireCommissioner, async (req, res, next) => { try { const input = scheduleInput.parse(req.body); const game = await withScheduleMutationLock(async () => { const season = await validateGameInput(input); return (await db.insert(games).values({ ...input, seasonId: season.id, scheduledAt: new Date(input.scheduledAt), status: "DRAFT" }).returning())[0]!; }); await audit(currentUser(req, res).id, "game", game.id, "CREATED", undefined, game); const response = (await apiGames()).find((item) => item.id === game.id); return res.status(201).json(GetGameResponse.parse(response)); } catch (error) { return next(error); } });
router.patch("/schedule/:gameId", requireCommissioner, async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); const input = scheduleInput.parse(req.body); const result = await withScheduleMutationLock(async () => { const before = await db.query.games.findFirst({ where: eq(games.id, gameId) }); if (!before || (before.status !== "DRAFT" && before.status !== "PUBLISHED")) throw Object.assign(new Error("Only draft or published games can be edited"), { status: 409 }); await validateGameInput(input, gameId); const [game] = await db.update(games).set({ ...input, scheduledAt: new Date(input.scheduledAt) }).where(eq(games.id, gameId)).returning(); return { before, game: game! }; }); await audit(currentUser(req, res).id, "game", gameId, "UPDATED", result.before, result.game); const response = (await apiGames()).find((item) => item.id === result.game.id); return res.json(GetGameResponse.parse(response)); } catch (error) { return next(error); } });
router.post("/schedule/:gameId/publish", requireCommissioner, async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); const [game] = await db.update(games).set({ status: "PUBLISHED" }).where(and(eq(games.id, gameId), eq(games.status, "DRAFT"))).returning(); if (!game) return res.status(409).json({ error: "Only draft games can be published" }); await audit(currentUser(req, res).id, "game", gameId, "PUBLISHED"); return res.status(204).end(); } catch (error) { return next(error); } });
router.post("/schedule/:gameId/cancel", requireCommissioner, async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); const [game] = await db.update(games).set({ status: "CANCELLED" }).where(and(eq(games.id, gameId), ne(games.status, "FINAL"))).returning(); if (!game) return res.status(409).json({ error: "Final or missing games cannot be cancelled" }); await audit(currentUser(req, res).id, "game", gameId, "CANCELLED"); return res.status(204).end(); } catch (error) { return next(error); } });
router.get("/standings", async (_req, res, next) => { try { const rows = (await teamList()).filter((team) => team.active).map((team) => ({ teamName: team.name, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, differential: 0 })); const map = new Map(rows.map((row) => [row.teamName, row])); for (const game of await apiGames()) { if (game.status !== "FINAL" || game.homeScore === null || game.awayScore === null) continue; const home = map.get(game.homeTeam); const away = map.get(game.awayTeam); if (!home || !away) continue; home.played++; away.played++; home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore; away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore; if (game.homeScore > game.awayScore) { home.wins++; away.losses++; } else if (game.awayScore > game.homeScore) { away.wins++; home.losses++; } } res.json(GetStandingsResponse.parse(rows.map((row) => ({ ...row, differential: row.pointsFor - row.pointsAgainst })).sort((a,b) => b.wins-a.wins || b.differential-a.differential || b.pointsFor-a.pointsFor).map((row,index) => ({ rank:index+1,...row })))); } catch (error) { next(error); } });
router.post("/scores/:gameId", async (req, res, next) => { try { const { gameId } = SubmitScoreParams.parse(req.params); const input = SubmitScoreBody.parse(req.body); const game = await db.query.games.findFirst({ where: eq(games.id, gameId) }); if (!game) return res.status(404).json({ error: "Game not found" }); if (game.status !== "PUBLISHED") return res.status(409).json({ error: "Only published, unsubmitted games can receive a score" }); const actor = currentUser(req, res); await assertCaptainOrCommissioner(actor.id, [game.homeTeamId, game.awayTeamId]); const [updated] = await db.update(games).set({ ...input, status: "PENDING_CONFIRMATION", submittedByUserId: actor.id, submittedAt: new Date() }).where(and(eq(games.id, gameId), eq(games.status, "PUBLISHED"))).returning(); if (!updated) return res.status(409).json({ error: "This score was updated by another user" }); await audit(actor.id, "game", gameId, "SCORE_SUBMITTED", game, updated); return res.json(SubmitScoreResponse.parse({ gameId, homeScore: updated.homeScore!, awayScore: updated.awayScore!, status: "PENDING_CONFIRMATION" })); } catch (error) { return next(error); } });
router.get("/scores/review", requireCommissioner, async (_req, res, next) => { try { res.json(GetScoreReviewQueueResponse.parse((await apiGames()).filter((game) => game.status === "PENDING_CONFIRMATION" || game.status === "DISPUTED"))); } catch (error) { next(error); } });
router.post("/scores/:gameId/confirm", async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); const game = await db.query.games.findFirst({ where: eq(games.id, gameId) }); if (!game || game.status !== "PENDING_CONFIRMATION") return res.status(409).json({ error: "This score cannot be confirmed" }); const actor = currentUser(req, res); await assertOpposingCaptainOrCommissioner(actor.id, game); const [updated] = await db.update(games).set({ status: "FINAL", confirmedByUserId: actor.id, confirmedAt: new Date() }).where(and(eq(games.id, gameId), eq(games.status, "PENDING_CONFIRMATION"))).returning(); if (!updated) return res.status(409).json({ error: "This score was updated by another user" }); await audit(actor.id, "game", gameId, "SCORE_CONFIRMED", game, updated); return res.status(204).end(); } catch (error) { return next(error); } });
router.post("/scores/:gameId/dispute", async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); const input = disputeInput.parse(req.body); const game = await db.query.games.findFirst({ where: eq(games.id, gameId) }); if (!game) return res.status(404).json({ error: "Game not found" }); if (game.status !== "PENDING_CONFIRMATION") return res.status(409).json({ error: "Only submitted scores can be disputed" }); const actor = currentUser(req, res); await assertOpposingCaptainOrCommissioner(actor.id, game); const [updated] = await db.update(games).set({ status: "DISPUTED", disputeReason: input.reason, disputedByUserId: actor.id, disputedAt: new Date() }).where(and(eq(games.id, gameId), eq(games.status, "PENDING_CONFIRMATION"))).returning(); if (!updated) return res.status(409).json({ error: "This score was updated by another user" }); await audit(actor.id, "game", gameId, "SCORE_DISPUTED", game, updated); return res.status(204).end(); } catch (error) { return next(error); } });
router.post("/scores/:gameId/resolve", requireCommissioner, async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); const input = SubmitScoreBody.parse(req.body); const game = await db.query.games.findFirst({ where: eq(games.id, gameId) }); if (!game || game.status !== "DISPUTED") return res.status(409).json({ error: "Only disputed scores can be resolved" }); const actor = currentUser(req, res); await db.update(games).set({ ...input, status: "FINAL", resolvedByUserId: actor.id, resolvedAt: new Date() }).where(eq(games.id, gameId)); await audit(actor.id, "game", gameId, "SCORE_RESOLVED", game, input); return res.status(204).end(); } catch (error) { return next(error); } });
router.patch("/scores/:gameId", requireCommissioner, async (req, res, next) => { try { const gameId = z.coerce.number().int().positive().parse(req.params.gameId); const input = SubmitScoreBody.parse(req.body); const game = await db.query.games.findFirst({ where: eq(games.id, gameId) }); if (!game) return res.status(404).json({ error: "Game not found" }); if (!canCommissionerDirectScore(game.status)) return res.status(409).json({ error: "Only published games or final-score corrections can use direct score entry" }); const actor = currentUser(req, res); await db.update(games).set({ ...input, status: "FINAL", resolvedByUserId: actor.id, resolvedAt: new Date() }).where(eq(games.id, gameId)); await audit(actor.id, "game", gameId, game.status === "FINAL" ? "SCORE_CORRECTED" : "COMMISSIONER_SCORE_ENTERED", game, input); return res.status(204).end(); } catch (error) { return next(error); } });
export default router;