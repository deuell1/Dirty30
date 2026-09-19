import { describe, expect, it } from "vitest";
import type {
  Dashboard,
  Game,
  ScheduleWeek,
  TeamBye,
} from "@workspace/api-client-react";
import {
  adjacentScheduleWeekKey,
  filterByDate,
  filterByMode,
  filterByTeam,
  inferUserTeamIds,
  mergeScheduleData,
  scheduleWeekGroups,
  selectCurrentScheduleWeek,
} from "../src/components/schedule-helpers";

const game = (values: Partial<Game> = {}) =>
  ({
    id: 1,
    date: "2026-09-12",
    startTime: "18:00",
    status: "SCHEDULED",
    published: true,
    homeTeamId: 1,
    awayTeamId: 2,
    ...values,
  }) as Game;
const bye = (values: Partial<TeamBye> = {}) =>
  ({
    id: 3,
    playDate: "2026-09-12",
    teamId: 3,
    teamName: "Bye Team",
    scheduleWeek: 1,
    source: "GENERATED",
    ...values,
  }) as TeamBye;
const week = (weekNumber: number, values: Partial<ScheduleWeek> = {}) =>
  ({
    id: weekNumber,
    seasonId: 1,
    seasonName: "Season",
    weekNumber,
    playDate: `2026-09-${String(12 + (weekNumber - 1) * 7).padStart(2, "0")}`,
    startDate: `2026-09-${String(12 + (weekNumber - 1) * 7).padStart(2, "0")}`,
    endDate: `2026-09-${String(18 + (weekNumber - 1) * 7).padStart(2, "0")}`,
    games: [],
    byes: [],
    canManage: true,
    canPublish: true,
    canEdit: true,
    ...values,
  }) as ScheduleWeek;

describe("aggregate schedule week helpers", () => {
  it("uses explicit active memberships for My Team", () => {
    expect(inferUserTeamIds(undefined)).toEqual([]);
    expect(
      inferUserTeamIds({
        role: "PLAYER",
        myTeams: [
          { teamId: 9, teamName: "Nine", membershipRole: "PLAYER" },
          { teamId: 12, teamName: "Twelve", membershipRole: "CAPTAIN" },
        ],
        nextBye: null,
      } as Dashboard),
    ).toEqual([9, 12]);
  });

  it("preserves canonical ranges and attaches nested games and byes to one week", () => {
    const weeks = [
      week(4, {
        startDate: "2026-10-02",
        endDate: "2026-10-04",
        games: [
          game({ id: 1, date: "2026-10-02" }),
          game({ id: 2, date: "2026-10-04" }),
        ],
        byes: [bye({ id: 3, playDate: "2026-10-03", scheduleWeek: 4 })],
      }),
    ];
    const groups = scheduleWeekGroups(weeks);
    expect(groups[0]).toMatchObject({
      key: "week:4",
      label: "Week 4",
      startDate: "2026-10-02",
      endDate: "2026-10-04",
    });
    expect(groups[0].items.map((item) => item.data.id)).toEqual([1, 3, 2]);
    expect(mergeScheduleData(weeks).every((item) => item.week === 4)).toBe(
      true,
    );
  });

  it("navigates canonical weeks and uses canonical ranges, including empty weeks", () => {
    const groups = scheduleWeekGroups([week(1), week(2), week(3)]);
    expect(selectCurrentScheduleWeek(groups, "2026-09-19")).toBe("week:2");
    expect(adjacentScheduleWeekKey(groups, "week:2", -1)).toBe("week:1");
    expect(adjacentScheduleWeekKey(groups, "week:2", 1)).toBe("week:3");
    expect(adjacentScheduleWeekKey(groups, "week:1", -1)).toBeNull();
  });

  it("filters flattened aggregate items by mode, team, and date", () => {
    const items = mergeScheduleData([
      week(1, {
        games: [
          game({ id: 1, date: "2026-09-18" }),
          game({
            id: 2,
            date: "2026-09-20",
            homeTeamId: 2,
            awayTeamId: 3,
            status: "FINAL",
          }),
        ],
        byes: [bye({ id: 3, playDate: "2026-09-18", teamId: 1 })],
      }),
    ]);
    expect(
      filterByDate(
        filterByTeam(filterByMode(items, "All", "2026-09-19"), 1),
        "2026-09-18",
      ).map((item) => item.data.id),
    ).toEqual([3, 1]);
    expect(
      filterByMode(items, "Completed", "2026-09-19").map(
        (item) => item.data.id,
      ),
    ).toEqual([3, 1, 2]);
    expect(
      filterByTeam(items, 2).filter((item) => item.type === "bye"),
    ).toHaveLength(0);
  });
});
