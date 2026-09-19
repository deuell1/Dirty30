import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, clerkMiddleware } = vi.hoisted(() => ({
  authState: { authenticated: false },
  clerkMiddleware: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware,
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

vi.mock("./middlewares/auth", () => ({
  resolveCurrentUser: (
    _req: unknown,
    res: {
      status: (status: number) => {
        json: (body: unknown) => unknown;
      };
      locals: Record<string, unknown>;
    },
    next: () => void,
  ) => {
    if (!authState.authenticated) {
      return res.status(401).json({ error: "Authentication required" });
    }
    res.locals.currentUser = {
      id: 1,
      email: null,
      firstName: "League",
      lastName: "Commissioner",
      phone: "+10000000000",
      role: "COMMISSIONER",
      accessState: "ACTIVE",
      active: true,
    };
    return next();
  },
  currentUser: (_req: unknown, res: { locals: { currentUser: unknown } }) =>
    res.locals.currentUser,
  requireActiveUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCommissioner: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}));

import app from "./app";

describe("API request boundary", () => {
  beforeEach(() => {
    authState.authenticated = false;
  });

  it("reports health without requiring a Clerk session", async () => {
    const response = await request(app).get("/api/healthz");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("installs standard Clerk authentication middleware without proxy configuration", () => {
    expect(clerkMiddleware).toHaveBeenCalledOnce();
    expect(clerkMiddleware).toHaveBeenCalledWith();
  });

  it("does not expose the obsolete Clerk frontend API proxy route", async () => {
    const response = await request(app).get("/api/__clerk/v1/environment");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });

  it("rejects an unauthenticated protected request", async () => {
    const response = await request(app).get("/api/me");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });

  it("returns fresh JSON for repeated authenticated profile requests", async () => {
    authState.authenticated = true;

    const first = await request(app).get("/api/me");
    expect(first.status).toBe(200);
    expect(first.headers.etag).toBeUndefined();
    expect(first.headers["cache-control"]).toBe("private, no-store");
    expect(first.body).toMatchObject({
      role: "COMMISSIONER",
      accessState: "ACTIVE",
    });

    const repeated = await request(app)
      .get("/api/me")
      .set("If-None-Match", "*");
    expect(repeated.status).toBe(200);
    expect(repeated.headers.etag).toBeUndefined();
    expect(repeated.body).toEqual(first.body);
  });
});
