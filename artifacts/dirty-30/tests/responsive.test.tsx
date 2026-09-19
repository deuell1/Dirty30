import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import App from "../src/App";

// Mock external dependencies to allow rendering the shell
vi.mock("@clerk/react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user-1",
    getToken: vi.fn(),
  }),
  useClerk: () => ({ signOut: vi.fn() }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useLocation: () => ["/", vi.fn()],
  Route: ({ component: Component }: any) => null,
  Router: ({ children }: any) => <>{children}</>,
  Switch: ({ children }: any) => <>{children}</>,
}));

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual("@workspace/api-client-react");
  return {
    ...(actual as any),
    useGetCurrentUser: () => ({
      data: { id: 1, role: "COMMISSIONER", accessState: "ACTIVE" },
      isLoading: false,
    }),
    useHealthCheck: () => ({ data: { status: "ok" } }),
    useGetScoreReviewQueue: () => ({ data: [] }),
    useGetLeagueInitializationStatus: () => ({
      data: {
        requiresInitialization: false,
        hasActiveLeague: true,
        hasActiveSeason: true,
      },
      isLoading: false,
    }),
    useGetDashboard: () => ({ data: { role: "COMMISSIONER" } }),
    setAuthTokenGetter: vi.fn(),
  };
});

describe("Responsive Layout Contracts", () => {
  it("renders mobile bottom navigation with sm:hidden", () => {
    const html = renderToString(<App />);

    // Bottom nav should have sm:hidden to only show on mobile
    expect(html).toContain("sm:hidden");

    // Check that we have the bottom nav element
    expect(html).toMatch(/<nav[^>]*fixed[^>]*bottom-0[^>]*sm:hidden/);

    // Check that desktop nav is hidden on mobile
    expect(html).toMatch(/<nav[^>]*hidden[^>]*sm:flex/);
  });

  it("renders commissioner review button correctly for mobile and desktop", () => {
    const html = renderToString(<App />);

    // Desktop review link inside the desktop nav (should be present)
    expect(html).toMatch(/Review \((?:<!-- -->)?0(?:<!-- -->)?\)/);

    // Mobile review link in the header actions with sm:hidden
    expect(html).toMatch(/<a[^>]*href="\/review"[^>]*sm:hidden/);
  });

  it("applies content bottom padding to prevent overlap with bottom nav", () => {
    const html = renderToString(<App />);
    // Mobile content reserves the bottom bar plus device safe area.
    expect(html).toContain("pb-[calc(5rem+env(safe-area-inset-bottom))]");
    expect(html).toContain("sm:pb-0");
  });

  it("keeps standings readable as labeled mobile cards", () => {
    const source = readFileSync(
      new URL("../src/App.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('className="sm:hidden"');
    expect(source).toContain("Wins");
    expect(source).toContain("Losses");
    expect(source).toContain("Diff");
    expect(source).toContain("hidden grid-cols-[36px_1fr_repeat(3,auto)]");
  });

  it("stacks roster management actions on mobile", () => {
    const source = readFileSync(
      new URL("../src/components/beta-pages.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      'className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"',
    );
    expect(source).toContain("flex-1 min-h-[44px] px-2 text-xs sm:flex-none");
  });

  it("stacks matchup layouts before the small breakpoint", () => {
    const source = readFileSync(
      new URL("../src/components/beta-pages.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      "flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr]",
    );
    expect(source).toContain(
      "flex flex-col items-center gap-3 text-center sm:mt-7 sm:grid",
    );
    expect(source).toContain("break-words font-display text-xl font-bold");
  });
});
