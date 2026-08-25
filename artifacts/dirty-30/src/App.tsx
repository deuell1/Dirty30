import { useEffect, useState, type ReactNode } from "react";
import { useAuth, useClerk } from "@clerk/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  DashboardRole, getGetScoreReviewQueueQueryKey, getGetStandingsQueryKey, getListGamesQueryKey, getListTeamsQueryKey,
  useConfirmScore, useCreateTeam, useDisputeScore, useGetCurrentUser, useGetScoreReviewQueue, useGetStandings,
  useHealthCheck, useListTeams, setAuthTokenGetter, type Game, type Standing, type Team,
} from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { PhoneAuthScreen } from "@/components/phone-auth";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardPage, GameDetailPage, InvitationPage, ProfilePage, SchedulePage, TeamDetailPage } from "@/components/beta-pages";
import NotFound from "@/pages/not-found";
import { Link, Route, Router as WouterRouter, Switch, useLocation } from "wouter";

const queryClient = new QueryClient();
const navItems = [["/", "Home"], ["/schedule", "Schedule"], ["/teams", "Teams"], ["/standings", "Standings"]] as const;

function roleLabel(role?: string) {
  return role === DashboardRole.COMMISSIONER ? "Commissioner" : role === DashboardRole.CAPTAIN ? "Captain" : "Player";
}

