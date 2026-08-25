import { describe, expect, it, vi } from "vitest";

const { getAuth, getUser, findUser, insertReturning } = vi.hoisted(() => ({ getAuth: vi.fn(), getUser: vi.fn(), findUser: vi.fn(), insertReturning: vi.fn() }));

vi.mock("@clerk/express", () => ({ getAuth, clerkClient: { users: { getUser } } }));
vi.mock("@workspace/db", () => ({ db: { query: { users: { findFirst: findUser } }, insert: () => ({ values: () => ({ returning: insertReturning }) }) }, users: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { resolveCurrentUser } from "./auth";

function response() {
  const res: { locals: { currentUser?: unknown }; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = { locals: {}, status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("Clerk identity gate with isolated database mocks", () => {
  const verifiedClerkUser = (phoneNumber: string) => ({ phoneNumbers: [{ id: "phone_1", phoneNumber, verification: { status: "verified" } }], primaryPhoneNumberId: "phone_1", emailAddresses: [], primaryEmailAddressId: null, firstName: "Taylor", lastName: "Player" });
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

  it("creates an arbitrary verified phone as pending access", async () => {
    getAuth.mockReturnValue({ userId: "clerk_pending" });
    getUser.mockResolvedValue(verifiedClerkUser("+1 202 555 0199"));
    findUser.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    insertReturning.mockResolvedValueOnce([{ id: 9, externalAuthId: "clerk_pending", phone: "+12025550199", role: "PLAYER", accessState: "PENDING", active: true }]);
    const next = vi.fn();
    const res = response();
    await resolveCurrentUser({} as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.locals.currentUser).toMatchObject({ role: "PLAYER", accessState: "PENDING" });
  });

  it("creates the verified bootstrap phone as an active commissioner", async () => {
    const original = process.env.BOOTSTRAP_COMMISSIONER_PHONE;
    process.env.BOOTSTRAP_COMMISSIONER_PHONE = "+12025550100";
    getAuth.mockReturnValue({ userId: "clerk_commissioner" });
    getUser.mockResolvedValue(verifiedClerkUser("+1 202 555 0100"));
    findUser.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    insertReturning.mockResolvedValueOnce([{ id: 1, externalAuthId: "clerk_commissioner", phone: "+12025550100", role: "COMMISSIONER", accessState: "ACTIVE", active: true }]);
    const next = vi.fn();
    const res = response();
    await resolveCurrentUser({} as never, res as never, next);
    expect(res.locals.currentUser).toMatchObject({ role: "COMMISSIONER", accessState: "ACTIVE" });
    process.env.BOOTSTRAP_COMMISSIONER_PHONE = original;
  });
});