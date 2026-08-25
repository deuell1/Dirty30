import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Flag,
  Hash,
  LayoutDashboard,
  Menu,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sun,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import {
  DashboardRole,
  GameStatus,
  PlayerStatus,
  getGetDashboardQueryKey,
  getGetGameQueryKey,
  getGetCurrentUserQueryKey,
  getGetScoreReviewQueueQueryKey,
  getGetStandingsQueryKey,
  getGetTeamQueryKey,
  getGetTeamRosterQueryKey,
  getListGamesQueryKey,
  getListTeamsQueryKey,
  useCreateTeam,
  useCreateInvitation,
  useCancelInvitation,
  useConfirmScore,
  useDisputeScore,
  useGetDashboard,
  useGetCurrentUser,
  useGetGame,
  useGetScoreReviewQueue,
  useGetStandings,
  useGetTeam,
  useGetTeamRoster,
  useHealthCheck,
  useListGames,
  useListTeams,
  useSubmitScore,
  useUpdateTeam,
  useUpdateCurrentUser,
  setAuthTokenGetter,
  useRegenerateInvitation,
  useAcceptInvitation,
  useAssignTeamCaptain,
  useSetTeamActive,
  useRemoveTeamPlayer,
  type Dashboard,
  type Game,
  type Player,
  type Standing,
  type Team,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { PhoneAuthScreen } from '@/components/phone-auth';
import { CommissionerScheduleAdmin } from '@/components/commissioner-schedule';
import { ScoreActions } from '@/components/score-actions';
import { DashboardPage, GameDetailPage, InvitationPage, ProfilePage, SchedulePage, TeamDetailPage } from '@/components/beta-pages';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

const navItems = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/teams', label: 'Teams', icon: UsersRound },
  { href: '/standings', label: 'Standings', icon: Trophy },
];

function cx(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(' ');
}

function formatDate(value?: string) {
  if (!value) return 'Date TBA';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(parsed);
}

function formatLongDate(value?: string) {
  if (!value) return 'Date TBA';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(parsed);
}

function roleLabel(role?: string) {
  return role === DashboardRole.COMMISSIONER ? 'Commissioner' : role === DashboardRole.CAPTAIN ? 'Captain' : 'Player';
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}
function normalizeUsPhoneInput(value: string) {
  const phone = parsePhoneNumberFromString(value.trim(), 'US');
  return phone?.isValid() && phone.country === 'US' ? phone.number : null;
}
function apiError(error: unknown, fallback = 'The league desk could not complete that action.') {
  if (typeof error === 'object' && error) {
    const value = error as { data?: { error?: string }; message?: string };
    return value.data?.error ?? value.message ?? fallback;
  }
  return fallback;
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'teal' | 'coral' | 'dark' }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em]', tone === 'gold' && 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]', tone === 'teal' && 'bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]', tone === 'coral' && 'bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]', tone === 'dark' && 'bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]', tone === 'neutral' && 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]')}>{children}</span>;
}

function Button({ children, className, variant = 'primary', onClick, type = 'button', disabled, testId }: {
  children: ReactNode;
  className?: string;
  variant?: 'primary' | 'outline' | 'ghost' | 'coral';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  testId: string;
}) {
  return <button data-testid={testId} type={type} onClick={onClick} disabled={disabled} className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0', variant === 'primary' && 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_4px_0_hsl(var(--primary)/.22)]', variant === 'outline' && 'border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]', variant === 'ghost' && 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]', variant === 'coral' && 'bg-[hsl(var(--destructive))] text-white shadow-[0_4px_0_hsl(var(--destructive)/.2)]', className)}>{children}</button>;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse-soft rounded-lg bg-[hsl(var(--muted))]', className)} />;
}

function QueryState({ loading, error, onRetry, children, empty = false, emptyLabel = 'Nothing to show yet.' }: { loading?: boolean; error?: unknown; onRetry?: () => void; children?: ReactNode; empty?: boolean; emptyLabel?: string }) {
  if (loading) return <div className="space-y-3" data-testid="state-loading"><Skeleton className="h-24 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-32 w-full" /></div>;
  if (error) return <div className="rounded-2xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.06)] p-6 text-center" data-testid="state-error"><CircleAlert className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--destructive))]" /><p className="font-display text-lg font-bold">The scoreboard took a breather.</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">We couldn't load this section right now.</p><Button className="mt-4" variant="outline" onClick={onRetry} testId="button-retry"><RefreshCw className="h-4 w-4" /> Try again</Button></div>;
  if (empty) return <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] p-10 text-center" data-testid="state-empty"><Flag className="mx-auto mb-3 h-7 w-7 text-[hsl(var(--primary))]" /><p className="font-display text-lg font-bold">{emptyLabel}</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Check back when the league gets moving.</p></div>;
  return <>{children}</>;
}

