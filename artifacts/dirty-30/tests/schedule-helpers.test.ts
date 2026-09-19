import { describe, expect, it } from "vitest";
import type { Dashboard, Game, TeamBye } from "@workspace/api-client-react";
import {
  buildScheduleWeeks,
  filterByDate,
  filterByMode,
  filterByTeam,
  inferUserTeamId,
  mergeScheduleData,
  selectCurrentScheduleWeek,
  startOfCalendarWeek,
  type ScheduleMode,
} from "../src/components/schedule-helpers";

const game = (values: Partial<Game>): Game =>
  ({
    id: 1,
    scheduleWeek: 1,
    date: "2026-09-12",
    startTime: "18:00",
    status: "SCHEDULED",
    published: true,
    homeTeamId: 1,
    awayTeamId: 2,
    ...values,
  }) as Game;

const bye = (values: Partial<TeamBye>): TeamBye =>
  ({
    id: 1,
    scheduleWeek: 1,
    playDate: "2026-09-12",
    teamId: 3,
    teamName: "Bye Team",
    source: "GENERATED",
    ...values,
  }) as TeamBye;

describe("schedule week helpers", () => {
  it("uses only the membership-scoped bye signal for My Team", () => {
    expect(inferUserTeamId(undefined)).toBeUndefined();
    expect(
      inferUserTeamId({
        role: "PLAYER",
        nextBye: { teamId: 9 } as TeamBye,
      } as Dashboard),
    ).toBe(9);
    expect(
      inferUserTeamId({
        role: "PLAYER",
        nextBye: null,
        nextGame: { homeTeamId: 1, awayTeamId: 2 },
        recentResults: [{ homeTeamId: 1, awayTeamId: 2 }],
      } as Dashboard),
    ).toBeUndefined();
  });

  it("groups persisted schedule weeks across multiple dates", () => {
    const groups = buildScheduleWeeks(
      mergeScheduleData(
        [
          game({ id: 1, scheduleWeek: 4, date: "2026-10-02" }),
          game({ id: 2, scheduleWeek: 4, date: "2026-10-04" }),
        ],
        [bye({ id: 3, scheduleWeek: 4, playDate: "2026-10-03" })],
      ),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "week:4",
      label: "Week 4",
      startDate: "2026-10-02",
      endDate: "2026-10-04",
      dates: ["2026-10-02", "2026-10-03", "2026-10-04"],
    });
    expect(groups[0].items.map((item) => item.data.id)).toEqual([1, 3, 2]);
  });

  it("derives deterministic calendar groups for legacy games without mutation", () => {
    const legacyGames = [
      game({ id: 1, scheduleWeek: null, date: "2026-09-15" }),
      game({ id: 2, scheduleWeek: null, date: "2026-09-20" }),
      game({ id: 3, scheduleWeek: null, date: "2026-09-21" }),
    ];
    const before = structuredClone(legacyGames);
    const groups = buildScheduleWeeks(mergeScheduleData(legacyGames, []));
    expect(startOfCalendarWeek("2026-09-15")).toBe("2026-09-14");
    expect(groups.map((group) => group.key)).toEqual([
      "legacy:2026-09-14",
      "legacy:2026-09-21",
    ]);
    expect(legacyGames).toEqual(before);
  });

  it("selects the containing league week or nearest upcoming week", () => {
    const groups = buildScheduleWeeks(
      mergeScheduleData(
        [
          game({ id: 1, scheduleWeek: 1, date: "2026-09-12" }),
          game({ id: 2, scheduleWeek: 2, date: "2026-09-26" }),
          game({ id: 3, scheduleWeek: 3, date: "2026-10-10" }),
        ],
        [],
      ),
    );
    expect(selectCurrentScheduleWeek(groups, "2026-09-12")).toBe("week:1");
    expect(selectCurrentScheduleWeek(groups, "2026-09-19")).toBe("week:2");
    expect(selectCurrentScheduleWeek(groups, "2026-12-01")).toBe("week:3");
  });

  it("applies team and date filters in every schedule mode", () => {
    const items = mergeScheduleData(
      [
        game({ id: 1, date: "2026-09-18", homeTeamId: 1, awayTeamId: 2 }),
        game({
          id: 2,
          date: "2026-09-20",
          homeTeamId: 2,
          awayTeamId: 3,
          status: "FINAL",
        }),
      ],
      [bye({ id: 3, playDate: "2026-09-18", teamId: 1 })],
    );
    const modes: ScheduleMode[] = ["Week", "Upcoming", "Completed", "All"];
    for (const mode of modes) {
      const modeItems = filterByMode(items, mode, "2026-09-19");
      const combined = filterByDate(filterByTeam(modeItems, 1), "2026-09-18");
      if (mode === "Completed") expect(combined).toHaveLength(2);
      else if (mode === "Upcoming") expect(combined).toHaveLength(0);
      else expect(combined.map((item) => item.data.id)).toEqual([3, 1]);
    }
    expect(filterByTeam(items, 1).some((item) => item.type === "bye")).toBe(
      true,
    );
    expect(filterByTeam(items, 2).some((item) => item.type === "bye")).toBe(
      false,
    );
  });
});
