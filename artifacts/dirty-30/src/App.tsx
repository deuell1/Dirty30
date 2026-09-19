import { useEffect, useState, type ReactNode } from "react";
import { useAuth, useClerk } from "@clerk/react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  DashboardRole,
  getGetCurrentUserQueryKey,
  getGetDashboardQueryKey,
  getGetGameQueryKey,
  getGetLeagueInitializationStatusQueryKey,
  getGetScoreReviewQueueQueryKey,
  getGetStandingsQueryKey,
  getListGamesQueryKey,
  getListTeamsQueryKey,
  useConfirmScore,
  useCreateTeam,
  useDisputeScore,
  useGetCurrentUser,
  useGetLeagueInitializationStatus,
  useGetScoreReviewQueue,
  useGetStandings,
  useHealthCheck,
  useListTeams,
  setAuthTokenGetter,
  type Game,
  type Standing,
  type Team,
} from "@workspace/api-client-react";
import { Home, Calendar, Users, Trophy, ClipboardCheck } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { bootstrapQueryOptions } from "@/bootstrap-query";
import { PhoneAuthScreen } from "@/components/phone-auth";
import { ScoreActions } from "@/components/score-actions";
import {
  invitationResumePath,
  pendingSurface,
  preservedInvitationPath,
  rememberInvitationPath,
} from "@/components/invitation-flow";
import {
  LeagueInitializationScreen,
  shouldShowLeagueInitialization,
} from "@/components/league-initialization";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DashboardPage,
  GameDetailPage,
  InvitationPage,
  ProfilePage,
  SchedulePage,
  TeamDetailPage,
} from "@/components/beta-pages";
import NotFound from "@/pages/not-found";
import {
  Link,
  Route,
  Router as WouterRouter,
  Switch,
  useLocation,
} from "wouter";

const queryClient = new QueryClient();
const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/standings", label: "Standings", icon: Trophy },
] as const;

function roleLabel(role?: string) {
  return role === DashboardRole.COMMISSIONER
    ? "Commissioner"
    : role === DashboardRole.CAPTAIN
      ? "Captain"
      : "Player";
}

