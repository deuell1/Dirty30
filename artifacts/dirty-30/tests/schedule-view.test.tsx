import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  getBestMonth,
  isDateInCurrentWeek,
  persistSelectedMonth,
  ScheduleView,
} from "../src/components/schedule-view";

vi.mock("wouter", () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe("ScheduleView", () => {
  it("selects a segment-appropriate default month", () => {
    expect(getBestMonth(["2026-08", "2026-10"], "Upcoming", "2026-09")).toBe(
      "2026-10",
    );
    expect(getBestMonth(["2026-08", "2026-10"], "Completed", "2026-09")).toBe(
      "2026-08",
    );
    expect(getBestMonth(["2026-09"], "All", "2026-09")).toBe("2026-09");
    expect(isDateInCurrentWeek("2026-09-19", "2026-09-19")).toBe(true);
    expect(isDateInCurrentWeek("2026-09-21", "2026-09-19")).toBe(false);
  });

  it("removes a stale persisted month when filters reset", () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    persistSelectedMonth(storage, "2026-10");
    expect(storage.setItem).toHaveBeenCalledWith("schedule-month", "2026-10");

    persistSelectedMonth(storage, null);
    expect(storage.removeItem).toHaveBeenCalledWith("schedule-month");
  });
  it("renders contextual empty states", () => {
    const html = renderToString(
      <ScheduleView
        games={[]}
        byes={[]}
        teams={[]}
        dashboard={undefined}
        commissioner={false}
      />,
    );

    // Empty state should be visible
    expect(html).toContain("No upcoming items found");
    expect(html).toContain("No upcoming matches scheduled in");
  });

  it("renders mobile-safe touch targets (min-h-[44px])", () => {
    const html = renderToString(
      <ScheduleView
        games={[]}
        byes={[]}
        teams={[]}
        dashboard={undefined}
        commissioner={false}
      />,
    );

    expect(html).toContain("min-h-[44px]");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Filter schedule by team"');
    expect(html).toContain('aria-label="Jump to Today / This Week"');
  });

  it("renders commissioner drafts with explicit badge", () => {
    const html = renderToString(
      <ScheduleView
        games={[
          {
            id: 1,
            scheduleWeek: 1,
            date: "2099-01-01",
            startTime: "12:00",
            status: "SCHEDULED",
            published: false,
            homeTeam: "Team A",
            awayTeam: "Team B",
            venue: "Gym",
            court: "1",
          } as any,
        ]}
        byes={[]}
        teams={[]}
        dashboard={undefined}
        commissioner={true}
      />,
    );

    expect(html).toContain("DRAFT");
    expect(html).toContain("break-words");
  });
});
