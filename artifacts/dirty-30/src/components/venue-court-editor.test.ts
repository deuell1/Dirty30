import { describe, expect, it } from "vitest";
import { courtUpdatePayload, venueUpdatePayload } from "./venue-court-editor";

describe("commissioner venue and court mutation payloads", () => {
  it("preserves the venue identifier while submitting edited name and address", () => {
    expect(venueUpdatePayload({ id: 7, name: "  River Court  ", address: "  100 Main St  " })).toEqual({
      venueId: 7, data: { name: "River Court", address: "100 Main St" },
    });
  });

  it("preserves the court identifier while submitting an edited court name", () => {
    expect(courtUpdatePayload({ id: 14, name: "  Court B " })).toEqual({ courtId: 14, data: { name: "Court B" } });
  });
});