import type {
  Dashboard,
  Game,
  ScheduleWeek,
  TeamBye,
} from "@workspace/api-client-react";

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
  id: number;
  key: string;
  scheduleWeek: number | null;
  label: string;
  startDate: string;
  endDate: string;
  dates: string[];
  items: ScheduleItem[];
};

export function inferUserTeamIds(dashboard?: Dashboard): number[] {
  if (!dashboard || dashboard.role === "COMMISSIONER") return [];
  return dashboard.myTeams.map((team) => team.teamId);
}

export function mergeScheduleData(weeks: ScheduleWeek[]): ScheduleItem[] {
  return weeks
    .flatMap((week) => [
      ...week.games.map((game) => ({
        type: "game" as const,
        week: week.weekNumber,
        date: game.date,
        time: game.startTime,
        data: game,
      })),
      ...week.byes.map((bye) => ({
        type: "bye" as const,
        week: week.weekNumber,
        date: bye.playDate,
        time: "00:00",
        data: bye,
      })),
    ])
    .sort(compareItems);
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

/** Build display groups from the API's canonical weeks, never from event dates. */
export function scheduleWeekGroups(
  weeks: ScheduleWeek[],
  items?: ScheduleItem[],
): ScheduleWeekGroup[] {
  const byWeek = new Map<number, ScheduleItem[]>();
  for (const item of items ?? mergeScheduleData(weeks)) {
    if (item.week == null) continue;
    byWeek.set(item.week, [...(byWeek.get(item.week) ?? []), item]);
  }
  return [...weeks]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((week) => {
      const weekItems = (byWeek.get(week.weekNumber) ?? []).sort(compareItems);
      const dates = [...new Set(weekItems.map((item) => item.date))].sort();
      return {
        id: week.id,
        key: `week:${week.weekNumber}`,
        scheduleWeek: week.weekNumber,
        label: `Week ${week.weekNumber}`,
        startDate: week.startDate,
        endDate: week.endDate,
        dates,
        items: weekItems,
      };
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

export function adjacentScheduleWeekKey(
  groups: ScheduleWeekGroup[],
  activeKey: string | null,
  direction: -1 | 1,
) {
  const index = groups.findIndex((group) => group.key === activeKey);
  const target = index + direction;
  return index >= 0 && target >= 0 && target < groups.length
    ? groups[target].key
    : null;
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
