import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  Pencil,
  Plus,
  Settings2,
} from "lucide-react";
import type {
  Dashboard,
  Game,
  ScheduleWeek,
  Team,
  TeamBye,
} from "@workspace/api-client-react";
import {
  adjacentScheduleWeekKey,
  filterByDate,
  filterByMode,
  filterByTeam,
  formatLeagueDate,
  formatWeekRange,
  inferUserTeamIds,
  mergeScheduleData,
  scheduleWeekGroups,
  selectCurrentScheduleWeek,
  type ScheduleItem,
  type ScheduleMode,
  type ScheduleWeekGroup,
} from "./schedule-helpers";
import { CommissionerGameEditor } from "./commissioner-game-editor";

const modes: ScheduleMode[] = ["Week", "Upcoming", "Completed", "All"];

function todayString() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function persistedMode() {
  if (typeof window === "undefined") return "Week";
  const value = sessionStorage.getItem("schedule-view-mode") as ScheduleMode;
  return modes.includes(value) ? value : "Week";
}

export function statusCounts(group?: ScheduleWeekGroup) {
  const counts = {
    totalGames: 0,
    completedGames: 0,
    pendingScores: 0,
    scheduledGames: 0,
    byeTeams: 0,
  };
  const byeTeamIds = new Set<number>();
  for (const item of group?.items ?? []) {
    if (item.type === "bye") {
      byeTeamIds.add(item.data.teamId);
      continue;
    }
    if (item.type !== "game") continue;
    counts.totalGames += 1;
    if (item.data.status === "FINAL") counts.completedGames += 1;
    else if (
      item.data.status === "PENDING_CONFIRMATION" ||
      item.data.status === "DISPUTED"
    )
      counts.pendingScores += 1;
    else if (item.data.status === "SCHEDULED") counts.scheduledGames += 1;
  }
  counts.byeTeams = byeTeamIds.size;
  return counts;
}

export function persistWeekSelection(
  storage: Pick<Storage, "setItem" | "removeItem">,
  key: string | null,
  scheduleLoaded: boolean,
) {
  if (key) storage.setItem("schedule-week-key", key);
  else if (scheduleLoaded) storage.removeItem("schedule-week-key");
}

