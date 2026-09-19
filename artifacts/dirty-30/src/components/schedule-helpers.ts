import type { Dashboard, Game, TeamBye } from "@workspace/api-client-react";

export type ScheduleItem =
  | {
      type: "game";
      week: number | null;
      date: string;
      time: string;
      data: Game;
    }
  | {
      type: "bye";
      week: number;
      date: string;
      time: string;
      data: TeamBye;
    };

export type ScheduleMode = "Week" | "Upcoming" | "Completed" | "All";

export type ScheduleWeekGroup = {
  key: string;
  scheduleWeek: number | null;
  label: string;
  startDate: string;
  endDate: string;
  dates: string[];
  items: ScheduleItem[];
  isLegacy: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function inferUserTeamId(dashboard?: Dashboard): number | undefined {
  if (!dashboard || dashboard.role === "COMMISSIONER") return undefined;
  return dashboard.nextBye?.teamId;
}

export function mergeScheduleData(
  games: Game[],
  byes: TeamBye[],
): ScheduleItem[] {
  return [
    ...games.map((game) => ({
      type: "game" as const,
      week:
        typeof game.scheduleWeek === "number" && game.scheduleWeek > 0
          ? game.scheduleWeek
          : null,
      date: game.date,
      time: game.startTime,
      data: game,
    })),
    ...byes.map((bye) => ({
      type: "bye" as const,
      week: bye.scheduleWeek,
      date: bye.playDate,
      time: "00:00",
      data: bye,
    })),
  ].sort(compareItems);
}

function compareItems(a: ScheduleItem, b: ScheduleItem) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.time !== b.time) return a.time.localeCompare(b.time);
  return a.data.id - b.data.id;
}

export function isCompletedItem(item: ScheduleItem, today: string) {
  const terminal =
    item.type === "game" &&
    (item.data.status === "FINAL" || item.data.status === "CANCELLED");
  return item.date < today || terminal;
}

export function filterByMode(
  items: ScheduleItem[],
  mode: ScheduleMode,
  today: string,
) {
  if (mode === "All" || mode === "Week") return items;
  return items.filter((item) =>
    mode === "Completed"
      ? isCompletedItem(item, today)
      : !isCompletedItem(item, today),
  );
}

export function filterBySegment(
  items: ScheduleItem[],
  segment: "Upcoming" | "All" | "Completed",
  today: string,
) {
  return filterByMode(items, segment, today);
}

export function filterByTeam(
  items: ScheduleItem[],
  teamId: number | "all",
): ScheduleItem[] {
  if (teamId === "all") return items;
  return items.filter((item) =>
    item.type === "game"
      ? item.data.homeTeamId === teamId || item.data.awayTeamId === teamId
      : item.data.teamId === teamId,
  );
}

export function filterByDate(items: ScheduleItem[], date: string | "all") {
  return date === "all" ? items : items.filter((item) => item.date === date);
}

export function startOfCalendarWeek(date: string) {
  if (!ISO_DATE.test(date)) return date;
  const value = new Date(`${date}T12:00:00Z`);
  const mondayOffset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - mondayOffset);
  return value.toISOString().slice(0, 10);
}

export function endOfCalendarWeek(date: string) {
  const value = new Date(`${startOfCalendarWeek(date)}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 6);
  return value.toISOString().slice(0, 10);
}

export function buildScheduleWeeks(items: ScheduleItem[]): ScheduleWeekGroup[] {
  const groups = new Map<string, ScheduleWeekGroup>();

  for (const item of items) {
    if (!ISO_DATE.test(item.date)) continue;
    const explicitWeek = item.week != null && item.week > 0;
    const calendarStart = startOfCalendarWeek(item.date);
    const key = explicitWeek ? `week:${item.week}` : `legacy:${calendarStart}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      existing.dates = Array.from(
        new Set([...existing.dates, item.date]),
      ).sort();
      existing.startDate =
        item.date < existing.startDate ? item.date : existing.startDate;
      existing.endDate =
        item.date > existing.endDate ? item.date : existing.endDate;
      continue;
    }

    groups.set(key, {
      key,
      scheduleWeek: explicitWeek ? item.week : null,
      label: explicitWeek ? `Week ${item.week}` : "Legacy week",
      startDate: item.date,
      endDate: item.date,
      dates: [item.date],
      items: [item],
      isLegacy: !explicitWeek,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort(compareItems),
      dates: [...group.dates].sort(),
    }))
    .sort((a, b) => {
      if (a.startDate !== b.startDate)
        return a.startDate.localeCompare(b.startDate);
      if (a.scheduleWeek !== null && b.scheduleWeek !== null)
        return a.scheduleWeek - b.scheduleWeek;
      return a.key.localeCompare(b.key);
    });
}

export function selectCurrentScheduleWeek(
  groups: ScheduleWeekGroup[],
  today: string,
) {
  if (groups.length === 0) return null;
  const current = groups.find(
    (group) => group.startDate <= today && group.endDate >= today,
  );
  if (current) return current.key;
  const upcoming = groups.find((group) => group.startDate > today);
  return upcoming?.key ?? groups[groups.length - 1].key;
}

export function formatLeagueDate(date: string, includeWeekday = true) {
  const value = new Date(`${date}T12:00:00Z`);
  return value.toLocaleDateString("en-US", {
    ...(includeWeekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatWeekRange(group: ScheduleWeekGroup) {
  if (group.startDate === group.endDate) {
    return formatLeagueDate(group.startDate);
  }
  return `${formatLeagueDate(group.startDate)} – ${formatLeagueDate(group.endDate)}`;
}

export function groupScheduleItems(items: ScheduleItem[], today: string) {
  return buildScheduleWeeks(items).flatMap((week) =>
    week.dates.map((date) => ({
      week: week.scheduleWeek ?? 999,
      dateStr: formatLeagueDate(date, true),
      rawDate: date,
      items: week.items.filter((item) => item.date === date),
      isHistorical: date < today,
    })),
  );
}