function LeagueLogo() {
  return <Link href="/" data-testid="link-brand" className="group flex items-center gap-3">
    <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] shadow-[3px_3px_0_hsl(var(--primary))] transition group-hover:rotate-[-5deg]">
      <span className="font-display text-lg font-extrabold leading-none">D</span>
      <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-[hsl(var(--destructive))]" />
    </span>
    <span><span className="block font-display text-lg font-extrabold tracking-[-.04em]">DIRTY-30</span><span className="font-mono-custom text-[8px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">League HQ</span></span>
  </Link>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const health = useHealthCheck();
  const currentUser = useGetCurrentUser().data;
  const review = useGetScoreReviewQueue({ query: { queryKey: getGetScoreReviewQueueQueryKey(), enabled: currentUser?.role === DashboardRole.COMMISSIONER } });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const { signOut } = useClerk();
  const displayName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'League member';
  const displayInitials = initials(displayName);
  const isCommissioner = currentUser?.role === DashboardRole.COMMISSIONER;
  const reviewCount = isCommissioner ? ((review.data as Game[] | undefined)?.length ?? 0) : 0;
  const active = (href: string) => href === '/' ? location === '/' : location.startsWith(href);
  const toggleDark = () => {
    setDark((current) => {
      document.documentElement.classList.toggle('dark', !current);
      return !current;
    });
  };
  return <div className="noise min-h-[100dvh] bg-[hsl(var(--background))]">
    <aside className={cx('fixed inset-y-0 left-0 z-30 flex w-[252px] flex-col bg-[hsl(var(--sidebar))] px-5 py-6 text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
      <div className="flex items-center justify-between"><LeagueLogo /><button data-testid="button-close-menu" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-[hsl(var(--sidebar-foreground)/.65)] hover:bg-[hsl(var(--sidebar-accent))] lg:hidden"><X className="h-5 w-5" /></button></div>
       <div className="mt-12"><p className="mb-3 px-3 font-mono-custom text-[9px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.42)]">League room</p><nav className="space-y-1">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase()}`} onClick={() => setMobileOpen(false)} className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition', active(href) ? 'bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.67)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]')}><Icon className="h-[18px] w-[18px]" />{label}{href === '/schedule' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--destructive))]" />}</Link>)}</nav></div>
       <div className="mt-auto space-y-1">{isCommissioner && <Link href="/review" data-testid="link-nav-review" className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition', active('/review') ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.67)] hover:bg-[hsl(var(--sidebar-accent))]')}><ClipboardCheck className="h-[18px] w-[18px]" />Review queue<Badge tone="gold">{reviewCount}</Badge></Link>}<Link href="/settings" data-testid="link-nav-settings" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[hsl(var(--sidebar-foreground)/.67)] transition hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]"><Settings className="h-[18px] w-[18px]" />Settings</Link></div>
      <div className="mt-5 border-t border-[hsl(var(--sidebar-border))] pt-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--sidebar-primary))] font-display text-sm font-bold text-[hsl(var(--sidebar-primary-foreground))]">{displayInitials}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{displayName}</p><p className="text-[10px] text-[hsl(var(--sidebar-foreground)/.48)]">{roleLabel(currentUser?.role)}</p></div><button data-testid="button-toggle-theme" onClick={toggleDark} className="ml-auto rounded-lg p-2 text-[hsl(var(--sidebar-foreground)/.52)] hover:bg-[hsl(var(--sidebar-accent))]">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button></div><button data-testid="button-sign-out" onClick={() => void signOut()} className="mt-4 text-xs font-bold text-[hsl(var(--sidebar-foreground)/.58)] hover:text-[hsl(var(--sidebar-foreground))]">Sign out</button></div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation" data-testid="button-menu-overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-[hsl(var(--sidebar)/.45)] lg:hidden" />}
     <div className="lg:pl-[252px]"><header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.91)] px-5 backdrop-blur-md sm:px-8"><button data-testid="button-open-menu" onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] lg:hidden"><Menu className="h-5 w-5" /></button><div className="hidden items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] lg:flex"><span className={cx('h-2 w-2 rounded-full', health.data ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--accent))]')} />{health.data ? 'League systems online' : 'League room'}</div><div className="ml-auto flex items-center gap-2 sm:gap-4"><Link href="/settings" data-testid="link-header-settings" className="rounded-xl p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><Settings className="h-5 w-5" /></Link><div className="hidden h-5 w-px bg-[hsl(var(--border))] sm:block" /><span data-testid="text-header-initials" className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--primary))] font-display text-xs font-bold text-[hsl(var(--primary-foreground))]">{displayInitials}</span></div></header><main className="mx-auto max-w-[1360px] px-5 py-7 pb-24 sm:px-8 sm:py-10 lg:px-12 lg:pb-12">{children}</main></div>
    <nav className="fixed inset-x-3 bottom-3 z-20 grid grid-cols-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.94)] p-1.5 shadow-[0_10px_30px_hsl(var(--foreground)/.12)] backdrop-blur lg:hidden">{navItems.map(({ href, label, icon: Icon }) => <Link href={href} key={href} data-testid={`link-mobile-${label.toLowerCase()}`} className={cx('flex flex-col items-center gap-1 rounded-xl py-2 text-[9px] font-bold uppercase tracking-[.08em]', active(href) ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))]')}><Icon className="h-4 w-4" />{label}</Link>)}</nav>
  </div>;
}

function PageHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 flex items-center gap-2 font-mono-custom text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--destructive))]" />{eyebrow}</p><h1 className="font-display text-4xl font-extrabold leading-[.98] tracking-[-.055em] sm:text-5xl" data-testid={`heading-${title.toLowerCase().replaceAll(' ', '-')}`}>{title}</h1>{detail && <p className="mt-3 max-w-xl text-sm text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>{action}</div>;
}

function GameRow({ game, compact = false }: { game: Game; compact?: boolean }) {
  const winner = game.homeScore != null && game.awayScore != null ? game.homeScore > game.awayScore ? 'home' : game.awayScore > game.homeScore ? 'away' : 'draw' : null;
  return <Link href={`/schedule/${game.id}`} data-testid={`card-game-${game.id}`} className={cx('group block rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/.45)] hover:shadow-[0_8px_24px_hsl(var(--foreground)/.06)]', compact && 'p-3')}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]"><span>{formatDate(game.date)}</span><span className="h-1 w-1 rounded-full bg-[hsl(var(--accent))]" /><span>{game.startTime}</span></div><Badge tone={game.status === GameStatus.FINAL ? 'teal' : game.status === GameStatus.PENDING_CONFIRMATION ? 'gold' : game.status === GameStatus.CANCELLED ? 'coral' : 'neutral'}>{game.status === GameStatus.PENDING_CONFIRMATION ? 'Review' : game.status === GameStatus.FINAL ? 'Final' : game.status === GameStatus.CANCELLED ? 'Cancelled' : 'Scheduled'}</Badge></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3"><div className={cx('font-display text-base font-bold sm:text-lg', winner === 'home' && 'text-[hsl(var(--primary))]')}><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-md bg-[hsl(var(--muted))] font-mono-custom text-[9px]">{initials(game.homeTeam)}</span>{game.homeTeam}</div><div className="font-mono-custom text-lg font-bold text-[hsl(var(--foreground))]" data-testid={`text-score-${game.id}`}>{game.homeScore != null ? `${game.homeScore} — ${game.awayScore}` : 'vs'}</div><div className={cx('text-right font-display text-base font-bold sm:text-lg', winner === 'away' && 'text-[hsl(var(--primary))]')}>{game.awayTeam}<span className="ml-2 inline-grid h-6 w-6 place-items-center rounded-md bg-[hsl(var(--muted))] font-mono-custom text-[9px]">{initials(game.awayTeam)}</span></div></div>{!compact && <div className="mt-4 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Hash className="h-3.5 w-3.5" />{game.venue} · {game.court}<ChevronRight className="ml-auto h-4 w-4 transition group-hover:translate-x-1" /></div>}</Link>;
}

function Home() {
  const dashboard = useGetDashboard();
  const data = dashboard.data as Dashboard | undefined;
  const recent = data?.recentResults ?? [];
  const attention = data?.attentionItems ?? [];
  return <QueryState loading={dashboard.isLoading} error={dashboard.error} onRetry={() => void dashboard.refetch()}><div className="animate-rise"><div className="mb-7 flex flex-wrap items-center gap-2"><Badge tone="dark">{roleLabel(data?.role)}</Badge><span className="text-sm text-[hsl(var(--muted-foreground))]">·</span><span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{data?.seasonName ?? 'Spring season'}</span></div><section className="relative overflow-hidden rounded-[24px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] sm:p-10"><div className="absolute -right-8 -top-14 h-48 w-48 rounded-full border-[22px] border-[hsl(var(--accent)/.28)]" /><div className="absolute -bottom-20 right-28 h-44 w-44 rounded-full border-[18px] border-[hsl(var(--accent)/.17)]" /><div className="relative max-w-2xl"><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.22em] text-[hsl(var(--accent))]" data-testid="text-league-name">{data?.leagueName ?? 'Dirty-30 Beer League'}</p><h1 className="mt-4 font-display text-5xl font-extrabold leading-[.9] tracking-[-.065em] sm:text-7xl">Game day<br /><span className="text-[hsl(var(--accent))]">starts here.</span></h1><p className="mt-5 max-w-md text-sm leading-6 text-[hsl(var(--primary-foreground)/.72)]">The trusted home base for lineups, late games, and the occasional overtime thriller.</p></div></section><div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">Up next</p><h2 className="mt-1 font-display text-2xl font-bold tracking-[-.04em]">Your next game</h2></div><CalendarDays className="h-5 w-5 text-[hsl(var(--accent-foreground))]" /></div>{data?.nextGame ? <GameRow game={data.nextGame} /> : <QueryState empty emptyLabel="No game on the board yet." />}</section><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--accent)/.28)] p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--destructive))]">Commissioner's desk</p><h2 className="mt-1 font-display text-2xl font-bold tracking-[-.04em]">Needs a look</h2></div><CircleAlert className="h-5 w-5 text-[hsl(var(--destructive))]" /></div>{attention.length ? <div className="space-y-3">{attention.map((item, index) => <div key={`${item}-${index}`} data-testid={`text-attention-${index}`} className="flex items-start gap-3 rounded-xl bg-[hsl(var(--card)/.66)] p-3 text-sm font-medium"><span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[hsl(var(--destructive))] text-[10px] font-bold text-white">{index + 1}</span>{item}</div>)}</div> : <p className="rounded-xl bg-[hsl(var(--card)/.66)] p-4 text-sm text-[hsl(var(--muted-foreground))]">Nothing urgent. Enjoy the quiet.</p>}</section></div><section className="mt-8"><div className="mb-4 flex items-end justify-between"><div><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">The tape</p><h2 className="mt-1 font-display text-2xl font-bold tracking-[-.04em]">Recent results</h2></div><Link href="/schedule" data-testid="link-view-schedule" className="text-sm font-bold text-[hsl(var(--primary))] hover:underline">Full schedule <ArrowRight className="ml-1 inline h-4 w-4" /></Link></div><div className="grid gap-3 md:grid-cols-2">{recent.length ? recent.slice(0, 4).map((game) => <GameRow key={game.id} game={game} compact />) : <QueryState empty emptyLabel="No results recorded yet." />}</div></section></div></QueryState>;
}

function Teams() {
  const teams = useListTeams();
  const currentUser = useGetCurrentUser();
  const create = useCreateTeam();
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate({ data: { name: name.trim() } }, { onSuccess: () => { setName(''); setAdding(false); void client.invalidateQueries({ queryKey: getListTeamsQueryKey() }); } });
  };
  const list = teams.data as Team[] | undefined;
  const canManageTeams = currentUser.data?.role === DashboardRole.COMMISSIONER;
  return <div className="animate-rise"><PageHeading eyebrow="The clubhouse" title="Teams" detail="Every squad, captain, and roster count in one quick scan." action={canManageTeams ? <Button onClick={() => setAdding((value) => !value)} testId="button-add-team"><Plus className="h-4 w-4" /> Add team</Button> : undefined} />{adding && <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3 rounded-2xl border border-[hsl(var(--primary)/.25)] bg-[hsl(var(--primary)/.06)] p-4 sm:flex-row"><input autoFocus data-testid="input-team-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Team name" className="min-h-11 flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm outline-none focus:border-[hsl(var(--primary))]" /><Button type="submit" disabled={create.isPending} testId="button-save-team">{create.isPending ? 'Saving…' : 'Save team'}</Button><Button variant="ghost" onClick={() => setAdding(false)} testId="button-cancel-team">Cancel</Button></form>}<QueryState loading={teams.isLoading} error={teams.error} onRetry={() => void teams.refetch()} empty={!list?.length} emptyLabel="No teams have checked in yet."><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list?.map((team, index) => <Link href={`/teams/${team.id}`} key={team.id} data-testid={`card-team-${team.id}`} className="group relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition hover:-translate-y-1 hover:border-[hsl(var(--primary)/.5)] hover:shadow-[0_12px_28px_hsl(var(--foreground)/.08)]"><div className={cx('absolute right-0 top-0 h-24 w-24 rounded-bl-[56px]', index % 3 === 0 ? 'bg-[hsl(var(--accent)/.7)]' : index % 3 === 1 ? 'bg-[hsl(var(--primary)/.12)]' : 'bg-[hsl(var(--destructive)/.12)]')} /><div className="relative flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--sidebar))] font-display text-lg font-bold text-[hsl(var(--sidebar-foreground))]">{initials(team.name)}</div><Badge tone={team.active ? 'teal' : 'neutral'}>{team.active ? 'Active' : 'Inactive'}</Badge></div><h2 className="mt-7 font-display text-2xl font-bold tracking-[-.04em]">{team.name}</h2><div className="mt-4 flex items-center justify-between border-t border-[hsl(var(--border))] pt-4 text-xs text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{team.playerCount} players</span><span className="font-semibold">{team.captainName || 'Captain TBA'} <ChevronRight className="ml-1 inline h-4 w-4 transition group-hover:translate-x-1" /></span></div></Link>)}</div></QueryState></div>;
}

function TeamDetail() {
  const params = useParams<{ teamId: string }>();
  const teamId = Number(params.teamId);
  const team = useGetTeam(teamId, { query: { enabled: Number.isFinite(teamId), queryKey: getGetTeamQueryKey(teamId) } });
  const roster = useGetTeamRoster(teamId, { query: { enabled: Number.isFinite(teamId), queryKey: getGetTeamRosterQueryKey(teamId) } });
  const update = useUpdateTeam();
  const createInvitation = useCreateInvitation();
  const cancelInvitation = useCancelInvitation();
  const regenerateInvitation = useRegenerateInvitation();
  const assignCaptain = useAssignTeamCaptain();
  const setTeamActive = useSetTeamActive();
  const removePlayer = useRemoveTeamPlayer();
  const currentUser = useGetCurrentUser();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const teamData = team.data as Team | undefined;
  const players = roster.data as Player[] | undefined;
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    update.mutate({ teamId, data: { name: name.trim() } }, { onSuccess: (updated) => { client.setQueryData(getGetTeamQueryKey(teamId), updated); void client.invalidateQueries({ queryKey: getListTeamsQueryKey() }); setEditing(false); } });
  };
  const canManageTeam = currentUser.data?.role === DashboardRole.COMMISSIONER;
  const canManageRoster = Boolean(teamData?.canManageRoster);
  const createInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invitePhone.trim()) return;
    const normalizedPhone = normalizeUsPhoneInput(invitePhone);
    if (!normalizedPhone) return;
    createInvitation.mutate({ teamId, data: { phone: normalizedPhone } }, {
      onSuccess: (invite) => {
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        setInviteLink(`${window.location.origin}${base}/invite/${invite.token}`);
        setInvitePhone('');
        void client.invalidateQueries({ queryKey: getGetTeamRosterQueryKey(teamId) });
      },
    });
  };
  const copyInvite = async () => { if (inviteLink) await navigator.clipboard.writeText(inviteLink); };
  return <div className="animate-rise"><Link href="/teams" data-testid="link-back-teams" className="mb-7 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"><ArrowLeft className="h-4 w-4" /> All teams</Link><QueryState loading={team.isLoading} error={team.error} onRetry={() => void team.refetch()}><div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-3 font-mono-custom text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">Team profile</p><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-[hsl(var(--accent))] font-display text-2xl font-extrabold shadow-[4px_4px_0_hsl(var(--primary))]">{initials(teamData?.name ?? 'Team')}</div><div><h1 className="font-display text-4xl font-extrabold tracking-[-.055em]" data-testid="text-team-name">{teamData?.name ?? 'Team'}</h1><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{teamData?.captainName || 'Captain TBA'} · {teamData?.playerCount ?? players?.length ?? 0} on roster</p></div></div></div><Button variant="outline" onClick={() => { setName(teamData?.name ?? ''); setEditing((value) => !value); }} testId="button-edit-team"><Pencil className="h-4 w-4" /> Edit team</Button></div>{editing && <form onSubmit={save} className="mb-6 flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:flex-row"><input data-testid="input-edit-team-name" value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--primary))]" /><Button type="submit" disabled={update.isPending} testId="button-update-team">{update.isPending ? 'Updating…' : 'Update name'}</Button></form>}{canManageRoster && <section className="mb-6 rounded-2xl border border-[hsl(var(--primary)/.25)] bg-[hsl(var(--primary)/.06)] p-4"><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">Roster management</p><h2 className="mt-1 font-display text-xl font-bold">Invite by verified phone</h2><form onSubmit={createInvite} className="mt-4 flex flex-col gap-3 sm:flex-row"><input data-testid="input-invite-phone" inputMode="tel" autoComplete="tel" value={invitePhone} onChange={(event) => setInvitePhone(event.target.value)} placeholder="(312) 555-0123" className="min-h-11 flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm outline-none focus:border-[hsl(var(--primary))]" /><Button type="submit" disabled={createInvitation.isPending} testId="button-create-invitation">{createInvitation.isPending ? 'Creating…' : 'Create invite'}</Button></form>{createInvitation.error && <p className="mt-3 text-xs font-semibold text-[hsl(var(--destructive))]">Unable to create this invitation. Check the number and roster capacity.</p>}{inviteLink && <div className="mt-4 flex flex-col gap-2 rounded-xl bg-[hsl(var(--card))] p-3 sm:flex-row sm:items-center"><code data-testid="text-invitation-link" className="min-w-0 flex-1 break-all text-xs">{inviteLink}</code><Button variant="outline" onClick={() => void copyInvite()} testId="button-copy-invitation">Copy link</Button></div>}</section>}<div className="mb-5 flex items-end justify-between"><div><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">The bench</p><h2 className="mt-1 font-display text-2xl font-bold tracking-[-.04em]">Roster</h2></div><Badge tone="teal">{players?.filter((player) => player.status === PlayerStatus.ACTIVE).length ?? 0} active</Badge></div><QueryState loading={roster.isLoading} error={roster.error} onRetry={() => void roster.refetch()} empty={!players?.length} emptyLabel="This roster is waiting for players."><div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">{players?.map((player, index) => <div key={player.id} data-testid={`row-player-${player.id}`} className={cx('flex items-center gap-3 p-4 sm:gap-4', index !== players.length - 1 && 'border-b border-[hsl(var(--border))]')}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] font-display text-sm font-bold text-[hsl(var(--primary))]">{initials(`${player.firstName} ${player.lastName}`)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{player.firstName} {player.lastName}</p>{player.phone && <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{player.phone}</p>}</div><Badge tone={player.status === PlayerStatus.ACTIVE ? 'teal' : 'gold'}>{player.status === PlayerStatus.ACTIVE ? 'Active' : 'Pending'}</Badge>{canManageRoster && player.status === PlayerStatus.PENDING && <div className="flex gap-1"><button data-testid={`button-regenerate-invitation-${-player.id}`} onClick={() => regenerateInvitation.mutate({ teamId, invitationId: -player.id }, { onSuccess: (invite) => { const base = import.meta.env.BASE_URL.replace(/\/$/, ''); setInviteLink(`${window.location.origin}${base}/invite/${invite.token}`); } })} className="rounded-lg px-2 py-1 text-[10px] font-bold text-[hsl(var(--primary))]">Regenerate</button><button data-testid={`button-cancel-invitation-${-player.id}`} onClick={() => cancelInvitation.mutate({ teamId, invitationId: -player.id }, { onSuccess: () => void client.invalidateQueries({ queryKey: getGetTeamRosterQueryKey(teamId) }) })} className="rounded-lg px-2 py-1 text-[10px] font-bold text-[hsl(var(--destructive))]">Cancel</button></div>}</div>)}</div></QueryState></QueryState></div>;
}

function Schedule() {
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'final'>('all');
  const games = useListGames();
  const list = Array.isArray(games.data) ? games.data as Game[] : [];
  const filtered = useMemo(() => list?.filter((game) => filter === 'all' ? true : filter === 'final' ? game.status === GameStatus.FINAL : game.status !== GameStatus.FINAL) ?? [], [list, filter]);
  return <div className="animate-rise"><PageHeading eyebrow="The board" title="Schedule" detail="Published games, real locations, no digging through group chats." action={<div className="flex rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">{(['all', 'upcoming', 'final'] as const).map((item) => <button key={item} data-testid={`button-filter-${item}`} onClick={() => setFilter(item)} className={cx('rounded-lg px-3 py-2 text-xs font-bold capitalize transition', filter === item ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))]')}>{item}</button>)}</div>} /><QueryState loading={games.isLoading} error={games.error} onRetry={() => void games.refetch()} empty={!filtered.length} emptyLabel={filter === 'all' ? 'The schedule is still being chalked up.' : `No ${filter} games yet.`}><div className="space-y-3">{filtered.map((game) => <GameRow key={game.id} game={game} />)}</div></QueryState></div>;
}

function GameDetail() {
  const params = useParams<{ gameId: string }>();
  const gameId = Number(params.gameId);
  const game = useGetGame(gameId, { query: { enabled: Number.isFinite(gameId), queryKey: getGetGameQueryKey(gameId) } });
  const submit = useSubmitScore();
  const client = useQueryClient();
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const data = game.data as Game | undefined;
  const canScore = data && data.status !== GameStatus.CANCELLED && data.status !== GameStatus.FINAL;
  const saveScore = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (homeScore === '' || awayScore === '') return;
    submit.mutate({ gameId, data: { homeScore: Number(homeScore), awayScore: Number(awayScore) } }, { onSuccess: (score) => { client.setQueryData(getGetGameQueryKey(gameId), (old: Game | undefined) => old ? { ...old, homeScore: score.homeScore, awayScore: score.awayScore, status: GameStatus.PENDING_CONFIRMATION } : old); void client.invalidateQueries({ queryKey: getListGamesQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); void client.invalidateQueries({ queryKey: getGetStandingsQueryKey() }); void client.invalidateQueries({ queryKey: getGetScoreReviewQueueQueryKey() }); } });
  };
  return <div className="animate-rise"><Link href="/schedule" data-testid="link-back-schedule" className="mb-7 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"><ArrowLeft className="h-4 w-4" /> Schedule</Link><QueryState loading={game.isLoading} error={game.error} onRetry={() => void game.refetch()}><div className="mx-auto max-w-3xl"><div className="mb-6 flex items-center justify-between"><div><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">{formatLongDate(data?.date)}</p><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{data?.startTime} · {data?.venue} · {data?.court}</p></div><Badge tone={data?.status === GameStatus.FINAL ? 'teal' : data?.status === GameStatus.PENDING_CONFIRMATION ? 'gold' : 'neutral'}>{data?.status?.replaceAll('_', ' ')}</Badge></div><section className="relative overflow-hidden rounded-[24px] bg-[hsl(var(--sidebar))] p-6 text-[hsl(var(--sidebar-foreground))] sm:p-10"><div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-[hsl(var(--accent)/.2)]" /><p className="relative text-center font-mono-custom text-[9px] uppercase tracking-[.22em] text-[hsl(var(--sidebar-foreground)/.5)]">Match {data?.id ? `#${String(data.id).padStart(2, '0')}` : ''}</p><div className="relative mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4"><div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--sidebar-accent))] font-display text-xl font-bold">{initials(data?.homeTeam ?? 'Home')}</div><p className="mt-3 font-display text-xl font-bold">{data?.homeTeam}</p></div><div className="text-center"><p className="font-mono-custom text-3xl font-bold text-[hsl(var(--accent))]">{data?.homeScore != null ? `${data.homeScore} — ${data.awayScore}` : 'VS'}</p><p className="mt-2 text-[10px] uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.42)]">Final score</p></div><div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--sidebar-accent))] font-display text-xl font-bold">{initials(data?.awayTeam ?? 'Away')}</div><p className="mt-3 font-display text-xl font-bold">{data?.awayTeam}</p></div></div></section>{canScore && <form onSubmit={saveScore} className="mt-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--destructive))]">Game-day action</p><h2 className="mt-1 font-display text-2xl font-bold">Submit the score</h2></div><Flag className="h-5 w-5 text-[hsl(var(--destructive))]" /></div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">{data?.homeTeam}<input data-testid="input-home-score" type="number" min="0" value={homeScore} onChange={(event) => setHomeScore(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 font-mono-custom text-xl outline-none focus:border-[hsl(var(--primary))]" /></label><label className="text-xs font-bold">{data?.awayTeam}<input data-testid="input-away-score" type="number" min="0" value={awayScore} onChange={(event) => setAwayScore(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 font-mono-custom text-xl outline-none focus:border-[hsl(var(--primary))]" /></label></div><Button type="submit" disabled={submit.isPending} className="mt-4 w-full" testId="button-submit-score">{submit.isPending ? 'Sending to the desk…' : 'Submit score'}</Button></form>}{data?.status === GameStatus.PENDING_CONFIRMATION && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[hsl(var(--accent)/.65)] bg-[hsl(var(--accent)/.2)] p-5"><Clock3 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Score is with the commissioner</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">It will appear in standings after it gets a quick look.</p></div></div>}</div></QueryState></div>;
}