function Button({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <button {...props} className={`min-h-10 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50 ${props.className ?? ""}`}>{children}</button>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const user = useGetCurrentUser().data;
  const health = useHealthCheck();
  const review = useGetScoreReviewQueue({ query: { enabled: user?.role === DashboardRole.COMMISSIONER, queryKey: getGetScoreReviewQueueQueryKey() } });
  return <div className="min-h-[100dvh] bg-[hsl(var(--background))]">
    <header className="sticky top-0 z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4"><Link href="/" className="font-display text-xl font-extrabold">DIRTY-30</Link>
        <nav className="flex flex-1 flex-wrap gap-1">{navItems.map(([href, label]) => <Link key={href} href={href} className={`rounded-lg px-3 py-2 text-sm font-bold ${location === href || href !== "/" && location.startsWith(href) ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}>{label}</Link>)}
          {user?.role === DashboardRole.COMMISSIONER && <Link href="/review" className="rounded-lg px-3 py-2 text-sm font-bold text-[hsl(var(--muted-foreground))]">Review ({(review.data as Game[] | undefined)?.length ?? 0})</Link>}
        </nav>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{health.data ? "Systems online" : "League room"} · {roleLabel(user?.role)}</span>
        <Link href="/settings" className="text-sm font-bold">Profile</Link><button onClick={() => void signOut()} className="text-sm font-bold text-[hsl(var(--muted-foreground))]">Sign out</button>
      </div>
    </header><main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
  </div>;
}

function Teams() {
  const teams = useListTeams();
  const currentUser = useGetCurrentUser();
  const create = useCreateTeam();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const isCommissioner = currentUser.data?.role === DashboardRole.COMMISSIONER;
  return <section><div className="mb-6 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[hsl(var(--primary))]">League clubhouse</p><h1 className="font-display text-4xl font-extrabold">Teams</h1></div>{isCommissioner && <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate({ data: { name: name.trim() } }, { onSuccess: () => { setName(""); void client.invalidateQueries({ queryKey: getListTeamsQueryKey() }); } }); }} className="flex gap-2"><input aria-label="New team name" value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border px-3" placeholder="Team name" /><Button type="submit" disabled={create.isPending}>Add team</Button></form>}</div>
    {teams.isLoading ? <p>Loading teams…</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(teams.data as Team[] | undefined)?.map((team) => <Link key={team.id} href={`/teams/${team.id}`} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"><p className="font-display text-2xl font-bold">{team.name}</p><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{team.playerCount} players · {team.captainName ?? "Captain TBA"}</p></Link>)}</div>}
  </section>;
}

function Standings() {
  const standings = useGetStandings();
  return <section><p className="text-xs font-bold uppercase text-[hsl(var(--primary))]">The table</p><h1 className="mb-6 font-display text-4xl font-extrabold">Standings</h1><div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))]">{(standings.data as Standing[] | undefined)?.map((row) => <div key={row.teamName} className="grid grid-cols-[36px_1fr_repeat(3,auto)] gap-4 border-b p-4 last:border-0"><b>{row.rank}</b><b>{row.teamName}</b><span>{row.wins}W</span><span>{row.losses}L</span><span>{row.differential > 0 ? "+" : ""}{row.differential}</span></div>) ?? <p className="p-5">Loading standings…</p>}</div></section>;
}

function ReviewPersisted() {
  const queue = useGetScoreReviewQueue();
  const confirm = useConfirmScore();
  const dispute = useDisputeScore();
  const client = useQueryClient();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const refresh = () => void Promise.all([client.invalidateQueries({ queryKey: getGetScoreReviewQueueQueryKey() }), client.invalidateQueries({ queryKey: getListGamesQueryKey() }), client.invalidateQueries({ queryKey: getGetStandingsQueryKey() })]);
  return <section><p className="text-xs font-bold uppercase text-[hsl(var(--primary))]">Commissioner desk</p><h1 className="mb-6 font-display text-4xl font-extrabold">Review queue</h1><div className="space-y-3">{(queue.data as Game[] | undefined)?.map((game) => <article key={game.id} className="rounded-2xl border p-5"><h2 className="font-display text-2xl font-bold">{game.homeTeam} {game.homeScore} — {game.awayScore} {game.awayTeam}</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{game.venue} · {game.court}</p><input aria-label={`Dispute reason for ${game.id}`} value={reasons[game.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [game.id]: event.target.value })} className="mt-4 w-full rounded-lg border p-2" placeholder="Dispute reason" /><div className="mt-3 flex gap-2"><Button onClick={() => confirm.mutate({ gameId: game.id }, { onSuccess: refresh })}>Confirm score</Button><Button disabled={(reasons[game.id]?.trim().length ?? 0) < 3} onClick={() => dispute.mutate({ gameId: game.id, data: { reason: reasons[game.id].trim() } }, { onSuccess: refresh })}>Dispute</Button></div></article>) ?? <p>No scores waiting for review.</p>}</div></section>;
}

export function AuthBoundary() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [location, setLocation] = useLocation();
  useEffect(() => { setAuthTokenGetter(() => getToken()); return () => setAuthTokenGetter(null); }, [getToken]);
  useEffect(() => { if (!isSignedIn) return; const invite = window.sessionStorage.getItem("dirty30-invitation-return"); if (invite && invite !== location) { window.sessionStorage.removeItem("dirty30-invitation-return"); setLocation(invite); } }, [isSignedIn, location, setLocation]);
  if (!isLoaded) return <div className="grid min-h-[100dvh] place-items-center">Opening the league room…</div>;
  if (!isSignedIn) { if (location.startsWith("/invite/")) window.sessionStorage.setItem("dirty30-invitation-return", location); return <PhoneAuthScreen />; }
  return <Router />;
}

function Router() {
  const [location] = useLocation();
  return <Shell><ErrorBoundary resetKey={location}><Switch><Route path="/invite/:token" component={InvitationPage} /><Route path="/" component={DashboardPage} /><Route path="/teams/:teamId" component={TeamDetailPage} /><Route path="/teams" component={Teams} /><Route path="/schedule/:gameId" component={GameDetailPage} /><Route path="/schedule" component={SchedulePage} /><Route path="/standings" component={Standings} /><Route path="/review" component={ReviewPersisted} /><Route path="/settings" component={ProfilePage} /><Route component={NotFound} /></Switch></ErrorBoundary></Shell>;
}

export default function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}><AuthBoundary /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}