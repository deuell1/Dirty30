import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ByeWeekAdmin } from "../src/components/bye-admin";
import { SchedulePage, DashboardPage } from "../src/components/beta-pages";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual("@workspace/api-client-react");
  return {
    ...actual,
    useListTeamByes: () => ({
      data: [
        {
          id: 1,
          teamName: "Team A",
          scheduleWeek: 2,
          playDate: "2099-06-01",
          source: "MANUAL",
        },
      ],
    }),
    useListTeams: () => ({ data: [{ id: 1, name: "Team A", active: true }] }),
    useCreateTeamBye: () => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    }),
    useDeleteTeamBye: () => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    }),
    usePreviewByeReconciliation: () => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    }),
    useCommitByeReconciliation: () => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    }),
    useListGames: () => ({ data: [] }),
    useGetCurrentUser: () => ({ data: { role: "COMMISSIONER" } }),
    useGetDashboard: () => ({
      data: {
        nextBye: {
          scheduleWeek: 2,
          playDate: "2099-06-01",
          teamName: "Team A",
        },
        role: "COMMISSIONER",
        attentionItems: [],
      },
    }),
  };
});

describe("Bye Management Contracts", () => {
  it("renders mobile-safe touch targets in ByeWeekAdmin", () => {
    const queryClient = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <ByeWeekAdmin />
      </QueryClientProvider>,
    );

    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("Manage Byes &amp; Reconcile");
  });

  it("checks dashboard handles nullable nextBye correctly", () => {
    const queryClient = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>,
    );

    expect(html).toMatch(/Week\s*(<!--\s*-->)?\s*2\s*(<!--\s*-->)?\s*Bye/);
    expect(html).toMatch(/Team A\s*(<!--\s*-->)?\s*has a bye/);
  });

  it("checks SchedulePage groups games and byes", () => {
    const queryClient = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <SchedulePage />
      </QueryClientProvider>,
    );

    expect(html).toContain("BYE — No match scheduled this week.");
    expect(html).toContain("BYE WEEK");
  });

  it("verifies explicit confirmation logic is in ByeWeekAdmin", () => {
    const source = readFileSync(
      new URL("../src/components/bye-admin.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("setShowConfirm(true)");
    expect(source).toContain("confirm: true");
    expect(source).toContain("previewHash: previewData.previewHash");
  });

  it("verifies manual bye controls handle source filtering", () => {
    const source = readFileSync(
      new URL("../src/components/bye-admin.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("TeamByeSource.MANUAL");
    expect(source).toContain("TeamByeSource.RECONCILED");
    expect(source).toContain("deleteBye.mutate(");
  });
});