function Standings() {
  const standings = useGetStandings();
  const list = standings.data as Standing[] | undefined;
  return <div className="animate-rise"><PageHeading eyebrow="The table" title="Standings" detail="The season, in black and white. Differential breaks the tie." action={<Badge tone="gold"><Trophy className="h-3 w-3" /> Current season</Badge>} /><QueryState loading={standings.isLoading} error={standings.error} onRetry={() => void standings.refetch()} empty={!list?.length} emptyLabel="Standings appear after the first final."><div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="hidden grid-cols-[52px_1.6fr_repeat(5, minmax(54px, .7fr))] gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] px-5 py-3 font-mono-custom text-[9px] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))] sm:grid"><span>#</span><span>Team</span><span>P</span><span>W</span><span>L</span><span>PF</span><span>+/-</span></div>{list?.map((standing, index) => <div key={standing.teamName} data-testid={`row-standing-${index}`} className={cx('grid grid-cols-[38px_1fr_auto] items-center gap-3 px-4 py-4 sm:grid-cols-[52px_1.6fr_repeat(5,minmax(54px,.7fr))] sm:gap-3 sm:px-5', index !== list.length - 1 && 'border-b border-[hsl(var(--border))]', index === 0 && 'bg-[hsl(var(--accent)/.18)]')}><span className={cx('grid h-8 w-8 place-items-center rounded-lg font-mono-custom text-xs font-bold', index === 0 ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--muted))]')}>{standing.rank}</span><div className="min-w-0"><p className="truncate font-display text-base font-bold">{standing.teamName}</p><p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))] sm:hidden">{standing.wins}W · {standing.losses}L · {standing.differential > 0 ? '+' : ''}{standing.differential} diff</p></div><span className="font-mono-custom text-sm font-bold sm:hidden">{standing.wins}–{standing.losses}</span><span className="hidden font-mono-custom text-sm sm:block">{standing.played}</span><span className="hidden font-mono-custom text-sm text-[hsl(var(--primary))] sm:block">{standing.wins}</span><span className="hidden font-mono-custom text-sm sm:block">{standing.losses}</span><span className="hidden font-mono-custom text-sm sm:block">{standing.pointsFor}</span><span className={cx('hidden font-mono-custom text-sm sm:block', standing.differential >= 0 ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--destructive))]')}>{standing.differential > 0 ? '+' : ''}{standing.differential}</span></div>)}</div></QueryState></div>;
}

