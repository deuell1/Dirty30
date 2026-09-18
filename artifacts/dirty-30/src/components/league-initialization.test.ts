import { describe, expect, it } from "vitest";
import { shouldShowLeagueInitialization } from "./league-initialization";

const emptyStatus = {
  requiresInitialization: true,
  hasActiveLeague: false,
  hasActiveSeason: false,
  leagueName: null,
};

describe("commissioner league initialization gate", () => {
  it("shows initialization only to an active commissioner when setup is missing", () => {
    expect(
      shouldShowLeagueInitialization("COMMISSIONER", "ACTIVE", emptyStatus),
    ).toBe(true);
    expect(
      shouldShowLeagueInitialization("PLAYER", "ACTIVE", emptyStatus),
    ).toBe(false);
    expect(
      shouldShowLeagueInitialization("COMMISSIONER", "PENDING", emptyStatus),
    ).toBe(false);
  });

  it("bypasses initialization when the league and season already exist", () => {
    expect(
      shouldShowLeagueInitialization("COMMISSIONER", "ACTIVE", {
        requiresInitialization: false,
        hasActiveLeague: true,
        hasActiveSeason: true,
        leagueName: "Dirty 30",
      }),
    ).toBe(false);
  });
});
