import { describe, it, expect } from "vitest";
import {
  inferUserTeamId,
  mergeScheduleData,
  filterBySegment,
  filterByTeam,
  groupScheduleItems,
  ScheduleItem,
} from "../src/components/schedule-helpers";
import type { Game, TeamBye } from "@workspace/api-client-react";

describe("Schedule Helpers", () => {
  it("infers user team id accurately", () => {
    expect(inferUserTeamId(undefined)).toBeUndefined();

    // Commissioner
    expect(
      inferUserTeamId({
        role: "COMMISSIONER",
        attentionItems: [],
        leagueName: "",
        seasonName: "",
        nextGame: null,
        nextBye: null,
        recentResults: [],
      }),
    ).toBeUndefined();

    // From Next Bye
    expect(
      inferUserTeamId({
        role: "PLAYER",
        attentionItems: [],
        leagueName: "",
        seasonName: "",
        nextGame: null,
        nextBye: { teamId: 99 } as any,
        recentResults: [],
      }),
    ).toBe(99);

    // League-wide game history must never be mistaken for membership.
    expect(
      inferUserTeamId({
        role: "PLAYER",
        attentionItems: [],
        leagueName: "",
        seasonName: "",
        nextGame: { homeTeamId: 1, awayTeamId: 2 } as any,
        nextBye: null,
        recentResults: [
          { homeTeamId: 2, awayTeamId: 3 } as any,
          { homeTeamId: 4, awayTeamId: 2 } as any,
        ],
      }),
    ).toBeUndefined();
  });

  it("merges games and byes, handling null week and sorting", () => {
    const games: Game[] = [
      {
        id: 1,
        scheduleWeek: null,
        date: "2024-10-01",
        startTime: "10:00",
      } as any,
      { id: 2, scheduleWeek: 1, date: "2024-09-01", startTime: "11:00" } as any,
    ];
    const byes: TeamBye[] = [
      { id: 1, scheduleWeek: 1, playDate: "2024-09-01" } as any,
    ];

    const merged = mergeScheduleData(games, byes);
    expect(merged.length).toBe(3);
    // Sort order: date -> week -> time
    expect(merged[0].week).toBe(1);
    expect(merged[0].type).toBe("bye"); // byes have time "00:00", game has "11:00"
    expect(merged[1].type).toBe("game");
    expect(merged[1].data.id).toBe(2);
    expect(merged[2].week).toBe(999);
  });

  it("filters by segment correctly (Upcoming, All, Completed)", () => {
    const items: ScheduleItem[] = [
      {
        type: "game",
        week: 1,
        date: "2024-09-20",
        time: "10:00",
        data: { status: "SCHEDULED" } as any,
      }, // Upcoming
      {
        type: "game",
        week: 1,
        date: "2024-09-15",
        time: "10:00",
        data: { status: "SCHEDULED" } as any,
      }, // Upcoming today
      {
        type: "game",
        week: 2,
        date: "2024-09-21",
        time: "10:00",
        data: { status: "FINAL" } as any,
      }, // Completed
      {
        type: "bye",
        week: 1,
        date: "2024-08-01",
        time: "00:00",
        data: {} as any,
      }, // Completed (past date)
      {
        type: "bye",
        week: 2,
        date: "2024-10-01",
        time: "00:00",
        data: {} as any,
      }, // Upcoming (future date)
      {
        type: "game",
        week: 1,
        date: "2024-09-01",
        time: "10:00",
        data: { status: "SCHEDULED" } as any,
      }, // Completed (past date, even if SCHEDULED)
    ];

    const todayStr = "2024-09-15";

    const all = filterBySegment(items, "All", todayStr);
    expect(all.length).toBe(6);

    const upcoming = filterBySegment(items, "Upcoming", todayStr);
    expect(upcoming.length).toBe(3);
    expect(
      upcoming.some((i) => i.type === "game" && i.data.status === "SCHEDULED"),
    ).toBe(true);
    expect(
      upcoming.some((i) => i.type === "bye" && i.date === "2024-10-01"),
    ).toBe(true);
    expect(upcoming.some((i) => i.date === "2024-09-15")).toBe(true);

    const completed = filterBySegment(items, "Completed", todayStr);
    expect(completed.length).toBe(3);
  });

  it("retains drafts in filter (drafts have status SCHEDULED)", () => {
    const items: ScheduleItem[] = [
      {
        type: "game",
        week: 1,
        date: "2024-10-01",
        time: "10:00",
        data: { status: "SCHEDULED", published: false } as any,
      },
    ];
    const upcoming = filterBySegment(items, "Upcoming", "2024-09-01");
    expect(upcoming.length).toBe(1); // Draft is retained
  });

  it("filters by team, including byes", () => {
    const items: ScheduleItem[] = [
      {
        type: "game",
        week: 1,
        date: "2024-09-01",
        time: "10:00",
        data: { homeTeamId: 1, awayTeamId: 2 } as any,
      },
      {
        type: "bye",
        week: 2,
        date: "2024-09-02",
        time: "00:00",
        data: { teamId: 1 } as any,
      },
    ];

    expect(filterByTeam(items, 1).length).toBe(2);
    expect(filterByTeam(items, 2).length).toBe(1);
    expect(filterByTeam(items, "all").length).toBe(2);
  });

  it("groups schedule items properly", () => {
    const items: ScheduleItem[] = [
      {
        type: "game",
        week: 1,
        date: "2024-09-01",
        time: "10:00",
        data: { id: 1 } as any,
      },
      {
        type: "bye",
        week: 1,
        date: "2024-09-01",
        time: "00:00",
        data: { id: 1 } as any,
      },
      {
        type: "game",
        week: 2,
        date: "2024-09-08",
        time: "10:00",
        data: { id: 2 } as any,
      },
    ];

    const grouped = groupScheduleItems(items, "2024-09-05");

    expect(grouped.length).toBe(2);

    // First group
    expect(grouped[0].week).toBe(1);
    expect(grouped[0].rawDate).toBe("2024-09-01");
    expect(grouped[0].items.length).toBe(2);
    expect(grouped[0].isHistorical).toBe(true); // < 2024-09-05

    // Second group
    expect(grouped[1].week).toBe(2);
    expect(grouped[1].rawDate).toBe("2024-09-08");
    expect(grouped[1].isHistorical).toBe(false);
  });
});
