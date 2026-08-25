import { describe, expect, it } from "vitest";
import { scheduleFormForEdit } from "./schedule-form";

describe("schedule edit form", () => {
  it("preserves the existing venue and court identifiers", () => {
    const form = scheduleFormForEdit({ homeTeamId: 1, awayTeamId: 2, venueId: 9, courtId: 14, date: "2026-08-25", startTime: "7:30 PM" }, () => "19:30");
    expect(form.venueId).toBe("9");
    expect(form.courtId).toBe("14");
    expect(form.scheduledAt).toBe("2026-08-25T19:30");
  });
});