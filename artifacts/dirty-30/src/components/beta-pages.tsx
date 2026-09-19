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
  useListTeamByes,
  type Dashboard,
  type Game,
  type Player,
  type Team,
  type TeamBye,
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
  useListTeams,
  useRemoveTeamPlayer,
  useRegenerateInvitation,
  useSetTeamActive,
  useUpdateCurrentUser,
  useUpdateTeam,
} from "@workspace/api-client-react";
import { refreshAfterInvitationAcceptance } from "./invitation-flow";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Link, useLocation, useParams } from "wouter";
import { CommissionerScheduleAdmin } from "./commissioner-schedule";
import { ScoreActions } from "./score-actions";
import { ScheduleView } from "./schedule-view";

const card =
  "rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5";
const field =
  "mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]";
const action =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50";
const quietAction =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-[hsl(var(--border))] px-3 text-xs font-bold hover:border-[hsl(var(--primary))]";

function errorText(error: unknown) {
  if (typeof error === "object" && error) {
    const value = error as { data?: { error?: string }; message?: string };
    return (
      value.data?.error ??
      value.message ??
      "The league desk could not complete that action."
    );
  }
  return "The league desk could not complete that action.";
}

function normalizePhone(value: string) {
  const phone = parsePhoneNumberFromString(value, "US");
  return phone?.isValid() && phone.country === "US" ? phone.number : null;
}

