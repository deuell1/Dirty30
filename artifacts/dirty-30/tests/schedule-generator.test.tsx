import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ScheduleGenerator } from "../src/components/schedule-generator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual("@workspace/api-client-react");
  return {
    ...actual,
    useListVenues: () => ({ data: [{ id: 1, name: "Venue A", active: true }] }),
    useListTeams: () => ({
      data: [
        { id: 1, name: "Team A", active: true },
        { id: 2, name: "Team B", active: true },
      ],
    }),
    useListCourts: () => ({ data: [{ id: 1, name: "Court 1", active: true }] }),
    usePreviewScheduleGenerator: () => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    }),
    useCommitScheduleGenerator: () => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    }),
  };
});

describe("Schedule Generator Layout Contracts", () => {
  it("renders expected mobile-safe minimum touch targets", () => {
    const queryClient = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <ScheduleGenerator />
      </QueryClientProvider>,
    );

    // Should include min-h-[44px] for buttons
    expect(html).toContain("min-h-[44px]");
  });

  it("includes correct format fields from schema", () => {
    const source = readFileSync(
      new URL("../src/components/schedule-generator.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("ScheduleGeneratorInputFormat.SINGLE");
    expect(source).toContain("ScheduleGeneratorInputFormat.DOUBLE");
    expect(source).toContain(
      "ScheduleGeneratorInputMaxMatchesPerTeamPerDate.NUMBER_1",
    );
  });

  it("contains context string for active teams", () => {
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <ScheduleGenerator />
      </QueryClientProvider>,
    );
    expect(html).toContain("Team A, Team B");
  });

  it("forces match names to wrap without overflow", () => {
    const source = readFileSync(
      new URL("../src/components/schedule-generator.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("break-words");
    expect(source).toContain("whitespace-normal");
  });

  it("clears preview and invalidates stale previews on state changes via useEffect", () => {
    const source = readFileSync(
      new URL("../src/components/schedule-generator.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("previewRequestId.current += 1");
    expect(source).toContain("setPreviewData(null)");
    expect(source).toContain("setShowConfirm(false)");
    expect(source).toContain("setCommitResult(null)");
    expect(source).toContain(
      "const currentRequestId = ++previewRequestId.current",
    );
    expect(source).toContain(
      "if (previewRequestId.current === currentRequestId)",
    );
  });

  it("passes previewHash during commit", () => {
    const source = readFileSync(
      new URL("../src/components/schedule-generator.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/previewHash:\s*previewData.previewHash/);
  });
});