export function ScheduleView({
  scheduleWeeks,
  teams,
  dashboard,
  commissioner,
  scheduleLoaded = true,
}: {
  scheduleWeeks: ScheduleWeek[];
  teams: Team[];
  dashboard?: Dashboard;
  commissioner: boolean;
  scheduleLoaded?: boolean;
}) {
  const today = useMemo(todayString, []);
  const allItems = useMemo(
    () => mergeScheduleData(scheduleWeeks),
    [scheduleWeeks],
  );
  const weeks = useMemo(
    () => scheduleWeekGroups(scheduleWeeks),
    [scheduleWeeks],
  );
  const currentWeekKey = useMemo(
    () => selectCurrentScheduleWeek(weeks, today),
    [weeks, today],
  );
  const myTeamIds = useMemo(() => inferUserTeamIds(dashboard), [dashboard]);
  const [mode, setMode] = useState<ScheduleMode>(persistedMode);
  const [teamFilter, setTeamFilter] = useState<number | "all">(() => {
    if (typeof window === "undefined") return "all";
    const saved = sessionStorage.getItem("schedule-team");
    return saved && saved !== "all" && Number.isFinite(Number(saved))
      ? Number(saved)
      : "all";
  });
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("schedule-week-key");
  });
  const [dateFilter, setDateFilter] = useState<string | "all">(() => {
    if (typeof window === "undefined") return "all";
    return sessionStorage.getItem("schedule-date") || "all";
  });
  const [editingGame, setEditingGame] = useState<Game>();
  const [addingGame, setAddingGame] = useState(false);
  const [choosingGame, setChoosingGame] = useState(false);

  const activeWeekKey =
    selectedWeekKey && weeks.some((week) => week.key === selectedWeekKey)
      ? selectedWeekKey
      : currentWeekKey;
  const selectedWeek = weeks.find((week) => week.key === activeWeekKey);
  const previousWeekKey = adjacentScheduleWeekKey(weeks, activeWeekKey, -1);
  const nextWeekKey = adjacentScheduleWeekKey(weeks, activeWeekKey, 1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("schedule-view-mode", mode);
  }, [mode]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("schedule-team", String(teamFilter));
  }, [teamFilter]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    persistWeekSelection(sessionStorage, activeWeekKey, scheduleLoaded);
  }, [activeWeekKey, scheduleLoaded]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("schedule-date", dateFilter);
  }, [dateFilter]);

  useEffect(() => {
    if (teamFilter === "all") return;
    const validCommissionerTeam =
      commissioner &&
      teams.some((team) => team.active && team.id === teamFilter);
    const validMyTeam = !commissioner && myTeamIds.includes(teamFilter);
    if (!validCommissionerTeam && !validMyTeam && teams.length > 0) {
      setTeamFilter("all");
    }
  }, [commissioner, myTeamIds, teamFilter, teams]);

  const modeItems = useMemo(
    () =>
      mode === "Week"
        ? (selectedWeek?.items ?? [])
        : filterByMode(allItems, mode, today),
    [allItems, mode, selectedWeek, today],
  );
  const teamItems = useMemo(
    () => filterByTeam(modeItems, teamFilter),
    [modeItems, teamFilter],
  );
  const availableDates = useMemo(
    () => Array.from(new Set(teamItems.map((item) => item.date))).sort(),
    [teamItems],
  );
  const activeDate =
    dateFilter === "all" || availableDates.includes(dateFilter)
      ? dateFilter
      : "all";
  const visibleItems = useMemo(
    () => filterByDate(teamItems, activeDate),
    [teamItems, activeDate],
  );
  const visibleWeeks = useMemo(() => {
    const visible = new Set(visibleItems);
    return weeks
      .map((week) => ({
        ...week,
        items: week.items.filter((item) => visible.has(item)),
      }))
      .filter((week) => week.items.length > 0);
  }, [visibleItems, weeks]);
  const counts = statusCounts(selectedWeek);
  const editingScheduleWeekId = editingGame
    ? scheduleWeeks.find((week) =>
        week.games.some((game) => game.id === editingGame.id),
      )?.id
    : undefined;
  const selectedTeamName =
    teamFilter === "all"
      ? undefined
      : teams.find((team) => team.id === teamFilter)?.name;

  const chooseWeek = (key: string) => {
    setSelectedWeekKey(key);
    setMode("Week");
    setDateFilter("all");
  };

  const showPrevious = Boolean(previousWeekKey);
  const showNext = Boolean(nextWeekKey);
  const onlyByes =
    visibleItems.length > 0 &&
    visibleItems.every((item) => item.type === "bye");

  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-3 rounded-[20px] bg-[hsl(var(--primary)/.06)] p-3">
        <div className="grid grid-cols-4 rounded-xl border bg-[hsl(var(--card))] p-1 shadow-sm">
          {modes.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              data-testid={`filter-mode-${value.toLowerCase()}`}
              onClick={() => {
                setMode(value);
                setDateFilter("all");
              }}
              className={`min-h-[44px] min-w-0 rounded-lg px-1 text-xs font-bold sm:text-sm ${
                mode === value
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                  : "text-[hsl(var(--muted-foreground))]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-xs font-bold">
            Team
            <select
              value={teamFilter}
              onChange={(event) =>
                setTeamFilter(
                  event.target.value === "all"
                    ? "all"
                    : Number(event.target.value),
                )
              }
              aria-label="Filter schedule by team"
              data-testid="filter-team"
              className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border bg-[hsl(var(--card))] px-3 text-base font-bold sm:text-sm shadow-sm"
            >
              <option value="all">All Games</option>
              {!commissioner &&
                dashboard?.myTeams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {`My Team${
                      dashboard.myTeams.length > 1 ? ` (${team.teamName})` : ""
                    }`}
                  </option>
                ))}
              {commissioner &&
                teams
                  .filter((team) => team.active)
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold">
            Date
            <select
              value={activeDate}
              onChange={(event) => setDateFilter(event.target.value)}
              aria-label="Filter schedule by date"
              data-testid="filter-date"
              className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border bg-[hsl(var(--card))] px-3 text-base font-bold sm:text-sm shadow-sm"
            >
              <option value="all">
                {mode === "Week" ? "All Dates This Week" : "All Dates"}
              </option>
              {availableDates.map((date) => (
                <option key={date} value={date}>
                  {formatLeagueDate(date)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section
        className="rounded-[22px] border bg-[hsl(var(--card))] p-3 shadow-sm sm:p-4"
        aria-label="League week navigation"
      >
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <button
            type="button"
            data-testid="action-prev-week"
            onClick={() => previousWeekKey && chooseWeek(previousWeekKey)}
            disabled={!showPrevious}
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-[hsl(var(--primary))] disabled:opacity-30"
            aria-label="Previous league week"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 text-center">
            <p
              className="font-display text-xl font-extrabold uppercase tracking-wide"
              data-testid="text-current-week"
            >
              {selectedWeek?.label ?? "No league weeks"}
            </p>
            {selectedWeek && (
              <p className="mt-0.5 break-words text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                {formatWeekRange(selectedWeek)}
              </p>
            )}
          </div>
          <button
            type="button"
            data-testid="action-next-week"
            onClick={() => nextWeekKey && chooseWeek(nextWeekKey)}
            disabled={!showNext}
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-[hsl(var(--primary))] disabled:opacity-30"
            aria-label="Next league week"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
        <button
          type="button"
          data-testid="action-current-week"
          onClick={() => currentWeekKey && chooseWeek(currentWeekKey)}
          disabled={!currentWeekKey}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--accent))] px-4 text-xs font-bold uppercase tracking-wider text-[hsl(var(--accent-foreground))] disabled:opacity-50 shadow-sm"
        >
          <CalendarDays className="h-4 w-4" />
          Current Week / Today
        </button>
      </section>

      <section
        className="rounded-[20px] border bg-[hsl(var(--card))] p-3 sm:p-4"
        data-testid="week-summary"
      >
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
          Weekly summary
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase">
          <Count label="Total Games" value={counts.totalGames} />
          <Count label="Completed" value={counts.completedGames} />
          <Count label="Pending Scores" value={counts.pendingScores} />
          <Count label="Scheduled" value={counts.scheduledGames} />
          <Count label="Bye Teams" value={counts.byeTeams} />
        </div>
      </section>

      {commissioner && (
        <section
          className="rounded-[20px] border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--primary)/.055)] p-3 sm:p-4"
          data-testid="commissioner-week-tools"
        >
          <div className="flex flex-col gap-4">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
              Commissioner week tools
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <a
                href="#schedule-generator"
                data-testid="action-generate-schedule"
                onClick={() => {
                  const tools = document.getElementById(
                    "commissioner-schedule-tools",
                  ) as HTMLDetailsElement;
                  if (tools) tools.open = true;
                }}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border bg-[hsl(var(--card))] px-2 text-center text-xs font-bold shadow-sm hover:border-[hsl(var(--primary))] transition-colors"
              >
                Generate Schedule
              </a>
              <button
                type="button"
                data-testid="action-edit-schedule"
                onClick={() => setChoosingGame(true)}
                disabled={
                  !selectedWeek?.items.some((item) => item.type === "game")
                }
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border bg-[hsl(var(--card))] px-2 text-center text-xs font-bold shadow-sm hover:border-[hsl(var(--primary))] transition-colors"
              >
                <Settings2 className="h-4 w-4 shrink-0" /> Edit Schedule
              </button>
              <button
                type="button"
                data-testid="action-add-game"
                onClick={() => setAddingGame(true)}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-2 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow-sm transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4 shrink-0" /> Add Game
              </button>
              <a
                href="#schedule-byes"
                data-testid="action-manage-byes"
                onClick={() => {
                  const tools = document.getElementById(
                    "commissioner-schedule-tools",
                  ) as HTMLDetailsElement;
                  if (tools) tools.open = true;
                }}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border bg-[hsl(var(--card))] px-2 text-center text-xs font-bold shadow-sm hover:border-[hsl(var(--primary))] transition-colors"
              >
                Manage Byes
              </a>
            </div>
          </div>
        </section>
      )}

      {onlyByes && (
        <p className="rounded-[18px] border border-[hsl(var(--accent)/.4)] bg-[hsl(var(--accent)/.14)] p-3 text-center text-sm font-bold">
          {selectedTeamName
            ? `${selectedTeamName} has a bye for the selected date or week.`
            : "The selected schedule contains bye entries and no games."}
        </p>
      )}

      {visibleItems.length === 0 ? (
        <EmptyState
          hasModeItems={modeItems.length > 0}
          hasTeamItems={teamItems.length > 0}
          teamName={selectedTeamName}
          activeDate={activeDate}
          mode={mode}
        />
      ) : (
        <div className="space-y-7">
          {visibleWeeks.map((week) => (
            <section key={week.key} className="min-w-0 space-y-4">
              {mode !== "Week" && (
                <div className="border-b pb-2">
                  <h2 className="font-display text-xl font-extrabold text-[hsl(var(--primary))]">
                    {week.label}
                  </h2>
                  <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    {formatWeekRange(week)}
                  </p>
                </div>
              )}
              {week.dates.map((date) => (
                <div key={date} className="min-w-0 space-y-3">
                  <h3 className="break-words text-sm font-extrabold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    {formatLeagueDate(date)}
                  </h3>
                  {week.items
                    .filter((item) => item.date === date)
                    .map((item) =>
                      item.type === "game" ? (
                        <GameCard
                          key={`game-${item.data.id}`}
                          game={item.data}
                          commissioner={commissioner}
                          onEdit={() => setEditingGame(item.data)}
                        />
                      ) : (
                        <ByeCard key={`bye-${item.data.id}`} bye={item.data} />
                      ),
                    )}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {(editingGame || addingGame) && (
        <CommissionerGameEditor
          game={editingGame}
          teams={teams}
          scheduleWeeks={scheduleWeeks}
          initialScheduleWeekId={editingScheduleWeekId ?? selectedWeek?.id}
          initialDate={selectedWeek?.startDate ?? today}
          onClose={() => {
            setEditingGame(undefined);
            setAddingGame(false);
          }}
        />
      )}
      {choosingGame && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-game-chooser-title"
          data-testid="dialog-edit-schedule"
        >
          <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-[24px] bg-[hsl(var(--background))] p-4 shadow-2xl sm:rounded-[24px] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
                  Edit schedule
                </p>
                <h2
                  id="schedule-game-chooser-title"
                  className="mt-1 break-words font-display text-2xl font-bold"
                >
                  Choose a game from {selectedWeek?.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setChoosingGame(false)}
                className="min-h-[44px] shrink-0 rounded-xl border px-4 text-sm font-bold"
                data-testid="action-close-game-chooser"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {selectedWeek?.items
                .filter(
                  (item): item is Extract<ScheduleItem, { type: "game" }> =>
                    item.type === "game",
                )
                .map((item) => (
                  <button
                    key={item.data.id}
                    type="button"
                    onClick={() => {
                      setEditingGame(item.data);
                      setChoosingGame(false);
                    }}
                    className="min-h-[56px] min-w-0 rounded-xl border p-3 text-left hover:border-[hsl(var(--primary))]"
                    data-testid={`action-choose-game-${item.data.id}`}
                  >
                    <span className="block break-words text-sm font-bold">
                      {item.data.homeTeam} vs {item.data.awayTeam}
                    </span>
                    <span className="mt-1 block break-words text-xs text-[hsl(var(--muted-foreground))]">
                      {formatLeagueDate(item.data.date)} · {item.data.startTime}{" "}
                      · {item.data.venue} · {item.data.court}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border bg-[hsl(var(--card))] px-2 py-1">
      {label} {value}
    </span>
  );
}

function EmptyState({
  hasModeItems,
  hasTeamItems,
  teamName,
  activeDate,
  mode,
}: {
  hasModeItems: boolean;
  hasTeamItems: boolean;
  teamName?: string;
  activeDate: string | "all";
  mode: ScheduleMode;
}) {
  let title = "No schedule events";
  let detail = `No ${mode.toLowerCase()} games or byes are scheduled.`;
  if (hasModeItems && !hasTeamItems) {
    title = "No events for this team";
    detail = `${teamName ?? "The selected team"} has no games or bye entries in this view.`;
  } else if (hasTeamItems && activeDate !== "all") {
    title = "No events on this date";
    detail = "Try All Dates or choose another league date.";
  }
  return (
    <div className="rounded-3xl border border-dashed px-4 py-12 text-center">
      <CalendarDays className="mx-auto h-9 w-9 text-[hsl(var(--muted-foreground))]" />
      <p className="mt-4 font-display text-xl font-bold">{title}</p>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        {detail}
      </p>
    </div>
  );
}

function GameCard({
  game,
  commissioner,
  onEdit,
}: {
  game: Game;
  commissioner: boolean;
  onEdit: () => void;
}) {
  const status = !game.published
    ? "DRAFT"
    : game.status === "SCHEDULED"
      ? "PUBLISHED"
      : game.status.replaceAll("_", " ");
  return (
    <article
      className="min-w-0 rounded-[20px] border bg-[hsl(var(--card))] p-4 shadow-sm"
      data-testid={`card-game-${game.id}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="break-words text-xs font-bold text-[hsl(var(--primary))]"
            data-testid={`text-game-time-${game.id}`}
          >
            {formatLeagueDate(game.date)} · {game.startTime}
          </p>
          <p
            className="mt-1 break-words text-xs font-semibold text-[hsl(var(--muted-foreground))]"
            data-testid={`text-game-venue-${game.id}`}
          >
            {game.venue} · {game.court} · Week {game.scheduleWeek ?? "TBD"}
          </p>
        </div>
        <span
          className="shrink-0 rounded-lg bg-[hsl(var(--muted))] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider"
          data-testid={`status-game-${game.id}`}
        >
          {status}
        </span>
      </div>
      <Link
        href={`/schedule/${game.id}`}
        data-testid={`link-game-${game.id}`}
        className="mt-4 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      >
        <TeamScore
          name={game.homeTeam}
          score={game.homeScore}
          id={`home-${game.id}`}
        />
        <TeamScore
          name={game.awayTeam}
          score={game.awayScore}
          id={`away-${game.id}`}
        />
      </Link>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/schedule/${game.id}`}
          data-testid={`action-game-details-${game.id}`}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border px-3 text-xs font-bold transition-colors hover:bg-[hsl(var(--muted)/.5)]"
        >
          Game details
        </Link>
        {commissioner && (
          <button
            type="button"
            onClick={onEdit}
            data-testid={`action-edit-game-${game.id}`}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-3 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow-sm transition-opacity hover:opacity-90"
          >
            <Pencil className="h-4 w-4 shrink-0" /> Edit
          </button>
        )}
      </div>
    </article>
  );
}

function TeamScore({
  name,
  score,
  id,
}: {
  name: string;
  score?: number | null;
  id?: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1">
      <span
        className="min-w-0 break-words font-display text-lg font-bold"
        data-testid={`text-team-name-${id}`}
      >
        {name}
      </span>
      <span
        className="shrink-0 font-mono-custom text-xl font-bold"
        data-testid={`text-team-score-${id}`}
      >
        {score ?? "—"}
      </span>
    </div>
  );
}

function ByeCard({ bye }: { bye: TeamBye }) {
  return (
    <article
      className="min-w-0 rounded-[20px] border-2 border-dashed bg-[hsl(var(--card))] p-4"
      data-testid={`card-bye-${bye.id}`}
    >
      <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
        <Flag className="h-4 w-4 shrink-0 text-[hsl(var(--accent))]" />
        <span
          className="text-xs font-bold uppercase tracking-widest"
          data-testid={`text-bye-week-${bye.id}`}
        >
          BYE WEEK · Week {bye.scheduleWeek}
        </span>
      </div>
      <p
        className="mt-3 break-words font-display text-lg font-bold"
        data-testid={`text-bye-team-${bye.id}`}
      >
        {bye.teamName}
      </p>
      <p
        className="mt-1 text-sm text-[hsl(var(--muted-foreground))]"
        data-testid={`text-bye-date-${bye.id}`}
      >
        {formatLeagueDate(bye.playDate)} · BYE — No match scheduled this week.
      </p>
    </article>
  );
}

export type { ScheduleItem };
