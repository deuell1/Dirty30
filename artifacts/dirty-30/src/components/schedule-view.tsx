import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, CalendarDays, Flag } from "lucide-react";
import type {
  Game,
  TeamBye,
  Team,
  Dashboard,
} from "@workspace/api-client-react";
import {
  mergeScheduleData,
  filterBySegment,
  filterByTeam,
  groupScheduleItems,
  inferUserTeamId,
} from "./schedule-helpers";

function formatMonth(yyyyMm: string) {
  if (!yyyyMm) return "";
  const [year, month] = yyyyMm.split("-");
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Segment = "Upcoming" | "All" | "Completed";
const validSegments: Segment[] = ["Upcoming", "All", "Completed"];

export function persistSelectedMonth(
  storage: Pick<Storage, "setItem" | "removeItem">,
  month: string | null,
) {
  if (month) storage.setItem("schedule-month", month);
  else storage.removeItem("schedule-month");
}

export function isDateInCurrentWeek(date: string, today: string) {
  const current = new Date(`${today}T12:00:00Z`);
  const target = new Date(`${date}T12:00:00Z`);
  const mondayOffset = (current.getUTCDay() + 6) % 7;
  const monday = new Date(current);
  monday.setUTCDate(current.getUTCDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return target >= monday && target <= sunday;
}

function distance(m1: string, m2: string) {
  const [y1, mo1] = m1.split("-").map(Number);
  const [y2, mo2] = m2.split("-").map(Number);
  return (y1 - y2) * 12 + (mo1 - mo2);
}

export function getBestMonth(
  available: string[],
  segment: Segment,
  todayMonth: string,
) {
  if (available.length === 0) return null;
  if (available.includes(todayMonth)) return todayMonth;

  if (segment === "Completed") {
    // most recent month before today
    const past = available.filter((m) => m < todayMonth);
    return past.length > 0 ? past[past.length - 1] : available[0];
  } else if (segment === "Upcoming") {
    // nearest future month
    const future = available.filter((m) => m > todayMonth);
    return future.length > 0 ? future[0] : available[available.length - 1];
  } else {
    // All -> nearest absolute distance
    let best = available[0];
    let minDiff = Math.abs(distance(best, todayMonth));
    for (const m of available) {
      const d = Math.abs(distance(m, todayMonth));
      if (d < minDiff) {
        best = m;
        minDiff = d;
      }
    }
    return best;
  }
}

export function ScheduleView({
  games,
  byes,
  teams,
  dashboard,
  commissioner,
}: {
  games: Game[];
  byes: TeamBye[];
  teams: Team[];
  dashboard?: Dashboard;
  commissioner: boolean;
}) {
  const todayStr = useMemo(() => getTodayStr(), []);

  const myTeamId = useMemo(() => inferUserTeamId(dashboard), [dashboard]);

  const [hasUserSelectedTeam, setHasUserSelectedTeam] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("schedule-team-set") === "true";
  });

  // State from sessionStorage if available
  const [segment, setSegment] = useState<Segment>(() => {
    if (typeof window === "undefined") return "Upcoming";
    const s = sessionStorage.getItem("schedule-segment");
    return validSegments.includes(s as Segment) ? (s as Segment) : "Upcoming";
  });

  const [teamFilter, setTeamFilter] = useState<number | "all">(() => {
    if (typeof window === "undefined") return "all";
    const saved = sessionStorage.getItem("schedule-team");
    if (saved === "all") return "all";
    if (saved && !isNaN(Number(saved))) return Number(saved);
    return "all";
  });

  const [selectedMonth, setSelectedMonth] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = sessionStorage.getItem("schedule-month");
    return saved && /^\d{4}-\d{2}$/.test(saved) ? saved : null;
  });
  const [showThisWeekOnly, setShowThisWeekOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("schedule-this-week") === "true";
  });

  // Update storage
  useEffect(() => {
    if (typeof window !== "undefined")
      sessionStorage.setItem("schedule-segment", segment);
  }, [segment]);

  useEffect(() => {
    if (typeof window !== "undefined")
      sessionStorage.setItem("schedule-team", teamFilter.toString());
  }, [teamFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    persistSelectedMonth(sessionStorage, selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "schedule-this-week",
        showThisWeekOnly ? "true" : "false",
      );
    }
  }, [showThisWeekOnly]);

  useEffect(() => {
    if (
      !commissioner &&
      myTeamId &&
      teamFilter === "all" &&
      !hasUserSelectedTeam
    ) {
      setTeamFilter(myTeamId);
    }
  }, [myTeamId, commissioner, teamFilter, hasUserSelectedTeam]);

  useEffect(() => {
    if (teamFilter === "all") return;
    const isValidCommissionerTeam =
      commissioner &&
      teams.some((team) => team.active && team.id === teamFilter);
    const isValidMemberTeam = !commissioner && myTeamId === teamFilter;
    if (!isValidCommissionerTeam && !isValidMemberTeam && teams.length > 0) {
      setTeamFilter(!commissioner && myTeamId ? myTeamId : "all");
      setSelectedMonth(null);
      setShowThisWeekOnly(false);
    }
  }, [commissioner, myTeamId, teamFilter, teams]);

  const handleTeamChange = (val: number | "all") => {
    setTeamFilter(val);
    setSelectedMonth(null);
    setShowThisWeekOnly(false);
    setHasUserSelectedTeam(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("schedule-team-set", "true");
    }
  };

  // Derived data
  const allItems = useMemo(() => mergeScheduleData(games, byes), [games, byes]);

  const filteredItems = useMemo(() => {
    let items = filterByTeam(allItems, teamFilter);
    items = filterBySegment(items, segment, todayStr);
    return items;
  }, [allItems, teamFilter, segment, todayStr]);

  const grouped = useMemo(
    () => groupScheduleItems(filteredItems, todayStr),
    [filteredItems, todayStr],
  );

  const allFilteredByTeam = useMemo(
    () => filterByTeam(allItems, teamFilter),
    [allItems, teamFilter],
  );

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const item of allFilteredByTeam) {
      months.add(item.date.substring(0, 7));
    }
    return Array.from(months).sort();
  }, [allFilteredByTeam]);

  const filteredMonths = useMemo(
    () =>
      Array.from(
        new Set(filteredItems.map((item) => item.date.substring(0, 7))),
      ).sort(),
    [filteredItems],
  );

  const todayMonth = todayStr.substring(0, 7);
  const navigableMonths = useMemo(
    () => Array.from(new Set([...availableMonths, todayMonth])).sort(),
    [availableMonths, todayMonth],
  );

  const activeMonth = useMemo(() => {
    if (selectedMonth && navigableMonths.includes(selectedMonth)) {
      return selectedMonth;
    }
    return getBestMonth(
      filteredMonths.length > 0 ? filteredMonths : navigableMonths,
      segment,
      todayMonth,
    );
  }, [selectedMonth, navigableMonths, filteredMonths, segment, todayMonth]);

  const currentMonthGroups = useMemo(() => {
    if (!activeMonth) return [];
    return grouped.filter(
      (group) =>
        group.rawDate.startsWith(activeMonth) &&
        (!showThisWeekOnly || isDateInCurrentWeek(group.rawDate, todayStr)),
    );
  }, [grouped, activeMonth, showThisWeekOnly, todayStr]);

  const currentMonthIndex = navigableMonths.indexOf(activeMonth || "");
  const hasPrev = currentMonthIndex > 0;
  const hasNext = currentMonthIndex < navigableMonths.length - 1;

  const onlyItem =
    currentMonthGroups.length === 1 && currentMonthGroups[0].items.length === 1
      ? currentMonthGroups[0].items[0]
      : undefined;
  const isOnlyBye = onlyItem?.type === "bye";
  const isCurrentWeekBye =
    isOnlyBye && isDateInCurrentWeek(onlyItem.date, todayStr);

  const jumpToToday = () => {
    setSegment("Upcoming");
    setSelectedMonth(todayMonth);
    setShowThisWeekOnly(true);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Controls Container */}
      <div className="flex flex-col gap-4 rounded-[20px] bg-[hsl(var(--primary)/.06)] p-3">
        {/* Segment Control */}
        <div className="flex rounded-xl bg-[hsl(var(--card))] p-1 border shadow-sm">
          {validSegments.map((s) => (
            <button
              key={s}
              aria-pressed={segment === s}
              onClick={() => {
                setSegment(s);
                setSelectedMonth(null);
                setShowThisWeekOnly(false);
              }}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${
                segment === s
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] border-transparent"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center justify-between gap-3">
          <select
            value={teamFilter}
            onChange={(e) =>
              handleTeamChange(
                e.target.value === "all" ? "all" : Number(e.target.value),
              )
            }
            aria-label="Filter schedule by team"
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border bg-[hsl(var(--card))] px-3 text-sm font-bold text-[hsl(var(--foreground))] outline-none shadow-sm focus:border-[hsl(var(--primary))]"
          >
            {!commissioner && myTeamId && (
              <option value={myTeamId}>
                My Team ({teams.find((t) => t.id === myTeamId)?.name})
              </option>
            )}
            <option value="all">All Teams</option>
            {commissioner && (
              <optgroup label="Active Teams">
                {teams
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>

          <button
            onClick={jumpToToday}
            aria-pressed={showThisWeekOnly}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[hsl(var(--accent))] px-4 text-xs font-bold uppercase tracking-wider text-[hsl(var(--accent-foreground))] shadow-sm transition-transform active:scale-95"
            aria-label="Jump to Today / This Week"
          >
            <CalendarDays className="h-4 w-4" />
            <span>This Week</span>
          </button>
        </div>
      </div>

      {/* Month Navigation */}
      {activeMonth && (
        <div
          className="flex items-center justify-between rounded-2xl bg-[hsl(var(--card))] border p-2 shadow-sm"
          aria-label="Month navigation"
        >
          <button
            onClick={() => {
              if (hasPrev) {
                setSelectedMonth(navigableMonths[currentMonthIndex - 1]);
                setShowThisWeekOnly(false);
              }
            }}
            disabled={!hasPrev}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[hsl(var(--primary))] disabled:opacity-30 disabled:hover:bg-transparent hover:bg-[hsl(var(--primary)/.1)]"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-[hsl(var(--foreground))]">
            {formatMonth(activeMonth)}
          </h2>

          <button
            onClick={() => {
              if (hasNext) {
                setSelectedMonth(navigableMonths[currentMonthIndex + 1]);
                setShowThisWeekOnly(false);
              }
            }}
            disabled={!hasNext}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[hsl(var(--primary))] disabled:opacity-30 disabled:hover:bg-transparent hover:bg-[hsl(var(--primary)/.1)]"
            aria-label="Next month"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex flex-col gap-6">
        {currentMonthGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[hsl(var(--border))] py-12 text-center px-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
              <CalendarDays className="h-8 w-8" />
            </div>
            <p className="mt-4 font-display text-xl font-bold">{`No ${segment.toLowerCase()} items found`}</p>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {showThisWeekOnly
                ? teamFilter !== "all"
                  ? "No upcoming games for your team this week."
                  : "No games scheduled this week."
                : teamFilter !== "all"
                  ? `No ${segment.toLowerCase()} matches found for the selected team${activeMonth ? ` in ${formatMonth(activeMonth)}` : ""}.`
                  : `No ${segment.toLowerCase()} matches scheduled${activeMonth ? ` in ${formatMonth(activeMonth)}` : ""}.`}
            </p>
          </div>
        ) : (
          <>
            {isOnlyBye && (
              <div className="rounded-[20px] bg-[hsl(var(--primary)/.05)] p-4 text-center border border-[hsl(var(--primary)/.1)] mb-[-12px]">
                <p className="font-bold text-[hsl(var(--primary))]">
                  {isCurrentWeekBye
                    ? "Your team has a bye this week"
                    : "Enjoy your time off"}
                </p>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  This bye is the only item on your schedule for{" "}
                  {activeMonth ? formatMonth(activeMonth) : "this month"}.
                </p>
              </div>
            )}
            {currentMonthGroups.map((group) => (
              <div
                key={`${group.week}-${group.rawDate}`}
                className="flex flex-col gap-3"
              >
                <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1 border-b pb-2">
                  <h3 className="flex min-w-0 flex-wrap items-center font-display text-lg font-bold text-[hsl(var(--primary))]">
                    Week {group.week === 999 ? "TBD" : group.week}
                    {group.isHistorical && (
                      <span className="ml-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] rounded-full px-2 py-0.5">
                        Past
                      </span>
                    )}
                    {isDateInCurrentWeek(group.rawDate, todayStr) && (
                      <span className="ml-3 rounded-full border border-[hsl(var(--primary)/.3)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                        This week
                      </span>
                    )}
                  </h3>
                  <span className="mb-0.5 min-w-0 break-words text-sm font-semibold text-[hsl(var(--muted-foreground))]">
                    {group.dateStr}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {group.items.map((item) => {
                    if (item.type === "game") {
                      return (
                        <GameCard
                          key={`game-${item.data.id}`}
                          game={item.data}
                          isHistorical={group.isHistorical}
                        />
                      );
                    } else {
                      return (
                        <ByeCard
                          key={`bye-${item.data.id}`}
                          bye={item.data}
                          isHistorical={group.isHistorical}
                        />
                      );
                    }
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function GameCard({
  game,
  isHistorical,
}: {
  game: Game;
  isHistorical: boolean;
}) {
  const isDraft = !game.published;

  let statusColor =
    "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]";
  let statusLabel = game.status.replaceAll("_", " ");

  if (isDraft) {
    statusColor =
      "bg-[hsl(var(--destructive)/.15)] text-[hsl(var(--destructive))] border border-[hsl(var(--destructive)/.3)]";
    statusLabel = "DRAFT";
  } else if (game.status === "SCHEDULED") {
    statusLabel = "UPCOMING";
  } else if (game.status === "CANCELLED") {
    statusLabel = "CANCELLED";
  } else if (game.status === "DISPUTED") {
    statusColor =
      "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]";
    statusLabel = "DISPUTED";
  } else if (game.status === "PENDING_CONFIRMATION") {
    statusColor =
      "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]";
    statusLabel = "PENDING";
  } else if (game.status === "FINAL") {
    statusColor =
      "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]";
    statusLabel = "FINAL";
  }

  const opacityClass = isHistorical ? "opacity-75" : "";
  const borderClass = isHistorical ? "border-dashed" : "border-solid";

  return (
    <Link
      href={`/schedule/${game.id}`}
      className={`relative flex flex-col rounded-[20px] border ${borderClass} border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm transition hover:border-[hsl(var(--primary))] hover:shadow-md ${opacityClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col text-sm text-[hsl(var(--muted-foreground))]">
          <span className="font-mono-custom font-bold text-[hsl(var(--primary))]">
            {game.startTime}
          </span>
          <span className="mt-0.5 text-xs font-semibold">
            {game.venue} · {game.court}
          </span>
        </div>
        <span
          className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest ${statusColor}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="break-words font-display text-lg font-bold">
              {game.homeTeam}
            </span>
            {game.homeScore != null && (
              <span className="font-mono-custom text-xl font-bold">
                {game.homeScore}
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="break-words font-display text-lg font-bold">
              {game.awayTeam}
            </span>
            {game.awayScore != null && (
              <span className="font-mono-custom text-xl font-bold">
                {game.awayScore}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function ByeCard({
  bye,
  isHistorical,
}: {
  bye: TeamBye;
  isHistorical: boolean;
}) {
  const opacityClass = isHistorical ? "opacity-75" : "";
  return (
    <div
      className={`flex flex-col rounded-[20px] border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm ${opacityClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
          <Flag className="h-4 w-4 text-[hsl(var(--accent))]" />
          <span className="text-xs font-bold uppercase tracking-widest">
            BYE WEEK
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <span className="min-w-0 break-all font-display text-lg font-bold text-[hsl(var(--foreground))]">
          {bye.teamName}
        </span>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">
          BYE — No match scheduled this week.
        </span>
      </div>
    </div>
  );
}