function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`min-h-10 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const user = useGetCurrentUser().data;
  const health = useHealthCheck();
  const review = useGetScoreReviewQueue({
    query: {
      enabled: user?.role === DashboardRole.COMMISSIONER,
      queryKey: getGetScoreReviewQueueQueryKey(),
    },
  });
  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))] pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <header className="sticky top-0 z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-5 sm:py-4">
        <div className="mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-3 sm:gap-4">
          <Link href="/" className="min-w-0">
            <span className="block font-display text-xl font-extrabold sm:text-2xl">
              DIRTY-30
            </span>
            <span className="block truncate text-[11px] font-bold text-[hsl(var(--muted-foreground))] sm:hidden">
              {roleLabel(user?.role)}
            </span>
          </Link>
          <nav className="hidden flex-1 flex-wrap items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${location === item.href || (item.href !== "/" && location.startsWith(item.href)) ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}
              >
                {item.label}
              </Link>
            ))}
            {user?.role === DashboardRole.COMMISSIONER && (
              <Link
                href="/review"
                className={`rounded-lg px-3 py-2 text-sm font-bold ${location.startsWith("/review") ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}
              >
                Review ({(review.data as Game[] | undefined)?.length ?? 0})
              </Link>
            )}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:inline">
              {health.data ? "Systems online" : "League room"} ·{" "}
              {roleLabel(user?.role)}
            </span>
            {user?.role === DashboardRole.COMMISSIONER && (
              <Link
                href="/review"
                className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] sm:hidden"
                aria-label="Review Queue"
              >
                <ClipboardCheck className="h-5 w-5" />
                {((review.data as Game[] | undefined)?.length ?? 0) > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--destructive))] text-[10px] font-bold text-[hsl(var(--destructive-foreground))]">
                    {(review.data as Game[] | undefined)?.length}
                  </span>
                )}
              </Link>
            )}
            <Link
              href="/settings"
              className="flex min-h-[44px] items-center text-sm font-bold"
            >
              Profile
            </Link>
            <button
              onClick={() => void signOut()}
              className="flex min-h-[44px] items-center text-sm font-bold text-[hsl(var(--muted-foreground))]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-8">
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] pb-[env(safe-area-inset-bottom)] sm:hidden">
        {navItems.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 ${isActive ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs font-bold">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Teams() {
  const teams = useListTeams();
  const currentUser = useGetCurrentUser();
  const create = useCreateTeam();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const isCommissioner = currentUser.data?.role === DashboardRole.COMMISSIONER;
  return (
    <section>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end sm:gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-[hsl(var(--primary))]">
            League clubhouse
          </p>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
            Teams
          </h1>
        </div>
        {isCommissioner && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim())
                create.mutate(
                  { data: { name: name.trim() } },
                  {
                    onSuccess: () => {
                      setName("");
                      void client.invalidateQueries({
                        queryKey: getListTeamsQueryKey(),
                      });
                    },
                  },
                );
            }}
            className="flex w-full gap-2 sm:w-auto"
          >
            <input
              aria-label="New team name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border px-3 sm:w-auto"
              placeholder="Team name"
            />
            <Button
              type="submit"
              disabled={create.isPending}
              className="whitespace-nowrap"
            >
              Add team
            </Button>
          </form>
        )}
      </div>
      {teams.isLoading ? (
        <p>Loading teams…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(teams.data as Team[] | undefined)?.map((team) => (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
            >
              <p className="font-display text-2xl font-bold">{team.name}</p>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                {team.playerCount} players · {team.captainName ?? "Captain TBA"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function Standings() {
  const standings = useGetStandings();
  return (
    <section>
      <p className="text-xs font-bold uppercase text-[hsl(var(--primary))]">
        The table
      </p>
      <h1 className="mb-6 font-display text-3xl font-extrabold sm:text-4xl">
        Standings
      </h1>
      <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))]">
        {(standings.data as Standing[] | undefined)?.map((row) => (
          <div key={row.teamName} className="border-b p-3 last:border-0 sm:p-4">
            <div className="sm:hidden">
              <div className="flex min-w-0 items-start gap-3">
                <b className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[hsl(var(--muted))]">
                  {row.rank}
                </b>
                <b className="min-w-0 flex-1 break-words">{row.teamName}</b>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 pl-10 text-center">
                <span className="rounded-lg bg-[hsl(var(--muted)/.65)] p-2">
                  <small className="block text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
                    Wins
                  </small>
                  <strong>{row.wins}</strong>
                </span>
                <span className="rounded-lg bg-[hsl(var(--muted)/.65)] p-2">
                  <small className="block text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
                    Losses
                  </small>
                  <strong>{row.losses}</strong>
                </span>
                <span className="rounded-lg bg-[hsl(var(--muted)/.65)] p-2">
                  <small className="block text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
                    Diff
                  </small>
                  <strong>
                    {row.differential > 0 ? "+" : ""}
                    {row.differential}
                  </strong>
                </span>
              </div>
            </div>
            <div className="hidden grid-cols-[36px_1fr_repeat(3,auto)] items-center gap-4 text-base sm:grid">
              <b>{row.rank}</b>
              <b className="min-w-0 break-words">{row.teamName}</b>
              <span>{row.wins}W</span>
              <span>{row.losses}L</span>
              <span>
                {row.differential > 0 ? "+" : ""}
                {row.differential}
              </span>
            </div>
          </div>
        )) ?? <p className="p-5">Loading standings…</p>}
      </div>
    </section>
  );
}

function ReviewPersisted() {
  const queue = useGetScoreReviewQueue();
  const confirm = useConfirmScore();
  const dispute = useDisputeScore();
  const client = useQueryClient();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const refresh = (gameId: number) =>
    void Promise.all([
      client.invalidateQueries({ queryKey: getGetScoreReviewQueueQueryKey() }),
      client.invalidateQueries({ queryKey: getListGamesQueryKey() }),
      client.invalidateQueries({ queryKey: getGetStandingsQueryKey() }),
      client.invalidateQueries({ queryKey: getGetGameQueryKey(gameId) }),
      client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
    ]);
  return (
    <section>
      <p className="text-xs font-bold uppercase text-[hsl(var(--primary))]">
        Commissioner desk
      </p>
      <h1 className="mb-6 font-display text-3xl font-extrabold sm:text-4xl">
        Review queue
      </h1>
      <div className="space-y-3">
        {(queue.data as Game[] | undefined)?.map((game) => (
          <article key={game.id} className="rounded-2xl border p-5">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
              <div className="w-full min-w-0">
                <h2 className="break-words font-display text-xl font-bold sm:text-2xl">
                  {game.homeTeam} {game.homeScore} — {game.awayScore}{" "}
                  {game.awayTeam}
                </h2>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {game.venue} · {game.court}
                </p>
              </div>
              <Link
                href={`/schedule/${game.id}`}
                className="flex w-full min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--primary)/.1)] text-sm font-bold text-[hsl(var(--primary))] sm:w-auto sm:min-h-0 sm:bg-transparent sm:px-0"
              >
                Game detail
              </Link>
            </div>
            {game.status === "DISPUTED" ? (
              <>
                <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.08)] p-3 text-sm">
                  <strong>Disputed score.</strong>{" "}
                  {game.disputeReason ??
                    "A captain requested commissioner review."}
                </p>
                <ScoreActions game={game} />
              </>
            ) : (
              <>
                <input
                  aria-label={`Dispute reason for ${game.id}`}
                  value={reasons[game.id] ?? ""}
                  onChange={(event) =>
                    setReasons({ ...reasons, [game.id]: event.target.value })
                  }
                  className="mt-4 min-h-[44px] w-full rounded-lg border px-3"
                  placeholder="Dispute reason"
                />
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() =>
                      confirm.mutate(
                        { gameId: game.id },
                        { onSuccess: () => refresh(game.id) },
                      )
                    }
                  >
                    Confirm score
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={(reasons[game.id]?.trim().length ?? 0) < 3}
                    onClick={() =>
                      dispute.mutate(
                        {
                          gameId: game.id,
                          data: { reason: reasons[game.id].trim() },
                        },
                        { onSuccess: () => refresh(game.id) },
                      )
                    }
                  >
                    Dispute
                  </Button>
                </div>
              </>
            )}
          </article>
        )) ?? <p>No scores waiting for review.</p>}
      </div>
    </section>
  );
}