function initials(value: string) {
  return value
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DashboardPage() {
  const dashboard = useGetDashboard();
  const data = dashboard.data as Dashboard | undefined;
  const commissioner = data?.role === DashboardRole.COMMISSIONER;
  return (
    <div className="animate-rise overflow-x-hidden">
      <div className="mb-7 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
        <span className="rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-xs font-bold">
          {data?.role ?? "LEAGUE MEMBER"}
        </span>
        <span>{data?.seasonName}</span>
      </div>
      <section className="rounded-[24px] bg-[hsl(var(--primary))] p-5 text-[hsl(var(--primary-foreground))] sm:p-10">
        <p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
          {data?.leagueName ?? "Dirty-30"}
        </p>
        <h1 className="mt-4 font-display text-4xl font-extrabold leading-[.9] tracking-[-.06em] sm:text-5xl">
          Game day
          <br />
          <span className="text-[hsl(var(--accent))]">starts here.</span>
        </h1>
        <p className="mt-5 max-w-lg text-sm text-[hsl(var(--primary-foreground)/.75)]">
          {commissioner
            ? "Your league desk has the schedule, rosters, and score reviews in one place."
            : "Your verified league home for games, teammates, and standings."}
        </p>
      </section>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
            Up next
          </p>
          {(() => {
            const nextGame = data?.nextGame;
            const nextBye = data?.nextBye;
            if (!nextGame && !nextBye) {
              return (
                <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                  No published game or bye is scheduled yet.
                </p>
              );
            }
            if (
              nextGame &&
              (!nextBye ||
                new Date(nextGame.date).getTime() <=
                  new Date(nextBye.playDate).getTime())
            ) {
              return <GameSummary game={nextGame} />;
            }
            return (
              <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 text-center">
                <p className="text-sm font-bold text-[hsl(var(--primary))]">
                  Week {nextBye!.scheduleWeek} Bye
                </p>
                <p className="mt-1 font-display text-xl font-bold">
                  {nextBye!.playDate}
                </p>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                  {nextBye!.teamName} has a bye — no match scheduled.
                </p>
              </div>
            );
          })()}
        </section>
        {commissioner && (
          <section className={card}>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--destructive))]">
              Commissioner desk
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold">
              Needs a look
            </h2>
            <div className="mt-4 space-y-2">
              {data?.attentionItems.length ? (
                data.attentionItems.map((item) => (
                  <p
                    key={item}
                    className="rounded-xl bg-[hsl(var(--muted))] p-3 text-sm"
                  >
                    {item}
                  </p>
                ))
              ) : (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  No issues are waiting.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export function TeamDetailPage() {
  const { teamId: rawTeamId } = useParams<{ teamId: string }>();
  const teamId = Number(rawTeamId);
  const client = useQueryClient();
  const current = useGetCurrentUser();
  const team = useGetTeam(teamId, {
    query: {
      queryKey: getGetTeamQueryKey(teamId),
      enabled: Number.isFinite(teamId),
    },
  });
  const roster = useGetTeamRoster(teamId, {
    query: {
      queryKey: getGetTeamRosterQueryKey(teamId),
      enabled: Number.isFinite(teamId),
    },
  });
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
  const invalidate = () =>
    void Promise.all([
      client.invalidateQueries({ queryKey: getGetTeamQueryKey(teamId) }),
      client.invalidateQueries({ queryKey: getGetTeamRosterQueryKey(teamId) }),
      client.invalidateQueries({ queryKey: getListTeamsQueryKey() }),
    ]);
  const createInvite = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    invitation.mutate(
      { teamId, data: { phone: normalized } },
      {
        onSuccess: (result) => {
          const base = import.meta.env.BASE_URL.replace(/\/$/, "");
          setInviteLink(
            `${window.location.origin}${base}/invite/${result.token}`,
          );
          setPhone("");
          invalidate();
        },
      },
    );
  };
  const pendingError = [
    invitation.error,
    regenerate.error,
    cancel.error,
    remove.error,
    assignCaptain.error,
    setActive.error,
    update.error,
  ].find(Boolean);

  return (
    <div className="animate-rise">
      <Link
        href="/teams"
        className="mb-6 inline-block text-sm font-bold text-[hsl(var(--primary))]"
      >
        ← All teams
      </Link>
      <section className={card}>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap">
          <div className="w-full min-w-0 sm:w-auto">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
              Team profile
            </p>
            <h1 className="mt-2 break-words font-display text-3xl font-extrabold sm:text-4xl">
              {data?.name ?? "Team"}
            </h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {data?.captainName || "Captain TBA"} ·{" "}
              {players.length || data?.playerCount || 0} of 8 occupied
            </p>
          </div>
          {commissioner && (
            <button
              className={`${quietAction} min-h-[44px] w-full sm:w-auto`}
              onClick={() =>
                setActive.mutate(
                  { teamId, data: { active: !data?.active } },
                  { onSuccess: invalidate },
                )
              }
            >
              {data?.active ? "Deactivate team" : "Activate team"}
            </button>
          )}
        </div>
        {commissioner && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (rename.trim())
                update.mutate(
                  { teamId, data: { name: rename.trim() } },
                  {
                    onSuccess: () => {
                      setRename("");
                      invalidate();
                    },
                  },
                );
            }}
            className="mt-5 flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={rename}
              onChange={(event) => setRename(event.target.value)}
              placeholder="Rename team"
              className={`${field.replace("mt-2 ", "")} min-h-[44px] min-w-0 flex-1`}
            />
            <button
              type="submit"
              className={`${quietAction} min-h-[44px] w-full sm:w-auto`}
            >
              Save name
            </button>
          </form>
        )}
      </section>
      {canManage && (
        <section className={`mt-5 ${card}`}>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
            Roster management
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold">
            Invite by verified phone
          </h2>
          <form
            onSubmit={createInvite}
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              placeholder="(312) 555-0123"
              className={`${field.replace("mt-2 ", "")} min-h-[44px] min-w-0 flex-1`}
            />
            <button
              className={`${action} min-h-[44px] w-full sm:w-auto`}
              type="submit"
            >
              Create invite
            </button>
          </form>
          {inviteLink && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl bg-[hsl(var(--muted))] p-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all text-xs">
                {inviteLink}
              </code>
              <button
                className={`${quietAction} min-h-[44px] w-full sm:min-h-10 sm:w-auto`}
                onClick={() => void navigator.clipboard.writeText(inviteLink)}
              >
                Copy
              </button>
            </div>
          )}
          {pendingError && (
            <p className="mt-3 text-sm font-semibold text-[hsl(var(--destructive))]">
              {errorText(pendingError)}
            </p>
          )}
        </section>
      )}
      <section className={`mt-5 ${card}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">
              The bench
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold">Roster</h2>
          </div>
          <span className="rounded-full bg-[hsl(var(--primary)/.12)] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">
            {players.length} of 8
          </span>
        </div>
        <div className="mt-4 divide-y divide-[hsl(var(--border))]">
          {players.map((player) => (
            <div
              key={player.id}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <span className="grid h-[44px] w-[44px] min-w-[44px] place-items-center rounded-xl bg-[hsl(var(--muted))] font-bold">
                  {initials(`${player.firstName} ${player.lastName}`)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">
                    {player.firstName} {player.lastName}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {player.phone ?? "Phone hidden"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${player.status === PlayerStatus.ACTIVE ? "bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]" : "bg-[hsl(var(--accent)/.28)]"}`}
                >
                  {player.status}
                </span>
              </div>
              {canManage && player.status === PlayerStatus.PENDING && (
                <span className="flex w-full gap-2 sm:w-auto">
                  <button
                    className={`${quietAction} flex-1 min-h-[44px] px-2 text-xs sm:flex-none sm:min-h-10 sm:px-3`}
                    onClick={() =>
                      regenerate.mutate(
                        { teamId, invitationId: -player.id },
                        {
                          onSuccess: (result) => {
                            const base = import.meta.env.BASE_URL.replace(
                              /\/$/,
                              "",
                            );
                            setInviteLink(
                              `${window.location.origin}${base}/invite/${result.token}`,
                            );
                          },
                        },
                      )
                    }
                  >
                    Regenerate
                  </button>
                  <button
                    className={`${quietAction} flex-1 min-h-[44px] px-2 text-xs sm:flex-none sm:min-h-10 sm:px-3`}
                    onClick={() =>
                      cancel.mutate(
                        { teamId, invitationId: -player.id },
                        { onSuccess: invalidate },
                      )
                    }
                  >
                    Cancel
                  </button>
                </span>
              )}
              {commissioner && player.status === PlayerStatus.ACTIVE && (
                <span className="flex w-full gap-2 sm:w-auto">
                  <button
                    className={`${quietAction} flex-1 min-h-[44px] px-2 text-xs sm:flex-none sm:min-h-10 sm:px-3`}
                    onClick={() =>
                      assignCaptain.mutate(
                        { teamId, data: { userId: player.id } },
                        { onSuccess: invalidate },
                      )
                    }
                  >
                    Captain
                  </button>
                  <button
                    className={`${quietAction} flex-1 min-h-[44px] px-2 text-xs sm:flex-none sm:min-h-10 sm:px-3`}
                    onClick={() =>
                      remove.mutate(
                        { teamId, userId: player.id },
                        { onSuccess: invalidate },
                      )
                    }
                  >
                    Remove
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SchedulePage() {
  const gamesQuery = useListGames();
  const byesQuery = useListTeamByes();
  const teamsQuery = useListTeams();
  const profile = useGetCurrentUser();
  const dashboard = useGetDashboard();

  const gamesList = (gamesQuery.data ?? []) as Game[];
  const byesList = (byesQuery.data ?? []) as TeamBye[];
  const teamList = (teamsQuery.data ?? []) as Team[];
  const dashboardData = dashboard.data as Dashboard | undefined;

  const commissioner = profile.data?.role === DashboardRole.COMMISSIONER;

  return (
    <div className="animate-rise">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
        <div className="w-full min-w-0">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
            The board
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">
            Schedule
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Published games and byes for the league.
          </p>
        </div>
      </div>
      <div className="mt-6">
        <ScheduleView
          games={gamesList}
          byes={byesList}
          teams={teamList}
          dashboard={dashboardData}
          commissioner={commissioner}
        />
      </div>
      {commissioner && (
        <details className="group mt-8">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center rounded-[20px] bg-[hsl(var(--primary)/.05)] p-4 font-display text-lg font-bold text-[hsl(var(--primary))] outline-none transition-colors hover:bg-[hsl(var(--primary)/.1)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
            Commissioner Schedule Admin
          </summary>
          <div className="mt-4">
            <CommissionerScheduleAdmin />
          </div>
        </details>
      )}
    </div>
  );
}

export function GameDetailPage() {
  const { gameId: rawGameId } = useParams<{ gameId: string }>();
  const gameId = Number(rawGameId);
  const query = useGetGame(gameId, {
    query: {
      queryKey: getGetGameQueryKey(gameId),
      enabled: Number.isFinite(gameId),
    },
  });
  const game = query.data as Game | undefined;
  if (query.isLoading) return <p className="text-sm">Loading game…</p>;
  if (!game)
    return (
      <p className="text-sm text-[hsl(var(--destructive))]">
        This game could not be found.
      </p>
    );
  return (
    <div className="animate-rise">
      <Link
        href="/schedule"
        className="mb-6 inline-block text-sm font-bold text-[hsl(var(--primary))]"
      >
        ← Schedule
      </Link>
      <section className="rounded-[24px] bg-[hsl(var(--sidebar))] p-5 text-[hsl(var(--sidebar-foreground))] sm:p-7">
        <p className="break-words text-center text-xs font-bold uppercase tracking-[.12em] text-[hsl(var(--accent))] sm:tracking-[.16em]">
          {game.date} · {game.startTime} · {game.venue} / {game.court}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 text-center sm:mt-7 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="break-words font-display text-xl font-bold">
              {game.homeTeam}
            </p>
          </div>
          <div className="font-mono-custom text-3xl font-bold text-[hsl(var(--accent))]">
            {game.homeScore != null
              ? `${game.homeScore} – ${game.awayScore}`
              : "VS"}
          </div>
          <div className="min-w-0">
            <p className="break-words font-display text-xl font-bold">
              {game.awayTeam}
            </p>
          </div>
        </div>
        <p className="mt-5 text-center text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--sidebar-foreground)/.65)]">
          {!game.published ? "Draft" : game.status.replaceAll("_", " ")}
        </p>
      </section>
      <ScoreActions game={game} />
    </div>
  );
}

export function ProfilePage() {
  const profile = useGetCurrentUser();
  const update = useUpdateCurrentUser();
  const client = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  useEffect(() => {
    if (profile.data) {
      setFirstName(profile.data.firstName);
      setLastName(profile.data.lastName);
    }
  }, [profile.data]);
  return (
    <div className="animate-rise max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
        Your league account
      </p>
      <h1 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">
        Profile
      </h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (firstName.trim() && lastName.trim())
            update.mutate(
              {
                data: {
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                },
              },
              {
                onSuccess: (result) =>
                  client.setQueryData(getGetCurrentUserQueryKey(), result),
              },
            );
        }}
        className={`mt-6 space-y-5 ${card}`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">
            First name
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className={`${field} min-h-[44px]`}
            />
          </label>
          <label className="text-sm font-bold">
            Last name
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className={`${field} min-h-[44px]`}
            />
          </label>
        </div>
        <div className="rounded-xl bg-[hsl(var(--muted))] p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em]">
            Verified phone
          </p>
          <p className="mt-1 font-bold">{profile.data?.phone}</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Phone changes require commissioner support and Clerk verification;
            they cannot be edited here.
          </p>
        </div>
        <div className="rounded-xl bg-[hsl(var(--muted))] p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em]">
            Optional verified email
          </p>
          <p className="mt-1 font-bold">
            {profile.data?.email ?? "No verified Clerk email on file"}
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            This value is supplied by Clerk when verified and is not used for
            sign-in.
          </p>
        </div>
        {update.error && (
          <p className="text-sm font-semibold text-[hsl(var(--destructive))]">
            {errorText(update.error)}
          </p>
        )}
        <button
          type="submit"
          className={`${action} min-h-[44px] w-full sm:w-auto`}
        >
          Save profile
        </button>
      </form>
    </div>
  );
}

export function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const accept = useAcceptInvitation();
  const client = useQueryClient();
  const [, navigate] = useLocation();
  const profile = useGetCurrentUser();
  const [refreshError, setRefreshError] = useState("");
  const [acceptedTeamId, setAcceptedTeamId] = useState<number | null>(null);
  const complete = async (teamId: number) => {
    setRefreshError("");
    const refreshed = await refreshAfterInvitationAcceptance(client, {
      currentUser: getGetCurrentUserQueryKey(),
      teams: getListTeamsQueryKey(),
      team: getGetTeamQueryKey(teamId),
      roster: getGetTeamRosterQueryKey(teamId),
    });
    if (refreshed?.accessState !== "ACTIVE") {
      setAcceptedTeamId(teamId);
      setRefreshError(
        "Your invitation was accepted, but your access is still refreshing. Try again in a moment.",
      );
      await profile.refetch();
      return;
    }
    setAcceptedTeamId(null);
    navigate(`/teams/${teamId}`);
  };
  return (
    <div className="mx-auto max-w-xl py-12">
      <section className={`${card} text-center`}>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
          Team invitation
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold">
          Ready to take a roster spot?
        </h1>
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
          Your signed-in verified phone must match the captain’s invitation.
        </p>
        {accept.error && (
          <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm font-semibold text-[hsl(var(--destructive))]">
            {errorText(accept.error)}
          </p>
        )}
        {refreshError && (
          <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm font-semibold text-[hsl(var(--destructive))]">
            {refreshError}
          </p>
        )}
        {acceptedTeamId ? (
          <button
            className={`${action} mt-5 min-h-[44px] w-full sm:w-auto`}
            onClick={() =>
              void complete(acceptedTeamId).catch(() =>
                setRefreshError(
                  "We still couldn’t refresh your league access. Please retry.",
                ),
              )
            }
          >
            Retry access refresh
          </button>
        ) : (
          <button
            className={`${action} mt-5 min-h-[44px] w-full sm:w-auto`}
            disabled={accept.isPending}
            onClick={() =>
              token &&
              accept.mutate(
                { token },
                {
                  onSuccess: (result) => {
                    void complete(result.teamId).catch(() => {
                      setAcceptedTeamId(result.teamId);
                      setRefreshError(
                        "The invitation was accepted, but we couldn’t refresh your league access. Retry before continuing.",
                      );
                    });
                  },
                },
              )
            }
          >
            {accept.isPending ? "Joining team…" : "Accept invitation"}
          </button>
        )}
      </section>
    </div>
  );
}

function GameSummary({ game }: { game: Game }) {
  return (
    <Link
      href={`/schedule/${game.id}`}
      className={`${card} block transition hover:border-[hsl(var(--primary))]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">
          {game.date} · {game.startTime}
        </p>
        <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-1 text-[10px] font-bold">
          {!game.published ? "DRAFT" : game.status.replaceAll("_", " ")}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <strong className="min-w-0 break-words text-center sm:text-left">
          {game.homeTeam}
        </strong>
        <span className="text-center font-mono-custom text-lg font-bold">
          {game.homeScore != null
            ? `${game.homeScore} – ${game.awayScore}`
            : "VS"}
        </span>
        <strong className="min-w-0 break-words text-center sm:text-right">
          {game.awayTeam}
        </strong>
      </div>
      <p className="mt-3 text-center text-xs text-[hsl(var(--muted-foreground))] sm:text-left">
        {game.venue} · {game.court}
      </p>
    </Link>
  );
}