function ReviewPersisted() {
  const queue = useGetScoreReviewQueue();
  const confirm = useConfirmScore();
  const dispute = useDisputeScore();
  const client = useQueryClient();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const list = (queue.data as Game[] | undefined) ?? [];
  const refreshLeagueData = (gameId: number) => {
    void Promise.all([
      client.invalidateQueries({ queryKey: getGetScoreReviewQueueQueryKey() }),
      client.invalidateQueries({ queryKey: getGetGameQueryKey(gameId) }),
      client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
      client.invalidateQueries({ queryKey: getListGamesQueryKey() }),
      client.invalidateQueries({ queryKey: getGetStandingsQueryKey() }),
    ]);
  };
  return <div className="animate-rise"><PageHeading eyebrow="The desk" title="Review queue" detail="A quick commissioner check keeps the standings honest." action={<Badge tone="coral"><CircleAlert className="h-3 w-3" /> {list.length} waiting</Badge>} /><QueryState loading={queue.isLoading} error={queue.error || confirm.error || dispute.error} onRetry={() => void queue.refetch()} empty={!list.length} emptyLabel="No scores waiting for review."><div className="space-y-4">{list.map((game) => <section key={game.id} data-testid={`card-review-${game.id}`} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--destructive))]">Submitted {formatDate(game.date)}</p><h2 className="mt-2 font-display text-2xl font-bold">{game.homeTeam} <span className="text-[hsl(var(--muted-foreground))]">vs</span> {game.awayTeam}</h2></div><Badge tone="gold">Pending confirmation</Badge></div><div className="mt-5 flex items-center gap-5 rounded-xl bg-[hsl(var(--muted)/.65)] p-4"><div><p className="text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{game.homeTeam}</p><p className="font-mono-custom text-3xl font-bold">{game.homeScore ?? '—'}</p></div><span className="font-mono-custom text-sm text-[hsl(var(--muted-foreground))]">to</span><div><p className="text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{game.awayTeam}</p><p className="font-mono-custom text-3xl font-bold">{game.awayScore ?? '—'}</p></div><span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">{game.venue} · {game.court}</span></div><label className="mt-4 block text-xs font-bold">Dispute reason<input data-testid={`input-dispute-reason-${game.id}`} value={reasons[game.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [game.id]: event.target.value }))} placeholder="Required only if disputing" className="mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" /></label><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" disabled={dispute.isPending || (reasons[game.id]?.trim().length ?? 0) < 3} onClick={() => dispute.mutate({ gameId: game.id, data: { reason: reasons[game.id]!.trim() } }, { onSuccess: () => refreshLeagueData(game.id) })} testId={`button-dispute-${game.id}`}>Flag for follow-up</Button><Button variant="primary" disabled={confirm.isPending} onClick={() => confirm.mutate({ gameId: game.id }, { onSuccess: () => refreshLeagueData(game.id) })} testId={`button-approve-${game.id}`}><Check className="h-4 w-4" /> Approve score</Button></div></section>)}</div></QueryState></div>;
}

