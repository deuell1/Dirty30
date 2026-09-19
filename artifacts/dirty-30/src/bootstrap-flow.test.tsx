import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryOptions,
  getGetLeagueInitializationStatusQueryOptions,
  setAuthTokenGetter,
} from "@workspace/api-client-react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapQueryOptions } from "./bootstrap-query";
import {
  LeagueInitializationScreen,
  shouldShowLeagueInitialization,
} from "./components/league-initialization";

const profile = {
  id: 1,
  firstName: "League",
  lastName: "Commissioner",
  phone: "+10000000000",
  role: "COMMISSIONER" as const,
  accessState: "ACTIVE" as const,
};

const initialization = {
  requiresInitialization: true,
  hasActiveLeague: false,
  hasActiveSeason: false,
  leagueName: null,
};

describe("league access bootstrap", () => {
  afterEach(() => {
    setAuthTokenGetter(null);
    vi.unstubAllGlobals();
  });

  it("exits loading and shows Start your league after successful bootstrap responses", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.endsWith("/api/me") ? profile : initialization;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    setAuthTokenGetter(async () => "test-session-token");

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: bootstrapQueryOptions,
      },
    });
    const profileOptions = getGetCurrentUserQueryOptions();
    const initializationOptions =
      getGetLeagueInitializationStatusQueryOptions();

    const resolvedProfile = await queryClient.fetchQuery(profileOptions);
    const resolvedInitialization = await queryClient.fetchQuery(
      initializationOptions,
    );
    await queryClient.fetchQuery(profileOptions);
    await queryClient.fetchQuery(initializationOptions);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryState(profileOptions.queryKey)).toMatchObject({
      status: "success",
      fetchStatus: "idle",
    });
    expect(
      queryClient.getQueryState(initializationOptions.queryKey),
    ).toMatchObject({
      status: "success",
      fetchStatus: "idle",
    });
    expect(
      shouldShowLeagueInitialization(
        resolvedProfile.role,
        resolvedProfile.accessState,
        resolvedInitialization,
      ),
    ).toBe(true);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <LeagueInitializationScreen status={resolvedInitialization} />
      </QueryClientProvider>,
    );

    expect(html).toContain("Start your league");
    expect(html).not.toContain("Checking your league access");
    expect(html).not.toContain("Checking league setup");
  });
});
