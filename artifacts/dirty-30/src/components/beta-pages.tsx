import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DashboardRole,
  GameStatus,
  PlayerStatus,
  getGetCurrentUserQueryKey,
  getGetDashboardQueryKey,
  getGetGameQueryKey,
  getGetTeamQueryKey,
  getGetTeamRosterQueryKey,
  getListGamesQueryKey,
  getListTeamsQueryKey,
  type Dashboard,
  type Game,
  type Player,
  type Team,
  useAcceptInvitation,
  useAssignTeamCaptain,
  useCancelInvitation,
  useCreateInvitation,
  useGetCurrentUser,
  useGetDashboard,
  useGetGame,
  useGetStandings,
  useGetTeam,
  useGetTeamRoster,
  useListGames,
  useRemoveTeamPlayer,
  useRegenerateInvitation,
  useSetTeamActive,
  useUpdateCurrentUser,
  useUpdateTeam,
} from "@workspace/api-client-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Link, useLocation, useParams } from "wouter";
import { CommissionerScheduleAdmin } from "./commissioner-schedule";
import { ScoreActions } from "./score-actions";

const card = "rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5";
const field = "mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]";
const action = "inline-flex min-h-11 items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50";
const quietAction = "inline-flex min-h-10 items-center justify-center rounded-lg border border-[hsl(var(--border))] px-3 text-xs font-bold hover:border-[hsl(var(--primary))]";

function errorText(error: unknown) {
  if (typeof error === "object" && error) {
    const value = error as { data?: { error?: string }; message?: string };
    return value.data?.error ?? value.message ?? "The league desk could not complete that action.";
  }
  return "The league desk could not complete that action.";
}

function normalizePhone(value: string) {
  const phone = parsePhoneNumberFromString(value, "US");
  return phone?.isValid() && phone.country === "US" ? phone.number : null;
}

