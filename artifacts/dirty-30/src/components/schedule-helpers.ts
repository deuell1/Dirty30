import type { Game, TeamBye, Dashboard } from "@workspace/api-client-react";

export type ScheduleItem =
  | { type: "game"; week: number; date: string; time: string; data: Game }
  | { type: "bye"; week: number; date: string; time: string; data: TeamBye };

export type GroupedSchedule = {
  week: number;
  dateStr: string;
  rawDate: string;
  items: ScheduleItem[];
  isHistorical: boolean;
};

export function inferUserTeamId(dashboard?: Dashboard): number | undefined {
  if (!dashboard) return undefined;
  if (dashboard.role === "COMMISSIONER") return undefined;

  // Dashboard games are league-wide. nextBye is the only membership-scoped
  // schedule signal currently exposed by the existing API contract.
  return dashboard.nextBye?.teamId;
}

export function mergeScheduleData(
  games: Game[],
  byes: TeamBye[],
): ScheduleItem[] {
  const items: ScheduleItem[] = [
    ...games.map((g) => ({
      type: "game" as const,
      week: g.scheduleWeek ?? 999,
      date: g.date,
      time: g.startTime,
      data: g,
    })),
    ...byes.map((b) => ({
      type: "bye" as const,
      week: b.scheduleWeek,
      date: b.playDate,
      time: "00:00",
      data: b,
    })),
  ];

  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.week !== b.week) return a.week - b.week;
    return a.time.localeCompare(b.time);
  });
}

export function filterBySegment(
  items: ScheduleItem[],
  segment: "Upcoming" | "All" | "Completed",
  todayStr: string,
): ScheduleItem[] {
  if (segment === "All") return items;
  return items.filter((item) => {
    const isPastDate = item.date < todayStr;
    const isFinalStatus =
      item.type === "game" &&
      (item.data.status === "FINAL" || item.data.status === "CANCELLED");
    const isCompleted = isPastDate || isFinalStatus;

    return segment === "Completed" ? isCompleted : !isCompleted;
  });
}

export function filterByTeam(
  items: ScheduleItem[],
  teamId: number | "all",
): ScheduleItem[] {
  if (teamId === "all") return items;
  return items.filter((item) => {
    if (item.type === "game") {
      return item.data.homeTeamId === teamId || item.data.awayTeamId === teamId;
    } else {
      return item.data.teamId === teamId;
    }
  });
}

export function groupScheduleItems(
  items: ScheduleItem[],
  todayStr: string,
): GroupedSchedule[] {
  const groups = new Map<string, GroupedSchedule>();

  for (const item of items) {
    const key = `${item.week}-${item.date}`;
    if (!groups.has(key)) {
      const d = new Date(item.date + "T12:00:00Z");
      const dateStr = d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
      groups.set(key, {
        week: item.week,
        dateStr,
        rawDate: item.date,
        items: [],
        isHistorical: item.date < todayStr,
      });
    }
    groups.get(key)!.items.push(item);
  }
  return Array.from(groups.values());
}