function SettingsPage() {
  const profile = useGetCurrentUser();
  const update = useUpdateCurrentUser();
  const client = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  useEffect(() => {
    if (!profile.data) return;
    setFirstName(profile.data.firstName);
    setLastName(profile.data.lastName);
  }, [profile.data]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate({ data: { firstName: firstName.trim(), lastName: lastName.trim() } }, {
      onSuccess: (updated) => client.setQueryData(getGetCurrentUserQueryKey(), updated),
    });
  };
  return <div className="animate-rise"><PageHeading eyebrow="Your league account" title="Settings" detail="Keep your league profile current." /><QueryState loading={profile.isLoading} error={profile.error || update.error} onRetry={() => void profile.refetch()}><form onSubmit={submit} className="max-w-2xl space-y-5"><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-7"><div className="mb-6 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><SlidersHorizontal className="h-5 w-5" /></div><div><h2 className="font-display text-xl font-bold">Profile details</h2><p className="text-xs text-[hsl(var(--muted-foreground))]">Used for rosters and game-day communication.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">First name<input required data-testid="input-profile-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 font-medium outline-none focus:border-[hsl(var(--primary))]" /></label><label className="block text-sm font-bold">Last name<input required data-testid="input-profile-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 font-medium outline-none focus:border-[hsl(var(--primary))]" /></label></div></section><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-7"><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">Verified phone</p><div className="mt-3 flex items-center justify-between rounded-xl bg-[hsl(var(--muted)/.65)] p-4"><div><p data-testid="text-verified-phone" className="text-sm font-bold">{profile.data?.phone ?? 'Loading…'}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Your phone is verified by Clerk and cannot be changed here.</p></div><Badge tone="teal">{roleLabel(profile.data?.role)}</Badge></div></section><div className="flex items-center gap-3"><Button type="submit" disabled={update.isPending || !firstName.trim() || !lastName.trim()} testId="button-save-profile">{update.isPending ? 'Saving…' : <><Check className="h-4 w-4" /> Save profile</>}</Button>{update.isSuccess && <span className="text-xs font-semibold text-[hsl(var(--primary))]" data-testid="status-profile-saved">Profile saved</span>}</div></form></QueryState></div>;
}

