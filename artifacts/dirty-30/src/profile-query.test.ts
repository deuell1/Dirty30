import { QueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryOptions,
  setAuthTokenGetter,
} from "@workspace/api-client-react";
import { afterEach, describe, expect, it, vi } from "vitest";

const profile = {
  id: 1,
  firstName: "League",
  lastName: "Commissioner",
  phone: "+10000000000",
  role: "COMMISSIONER" as const,
  accessState: "ACTIVE" as const,
};

describe("current user profile query", () => {
  afterEach(() => {
    setAuthTokenGetter(null);
    vi.unstubAllGlobals();
  });

  it("resolves repeated fresh profile responses without remaining in flight", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(profile), {
          status: 200,
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Type": "application/json",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setAuthTokenGetter(async () => "test-session-token");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    const options = getGetCurrentUserQueryOptions();

    await expect(queryClient.fetchQuery(options)).resolves.toEqual(profile);
    await expect(queryClient.fetchQuery(options)).resolves.toEqual(profile);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryState(options.queryKey)).toMatchObject({
      status: "success",
      fetchStatus: "idle",
      data: profile,
    });
  });
});
