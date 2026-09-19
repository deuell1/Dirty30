import { describe, expect, it, vi } from "vitest";
import {
  clearInvitationPath,
  invitationResumePath,
  pendingSurface,
  preservedInvitationPath,
  rememberInvitationPath,
  refreshAfterInvitationAcceptance,
} from "./invitation-flow";

describe("closed-beta invitation access flow", () => {
  function storage() {
    const values = new Map<string, string>();
    return {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };
  }

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

  it("preserves an invitation through signup and login redirects", () => {
    const browserStorage = storage();
    rememberInvitationPath(browserStorage, "/invite/captain-token");

    expect(invitationResumePath("/dashboard", browserStorage)).toBe(
      "/invite/captain-token",
    );
    expect(preservedInvitationPath(browserStorage)).toBe(
      "/invite/captain-token",
    );
    expect(browserStorage.removeItem).not.toHaveBeenCalled();
  });

  it("survives repeated dashboard redirects until acceptance completes", () => {
    const browserStorage = storage();
    rememberInvitationPath(browserStorage, "/invite/existing-user-token");

    expect(invitationResumePath("/dashboard", browserStorage)).toBe(
      "/invite/existing-user-token",
    );
    expect(
      invitationResumePath("/invite/existing-user-token", browserStorage),
    ).toBeNull();
    expect(invitationResumePath("/dashboard", browserStorage)).toBe(
      "/invite/existing-user-token",
    );

    clearInvitationPath(browserStorage);
    expect(invitationResumePath("/dashboard", browserStorage)).toBeNull();
  });

  it("uses normal pending dashboard behavior when no invite is preserved", () => {
    const browserStorage = storage();
    expect(invitationResumePath("/dashboard", browserStorage)).toBeNull();
    expect(pendingSurface("/dashboard", "PENDING", null)).toBe("waiting");
  });

  it("does not show waiting while a valid invite can be resumed", () => {
    expect(
      pendingSurface("/dashboard", "PENDING", "/invite/captain-token"),
    ).toBe("invitation");
    expect(pendingSurface("/dashboard", "PENDING", "javascript:alert(1)")).toBe(
      "waiting",
    );
  });
});