export function AuthBoundary() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const [location, setLocation] = useLocation();
  const invitationStorage =
    typeof window === "undefined" ? null : window.sessionStorage;
  const profile = useGetCurrentUser({
    query: {
      ...bootstrapQueryOptions,
      enabled: Boolean(isSignedIn),
      queryKey: [...getGetCurrentUserQueryKey(), userId],
    },
  });
  const shouldCheckInitialization =
    profile.data?.role === DashboardRole.COMMISSIONER &&
    profile.data.accessState === "ACTIVE";
  const initialization = useGetLeagueInitializationStatus({
    query: {
      ...bootstrapQueryOptions,
      enabled: shouldCheckInitialization,
      queryKey: [...getGetLeagueInitializationStatusQueryKey(), userId],
    },
  });
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  useEffect(() => {
    if (!isSignedIn || !invitationStorage) return;
    const invite = invitationResumePath(location, invitationStorage);
    if (invite) setLocation(invite);
  }, [invitationStorage, isSignedIn, location, setLocation]);
  if (!isLoaded)
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        Opening the league room…
      </div>
    );
  if (!isSignedIn) {
    if (invitationStorage) rememberInvitationPath(invitationStorage, location);
    return (
      <PhoneAuthScreen
        returnTo={
          invitationStorage ? preservedInvitationPath(invitationStorage) : null
        }
      />
    );
  }
  if (profile.isLoading)
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        Checking your league access…
      </div>
    );
  if (profile.error)
    return (
      <AccessUnavailableScreen
        onRetry={() => void profile.refetch()}
        retrying={profile.isFetching}
      />
    );
  if (shouldCheckInitialization && initialization.isLoading)
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        Checking league setup…
      </div>
    );
  if (shouldCheckInitialization && initialization.error)
    return (
      <AccessUnavailableScreen
        onRetry={() => void initialization.refetch()}
        retrying={initialization.isFetching}
      />
    );
  if (
    shouldShowLeagueInitialization(
      profile.data?.role,
      profile.data?.accessState,
      initialization.data,
    )
  )
    return <LeagueInitializationScreen status={initialization.data!} />;
  const preservedInvite = invitationStorage
    ? preservedInvitationPath(invitationStorage)
    : null;
  const resumeInvite = invitationStorage
    ? invitationResumePath(location, invitationStorage)
    : null;
  if (resumeInvite)
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        Returning to your invitation…
      </div>
    );
  const surface = profile.data
    ? pendingSurface(location, profile.data.accessState, preservedInvite)
    : "active";
  if (surface === "waiting") return <PendingAccessScreen />;
  if (surface === "invitation") return <InvitationPage />;
  return <Router />;
}

function PendingAccessScreen() {
  const { signOut } = useClerk();
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] p-5">
      <section className="max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-7 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
          Dirty-30 closed beta
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold">
          Waiting for an invitation
        </h1>
        <p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
          This league is invitation-only. Ask your captain or commissioner to
          invite the verified phone number you used to sign in.
        </p>
        <button
          onClick={() => void signOut()}
          className="mt-6 min-h-11 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))]"
        >
          Sign out
        </button>
      </section>
    </main>
  );
}

function AccessUnavailableScreen({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  const { signOut } = useClerk();
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] p-5">
      <section className="max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-7 text-center">
        <h1 className="font-display text-3xl font-extrabold">
          Couldn’t load league access
        </h1>
        <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
          Your verified account was found, but we couldn’t refresh its league
          access right now.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={onRetry}
            disabled={retrying}
            className="min-h-11 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))]"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
          <button
            onClick={() => void signOut()}
            className="min-h-11 rounded-xl border px-4 text-sm font-bold"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <Shell>
      <ErrorBoundary resetKey={location}>
        <Switch>
          <Route path="/invite/:token" component={InvitationPage} />
          <Route path="/" component={DashboardPage} />
          <Route path="/teams/:teamId" component={TeamDetailPage} />
          <Route path="/teams" component={Teams} />
          <Route path="/schedule/:gameId" component={GameDetailPage} />
          <Route path="/schedule" component={SchedulePage} />
          <Route path="/standings" component={Standings} />
          <Route path="/review" component={ReviewPersisted} />
          <Route path="/settings" component={ProfilePage} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </Shell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthBoundary />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
