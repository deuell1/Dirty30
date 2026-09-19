import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { clerkMiddleware } = vi.hoisted(() => ({
  clerkMiddleware: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware,
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

import app from "./app";

describe("API request boundary", () => {
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
});
