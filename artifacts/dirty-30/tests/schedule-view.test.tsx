import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Game, Team } from "@workspace/api-client-react";
import {
  persistWeekSelection,
  ScheduleView,
  statusCounts,
} from "../src/components/schedule-view";
import {
  buildScheduleWeeks,
  mergeScheduleData,
} from "../src/components/schedule-helpers";
import { isSchedulingLocked } from "../src/components/commissioner-game-editor";

vi.mock("wouter", () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const teams = [
  { id: 1, name: "Team A", active: true },
  { id: 2, name: "Team B", active: true },
] as Team[];

const games = [
  {
    id: 1,
    scheduleWeek: 7,
    date: "2099-01-03",
    startTime: "18:00",
    status: "SCHEDULED",
    published: false,
    homeTeamId: 1,
    awayTeamId: 2,
    homeTeam: "Team A",
    awayTeam: "Team B",
    venue: "League Gym",
    court: "Court 1",
  },
  {
    id: 2,
    scheduleWeek: 8,
    date: "2099-01-10",
    startTime: "19:00",
    status: "FINAL",
    published: true,
    homeTeamId: 2,
    awayTeamId: 1,
    homeTeam: "Team B",
    awayTeam: "Team A",
    homeScore: 21,
    awayScore: 18,
    venue: "League Gym",
    court: "Court 2",
  },
] as Game[];

describe("ScheduleView", () => {
  it("opens in the nearest upcoming league week with week navigation and filters", () => {
    const html = renderToString(
      <ScheduleView
        games={games}
        byes={[]}
        teams={teams}
        commissioner={false}
      />,
    );
    expect(html).toContain("Week 7");
    expect(html).toContain('aria-label="Previous league week"');
    expect(html).toContain('aria-label="Next league week"');
    expect(html).toContain("Current Week / Today");
    expect(html).toContain('aria-label="Filter schedule by team"');
    expect(html).toContain('aria-label="Filter schedule by date"');
    expect(html).toContain("All Dates This Week");
  });

  it("shows commissioner week controls and event edits only to commissioners", () => {
    const commissionerHtml = renderToString(
      <ScheduleView games={games} byes={[]} teams={teams} commissioner />,
    );
    const playerHtml = renderToString(
      <ScheduleView
        games={games}
        byes={[]}
        teams={teams}
        commissioner={false}
      />,
    );
    expect(commissionerHtml).toContain("Commissioner week tools");
    expect(commissionerHtml).toContain("Add game");
    expect(commissionerHtml).toContain("Generator &amp; byes");
    expect(commissionerHtml).toContain("Edit");
    expect(playerHtml).not.toContain("Commissioner week tools");
    expect(playerHtml).not.toContain(">Edit<");
  });

  it("keeps finalized scheduling fields locked while scheduled games remain editable", () => {
    expect(isSchedulingLocked({ status: "FINAL" } as Game)).toBe(true);
    expect(isSchedulingLocked({ status: "DISPUTED" } as Game)).toBe(true);
    expect(isSchedulingLocked({ status: "PENDING_CONFIRMATION" } as Game)).toBe(
      true,
    );
    expect(isSchedulingLocked({ status: "SCHEDULED" } as Game)).toBe(false);
    expect(isSchedulingLocked()).toBe(false);
  });

  it("preserves a stored week while schedule queries are still loading", () => {
    const storage = { setItem: vi.fn(), removeItem: vi.fn() };
    persistWeekSelection(storage, null, false);
    expect(storage.removeItem).not.toHaveBeenCalled();
    persistWeekSelection(storage, null, true);
    expect(storage.removeItem).toHaveBeenCalledWith("schedule-week-key");
    persistWeekSelection(storage, "week:8", true);
    expect(storage.setItem).toHaveBeenCalledWith("schedule-week-key", "week:8");
  });

  it("reports commissioner status counts for the selected week", () => {
    const group = buildScheduleWeeks(mergeScheduleData(games, []))[0];
    expect(statusCounts(group)).toEqual({
      draft: 1,
      published: 0,
      pending: 0,
      disputed: 0,
      final: 0,
    });
  });

  it("renders mobile-safe controls without starting any fetch loop", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const html = renderToString(
      <ScheduleView
        games={games}
        byes={[]}
        teams={teams}
        commissioner={false}
      />,
    );
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("min-w-0");
    expect(html).toContain("break-words");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
