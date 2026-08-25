import { describe, expect, it, vi } from "vitest";

const { getAuth, getUser } = vi.hoisted(() => ({ getAuth: vi.fn(), getUser: vi.fn() }));

vi.mock("@clerk/express", () => ({ getAuth, clerkClient: { users: { getUser } } }));
vi.mock("@workspace/db", () => ({ db: { query: { users: { findFirst: vi.fn() } } }, users: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { resolveCurrentUser } from "./auth";

function response() {
  const res = { locals: {}, status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("Clerk identity gate with isolated database mocks", () => {
  it("rejects a request without a Clerk identity before database access", async () => {
    getAuth.mockReturnValue({ userId: null });
    const res = response();
    await resolveCurrentUser({} as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("rejects a Clerk user without a verified primary phone before database access", async () => {
    getAuth.mockReturnValue({ userId: "clerk_unverified" });
    getUser.mockResolvedValue({ phoneNumbers: [], primaryPhoneNumberId: null });
    const res = response();
    await resolveCurrentUser({} as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "A verified primary phone number is required" });
  });
});