function initials(value: string) {
  return value.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

export function DashboardPage() {
  const dashboard = useGetDashboard();
  const data = dashboard.data as Dashboard | undefined;
  const commissioner = data?.role === DashboardRole.COMMISSIONER;
  return <div className="animate-rise">
    <div className="mb-7 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><span className="rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-xs font-bold">{data?.role ?? "LEAGUE MEMBER"}</span><span>{data?.seasonName}</span></div>
    <section className="rounded-[24px] bg-[hsl(var(--primary))] p-7 text-[hsl(var(--primary-foreground))] sm:p-10"><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">{data?.leagueName ?? "Dirty-30"}</p><h1 className="mt-4 font-display text-5xl font-extrabold leading-[.9] tracking-[-.06em]">Game day<br /><span className="text-[hsl(var(--accent))]">starts here.</span></h1><p className="mt-5 max-w-lg text-sm text-[hsl(var(--primary-foreground)/.75)]">{commissioner ? "Your league desk has the schedule, rosters, and score reviews in one place." : "Your verified league home for games, teammates, and standings."}</p></section>
    <div className="mt-6 grid gap-5 lg:grid-cols-2"><section className={card}><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Up next</p>{data?.nextGame ? <GameSummary game={data.nextGame} /> : <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">No published game is scheduled yet.</p>}</section>{commissioner && <section className={card}><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--destructive))]">Commissioner desk</p><h2 className="mt-2 font-display text-2xl font-bold">Needs a look</h2><div className="mt-4 space-y-2">{data?.attentionItems.length ? data.attentionItems.map((item) => <p key={item} className="rounded-xl bg-[hsl(var(--muted))] p-3 text-sm">{item}</p>) : <p className="text-sm text-[hsl(var(--muted-foreground))]">No issues are waiting.</p>}</div></section>}</div>
  </div>;
}

export function TeamDetailPage() {
  const { teamId: rawTeamId } = useParams<{ teamId: string }>();
  const teamId = Number(rawTeamId);
  const client = useQueryClient();
  const current = useGetCurrentUser();
  const team = useGetTeam(teamId, { query: { queryKey: getGetTeamQueryKey(teamId), enabled: Number.isFinite(teamId) } });
  const roster = useGetTeamRoster(teamId, { query: { queryKey: getGetTeamRosterQueryKey(teamId), enabled: Number.isFinite(teamId) } });
  const update = useUpdateTeam();
  const invitation = useCreateInvitation();
  const regenerate = useRegenerateInvitation();
  const cancel = useCancelInvitation();
  const remove = useRemoveTeamPlayer();
  const assignCaptain = useAssignTeamCaptain();
  const setActive = useSetTeamActive();
  const [phone, setPhone] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [rename, setRename] = useState("");
  const data = team.data as Team | undefined;
  const players = (roster.data ?? []) as Player[];
  const canManage = Boolean(data?.canManageRoster);
  const commissioner = current.data?.role === DashboardRole.COMMISSIONER;
  const invalidate = () => void Promise.all([client.invalidateQueries({ queryKey: getGetTeamQueryKey(teamId) }), client.invalidateQueries({ queryKey: getGetTeamRosterQueryKey(teamId) }), client.invalidateQueries({ queryKey: getListTeamsQueryKey() })]);
  const createInvite = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    invitation.mutate({ teamId, data: { phone: normalized } }, { onSuccess: (result) => { const base = import.meta.env.BASE_URL.replace(/\/$/, ""); setInviteLink(`${window.location.origin}${base}/invite/${result.token}`); setPhone(""); invalidate(); } });
  };
  const pendingError = [invitation.error, regenerate.error, cancel.error, remove.error, assignCaptain.error, setActive.error, update.error].find(Boolean);

  return <div className="animate-rise"><Link href="/teams" className="mb-6 inline-block text-sm font-bold text-[hsl(var(--primary))]">← All teams</Link>
    <section className={card}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Team profile</p><h1 className="mt-2 font-display text-4xl font-extrabold">{data?.name ?? "Team"}</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{data?.captainName || "Captain TBA"} · {players.length || data?.playerCount || 0} of 8 occupied</p></div>{commissioner && <button className={quietAction} onClick={() => setActive.mutate({ teamId, data: { active: !data?.active } }, { onSuccess: invalidate })}>{data?.active ? "Deactivate team" : "Activate team"}</button>}</div>
      {commissioner && <form onSubmit={(event) => { event.preventDefault(); if (rename.trim()) update.mutate({ teamId, data: { name: rename.trim() } }, { onSuccess: () => { setRename(""); invalidate(); } }); }} className="mt-5 flex gap-2"><input value={rename} onChange={(event) => setRename(event.target.value)} placeholder="Rename team" className={field.replace("mt-2 ", "")} /><button type="submit" className={quietAction}>Save name</button></form>}
    </section>
    {canManage && <section className={`mt-5 ${card}`}><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Roster management</p><h2 className="mt-2 font-display text-2xl font-bold">Invite by verified phone</h2><form onSubmit={createInvite} className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="(312) 555-0123" className={field.replace("mt-2 ", "")} /><button className={action} type="submit">Create invite</button></form>{inviteLink && <div className="mt-3 flex gap-2 rounded-xl bg-[hsl(var(--muted))] p-3"><code className="min-w-0 flex-1 break-all text-xs">{inviteLink}</code><button className={quietAction} onClick={() => void navigator.clipboard.writeText(inviteLink)}>Copy</button></div>}{pendingError && <p className="mt-3 text-sm font-semibold text-[hsl(var(--destructive))]">{errorText(pendingError)}</p>}</section>}
    <section className={`mt-5 ${card}`}><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">The bench</p><h2 className="mt-2 font-display text-2xl font-bold">Roster</h2></div><span className="rounded-full bg-[hsl(var(--primary)/.12)] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">{players.length} of 8</span></div><div className="mt-4 divide-y divide-[hsl(var(--border))]">{players.map((player) => <div key={player.id} className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--muted))] font-bold">{initials(`${player.firstName} ${player.lastName}`)}</span><div className="min-w-0 flex-1"><p className="font-bold">{player.firstName} {player.lastName}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{player.phone ?? "Phone hidden"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${player.status === PlayerStatus.ACTIVE ? "bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]" : "bg-[hsl(var(--accent)/.28)]"}`}>{player.status}</span>{canManage && player.status === PlayerStatus.PENDING && <span className="flex gap-1"><button className={quietAction} onClick={() => regenerate.mutate({ teamId, invitationId: -player.id }, { onSuccess: (result) => { const base = import.meta.env.BASE_URL.replace(/\/$/, ""); setInviteLink(`${window.location.origin}${base}/invite/${result.token}`); } })}>Regenerate</button><button className={quietAction} onClick={() => cancel.mutate({ teamId, invitationId: -player.id }, { onSuccess: invalidate })}>Cancel</button></span>}{commissioner && player.status === PlayerStatus.ACTIVE && <span className="flex gap-1"><button className={quietAction} onClick={() => assignCaptain.mutate({ teamId, data: { userId: player.id } }, { onSuccess: invalidate })}>Captain</button><button className={quietAction} onClick={() => remove.mutate({ teamId, userId: player.id }, { onSuccess: invalidate })}>Remove</button></span>}</div>)}</div></section>
  </div>;
}

export function SchedulePage() {
  const games = useListGames();
  const profile = useGetCurrentUser();
  const list = (games.data ?? []) as Game[];
  const commissioner = profile.data?.role === DashboardRole.COMMISSIONER;
  return <div className="animate-rise"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">The board</p><h1 className="mt-2 font-display text-4xl font-extrabold">Schedule</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Published games for the league; drafts stay in the commissioner room.</p></div></div><div className="mt-6 space-y-3">{list.map((game) => <GameSummary key={game.id} game={game} />)}</div>{commissioner && <CommissionerScheduleAdmin />}</div>;
}

export function GameDetailPage() {
  const { gameId: rawGameId } = useParams<{ gameId: string }>();
  const gameId = Number(rawGameId);
  const query = useGetGame(gameId, { query: { queryKey: getGetGameQueryKey(gameId), enabled: Number.isFinite(gameId) } });
  const game = query.data as Game | undefined;
  if (query.isLoading) return <p className="text-sm">Loading game…</p>;
  if (!game) return <p className="text-sm text-[hsl(var(--destructive))]">This game could not be found.</p>;
  return <div className="animate-rise"><Link href="/schedule" className="mb-6 inline-block text-sm font-bold text-[hsl(var(--primary))]">← Schedule</Link><section className="rounded-[24px] bg-[hsl(var(--sidebar))] p-7 text-[hsl(var(--sidebar-foreground))]"><p className="text-center text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--accent))]">{game.date} · {game.startTime} · {game.venue} / {game.court}</p><div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><div><p className="font-display text-xl font-bold">{game.homeTeam}</p></div><div className="font-mono-custom text-3xl font-bold text-[hsl(var(--accent))]">{game.homeScore != null ? `${game.homeScore} – ${game.awayScore}` : "VS"}</div><div><p className="font-display text-xl font-bold">{game.awayTeam}</p></div></div><p className="mt-5 text-center text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.55)]">{!game.published ? "Draft" : game.status.replaceAll("_", " ")}</p></section><ScoreActions game={game} /></div>;
}

export function ProfilePage() {
  const profile = useGetCurrentUser();
  const update = useUpdateCurrentUser();
  const client = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  useEffect(() => { if (profile.data) { setFirstName(profile.data.firstName); setLastName(profile.data.lastName); } }, [profile.data]);
  return <div className="animate-rise max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Your league account</p><h1 className="mt-2 font-display text-4xl font-extrabold">Profile</h1><form onSubmit={(event) => { event.preventDefault(); if (firstName.trim() && lastName.trim()) update.mutate({ data: { firstName: firstName.trim(), lastName: lastName.trim() } }, { onSuccess: (result) => client.setQueryData(getGetCurrentUserQueryKey(), result) }); }} className={`mt-6 space-y-5 ${card}`}><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={field} /></label><label className="text-sm font-bold">Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} className={field} /></label></div><div className="rounded-xl bg-[hsl(var(--muted))] p-4"><p className="text-xs font-bold uppercase tracking-[.14em]">Verified phone</p><p className="mt-1 font-bold">{profile.data?.phone}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Phone changes require commissioner support and Clerk verification; they cannot be edited here.</p></div><div className="rounded-xl bg-[hsl(var(--muted))] p-4"><p className="text-xs font-bold uppercase tracking-[.14em]">Optional verified email</p><p className="mt-1 font-bold">{profile.data?.email ?? "No verified Clerk email on file"}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">This value is supplied by Clerk when verified and is not used for sign-in.</p></div>{update.error && <p className="text-sm font-semibold text-[hsl(var(--destructive))]">{errorText(update.error)}</p>}<button type="submit" className={action}>Save profile</button></form></div>;
}

export function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const accept = useAcceptInvitation();
  const client = useQueryClient();
  const [, navigate] = useLocation();
  return <div className="mx-auto max-w-xl py-12"><section className={`${card} text-center`}><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Team invitation</p><h1 className="mt-3 font-display text-3xl font-extrabold">Ready to take a roster spot?</h1><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Your signed-in verified phone must match the captain’s invitation.</p>{accept.error && <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm font-semibold text-[hsl(var(--destructive))]">{errorText(accept.error)}</p>}<button className={`${action} mt-5`} disabled={accept.isPending} onClick={() => token && accept.mutate({ token }, { onSuccess: (result) => { void Promise.all([client.invalidateQueries({ queryKey: getListTeamsQueryKey() }), client.invalidateQueries({ queryKey: getGetTeamQueryKey(result.teamId) }), client.invalidateQueries({ queryKey: getGetTeamRosterQueryKey(result.teamId) })]); navigate(`/teams/${result.teamId}`); } })}>{accept.isPending ? "Joining team…" : "Accept invitation"}</button></section></div>;
}

function GameSummary({ game }: { game: Game }) {
  return <Link href={`/schedule/${game.id}`} className={`${card} block transition hover:border-[hsl(var(--primary))]`}><div className="flex justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{game.date} · {game.startTime}</p><span className="rounded-full bg-[hsl(var(--muted))] px-2 py-1 text-[10px] font-bold">{!game.published ? "DRAFT" : game.status.replaceAll("_", " ")}</span></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3"><strong>{game.homeTeam}</strong><span className="font-mono-custom text-lg font-bold">{game.homeScore != null ? `${game.homeScore} – ${game.awayScore}` : "VS"}</span><strong className="text-right">{game.awayTeam}</strong></div><p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">{game.venue} · {game.court}</p></Link>;
}