function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (email.trim()) { setSubmitted(true); window.setTimeout(() => setLocation('/'), 500); } };
  return <div className="noise flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--sidebar))] p-5 text-[hsl(var(--sidebar-foreground))]"><div className="grid w-full max-w-4xl overflow-hidden rounded-[28px] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-[0_24px_80px_hsl(var(--sidebar)/.45)] md:grid-cols-[.9fr_1.1fr]"><div className="relative hidden overflow-hidden bg-[hsl(var(--primary))] p-10 text-[hsl(var(--primary-foreground))] md:block"><LeagueLogo /><div className="absolute -bottom-12 -left-12 h-52 w-52 rounded-full border-[26px] border-[hsl(var(--accent)/.24)]" /><div className="relative mt-32"><p className="font-mono-custom text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">Your game-day home base</p><h1 className="mt-4 font-display text-6xl font-extrabold leading-[.88] tracking-[-.07em]">Keep<br />it<br /><span className="text-[hsl(var(--accent))]">moving.</span></h1><p className="mt-6 max-w-[220px] text-sm leading-6 text-[hsl(var(--primary-foreground)/.7)]">Schedules, scores, and the league's version of the truth.</p></div></div><div className="p-7 sm:p-12"><div className="mb-12 md:hidden"><LeagueLogo /></div><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">Welcome back</p><h2 className="mt-3 font-display text-4xl font-extrabold tracking-[-.06em]">Get in the room.</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Use your league email to set up your game-day account.</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-sm font-bold">League email<input data-testid="input-login-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@league.com" className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 outline-none focus:border-[hsl(var(--primary))]" /></label><Button type="submit" disabled={submitted} className="w-full" testId="button-login">{submitted ? 'Opening the room…' : <>Continue <ArrowRight className="h-4 w-4" /></>}</Button></form><p className="mt-8 text-center text-xs text-[hsl(var(--muted-foreground))]">By continuing, you agree to keep the chirps friendly.</p></div></div></div>;
}

