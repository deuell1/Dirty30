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
  Team,
  TeamBye,
} from "@workspace/api-client-react";
import {
  buildScheduleWeeks,
  filterByDate,
  filterByMode,
  filterByTeam,
  formatLeagueDate,
  formatWeekRange,
  inferUserTeamId,
  mergeScheduleData,
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
    draft: 0,
    published: 0,
    pending: 0,
    disputed: 0,
    final: 0,
  };
  for (const item of group?.items ?? []) {
    if (item.type !== "game") continue;
    if (!item.data.published) counts.draft += 1;
    else if (item.data.status === "PENDING_CONFIRMATION") counts.pending += 1;
    else if (item.data.status === "DISPUTED") counts.disputed += 1;
    else if (item.data.status === "FINAL") counts.final += 1;
    else counts.published += 1;
  }
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
  games,
  byes,
  teams,
  dashboard,
  commissioner,
  scheduleLoaded = true,
}: {
  games: Game[];
  byes: TeamBye[];
  teams: Team[];
  dashboard?: Dashboard;
  commissioner: boolean;
  scheduleLoaded?: boolean;
}) {
  const today = useMemo(todayString, []);
  const allItems = useMemo(() => mergeScheduleData(games, byes), [games, byes]);
  const weeks = useMemo(() => buildScheduleWeeks(allItems), [allItems]);
  const currentWeekKey = useMemo(
    () => selectCurrentScheduleWeek(weeks, today),
    [weeks, today],
  );
  const myTeamId = useMemo(() => inferUserTeamId(dashboard), [dashboard]);
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

  const activeWeekKey =
    selectedWeekKey && weeks.some((week) => week.key === selectedWeekKey)
      ? selectedWeekKey
      : currentWeekKey;
  const selectedWeek = weeks.find((week) => week.key === activeWeekKey);
  const weekIndex = weeks.findIndex((week) => week.key === activeWeekKey);

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
    const validMyTeam = !commissioner && myTeamId === teamFilter;
    if (!validCommissionerTeam && !validMyTeam && teams.length > 0) {
      setTeamFilter(myTeamId ?? "all");
    }
  }, [commissioner, myTeamId, teamFilter, teams]);

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
  const visibleWeeks = useMemo(
    () => buildScheduleWeeks(visibleItems),
    [visibleItems],
  );
  const counts = statusCounts(selectedWeek);
  const selectedTeamName =
    teamFilter === "all"
      ? undefined
      : teams.find((team) => team.id === teamFilter)?.name;

  const chooseWeek = (key: string) => {
    setSelectedWeekKey(key);
    setMode("Week");
    setDateFilter("all");
  };

  const showPrevious = weekIndex > 0;
  const showNext = weekIndex >= 0 && weekIndex < weeks.length - 1;
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
              className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border bg-[hsl(var(--card))] px-3 text-base font-bold sm:text-sm"
            >
              <option value="all">All Teams</option>
              {!commissioner && myTeamId && (
                <option value={myTeamId}>
                  My Team ({teams.find((team) => team.id === myTeamId)?.name})
                </option>
              )}
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
              className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border bg-[hsl(var(--card))] px-3 text-base font-bold sm:text-sm"
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
            onClick={() => showPrevious && chooseWeek(weeks[weekIndex - 1].key)}
            disabled={!showPrevious}
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-[hsl(var(--primary))] disabled:opacity-30"
            aria-label="Previous league week"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 text-center">
            <p className="font-display text-xl font-extrabold uppercase tracking-wide">
              {selectedWeek?.label ?? "No league weeks"}
            </p>
            {selectedWeek && (
              <p className="mt-0.5 break-words text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                {formatWeekRange(selectedWeek)}
                {selectedWeek.isLegacy ? " · date-derived display week" : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => showNext && chooseWeek(weeks[weekIndex + 1].key)}
            disabled={!showNext}
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-[hsl(var(--primary))] disabled:opacity-30"
            aria-label="Next league week"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => currentWeekKey && chooseWeek(currentWeekKey)}
          disabled={!currentWeekKey}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--accent))] px-4 text-xs font-bold uppercase tracking-wider text-[hsl(var(--accent-foreground))] disabled:opacity-50"
        >
          <CalendarDays className="h-4 w-4" />
          Current Week / Today
        </button>
      </section>

      {commissioner && (
        <section
          className="rounded-[20px] border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--primary)/.055)] p-3"
          data-testid="commissioner-week-tools"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
                Commissioner week tools
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase">
                <Count label="Draft" value={counts.draft} />
                <Count label="Published" value={counts.published} />
                <Count label="Pending" value={counts.pending} />
                <Count label="Disputed" value={counts.disputed} />
                <Count label="Final" value={counts.final} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAddingGame(true)}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-3 text-xs font-bold text-[hsl(var(--primary-foreground))]"
              >
                <Plus className="h-4 w-4" /> Add game
              </button>
              <a
                href="#commissioner-schedule-tools"
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border bg-[hsl(var(--card))] px-3 text-center text-xs font-bold"
              >
                <Settings2 className="h-4 w-4" /> Generator & byes
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
          initialDate={selectedWeek?.startDate ?? today}
          onClose={() => {
            setEditingGame(undefined);
            setAddingGame(false);
          }}
        />
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
    <article className="min-w-0 rounded-[20px] border bg-[hsl(var(--card))] p-4 shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-xs font-bold text-[hsl(var(--primary))]">
            {formatLeagueDate(game.date)} · {game.startTime}
          </p>
          <p className="mt-1 break-words text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            {game.venue} · {game.court} · Week {game.scheduleWeek ?? "TBD"}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-[hsl(var(--muted))] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider">
          {status}
        </span>
      </div>
      <Link
        href={`/schedule/${game.id}`}
        className="mt-4 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      >
        <TeamScore name={game.homeTeam} score={game.homeScore} />
        <TeamScore name={game.awayTeam} score={game.awayScore} />
      </Link>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/schedule/${game.id}`}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border px-3 text-xs font-bold"
        >
          Game details
        </Link>
        {commissioner && (
          <button
            type="button"
            onClick={onEdit}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-3 text-xs font-bold text-[hsl(var(--primary-foreground))]"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
        )}
      </div>
    </article>
  );
}

function TeamScore({ name, score }: { name: string; score?: number | null }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1">
      <span className="min-w-0 break-words font-display text-lg font-bold">
        {name}
      </span>
      <span className="shrink-0 font-mono-custom text-xl font-bold">
        {score ?? "—"}
      </span>
    </div>
  );
}

function ByeCard({ bye }: { bye: TeamBye }) {
  return (
    <article className="min-w-0 rounded-[20px] border-2 border-dashed bg-[hsl(var(--card))] p-4">
      <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
        <Flag className="h-4 w-4 text-[hsl(var(--accent))]" />
        <span className="text-xs font-bold uppercase tracking-widest">
          BYE WEEK · Week {bye.scheduleWeek}
        </span>
      </div>
      <p className="mt-3 break-words font-display text-lg font-bold">
        {bye.teamName}
      </p>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        {formatLeagueDate(bye.playDate)} · BYE — No match scheduled this week.
      </p>
    </article>
  );
}

export type { ScheduleItem };
