import { describe, expect, it, vi } from "vitest";
import {
  pendingSurface,
  refreshAfterInvitationAcceptance,
} from "./invitation-flow";

describe("closed-beta invitation access flow", () => {
  it("lets a pending signed-in user render only the invitation surface", () => {
    expect(pendingSurface("/invite/abc", "PENDING")).toBe("invitation");
    expect(pendingSurface("/teams", "PENDING")).toBe("waiting");
    expect(pendingSurface("/schedule", "PENDING")).toBe("waiting");
    expect(pendingSurface("/standings", "PENDING")).toBe("waiting");
    expect(pendingSurface("/dashboard", "PENDING")).toBe("waiting");
  });

  it("refetches /me before allowing team navigation", async () => {
    const data = { id: 7, accessState: "ACTIVE" as const };
    const client = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      refetchQueries: vi.fn().mockResolvedValue(undefined),
      getQueryData: vi.fn().mockReturnValue(data),
    };
    const refreshed = await refreshAfterInvitationAcceptance(client, {
      currentUser: ["me"],
      teams: ["teams"],
      team: ["team", 4],
      roster: ["roster", 4],
    });
    expect(client.refetchQueries).toHaveBeenCalledWith({ queryKey: ["me"] });
    expect(refreshed?.accessState).toBe("ACTIVE");
  });
});