function ClerkLogin() {
  return <PhoneAuthScreen />;
}

function InviteAcceptance() {
  const params = useParams<{ token: string }>();
  const accept = useAcceptInvitation();
  const [, setLocation] = useLocation();
  const acceptInvite = () => {
    if (!params.token) return;
    accept.mutate({ token: params.token }, { onSuccess: () => setLocation('/teams') });
  };
  return <div className="mx-auto max-w-xl py-12"><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center"><Badge tone="gold">Team invitation</Badge><h1 className="mt-4 font-display text-3xl font-extrabold">Ready to take a roster spot?</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">Accepting this invitation confirms that your signed-in, verified phone number matches the one the captain invited.</p>{accept.error && <p data-testid="text-invite-error" className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.08)] p-3 text-sm font-semibold text-[hsl(var(--destructive))]">This invitation can’t be accepted. It may be expired, cancelled, or tied to a different phone number.</p>}<Button className="mt-6" onClick={acceptInvite} disabled={accept.isPending} testId="button-accept-invitation">{accept.isPending ? 'Claiming your spot…' : 'Accept invitation'}</Button></section></div>;
}

function AuthBoundary() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [location, setLocation] = useLocation();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  useEffect(() => {
    if (!isSignedIn) return;
    const invitationPath = window.sessionStorage.getItem('dirty30-invitation-return');
    if (invitationPath && invitationPath !== location) {
      window.sessionStorage.removeItem('dirty30-invitation-return');
      setLocation(invitationPath);
    }
  }, [isSignedIn, location, setLocation]);
  if (!isLoaded) return <div className="noise grid min-h-[100dvh] place-items-center bg-[hsl(var(--sidebar))] text-sm font-bold text-[hsl(var(--sidebar-foreground))]">Opening the league room…</div>;
  if (!isSignedIn) {
    if (location.startsWith('/invite/')) window.sessionStorage.setItem('dirty30-invitation-return', location);
    return <ClerkLogin />;
  }
  return <Router />;
}

function Router() {
  const [location] = useLocation();
  return <Shell><ErrorBoundary resetKey={location}><Switch><Route path="/invite/:token" component={InvitationPage} /><Route path="/" component={DashboardPage} /><Route path="/teams/:teamId" component={TeamDetailPage} /><Route path="/teams" component={Teams} /><Route path="/schedule/:gameId" component={GameDetailPage} /><Route path="/schedule" component={SchedulePage} /><Route path="/standings" component={Standings} /><Route path="/review" component={ReviewPersisted} /><Route path="/settings" component={ProfilePage} /><Route component={NotFound} /></Switch></ErrorBoundary></Shell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AuthBoundary /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;