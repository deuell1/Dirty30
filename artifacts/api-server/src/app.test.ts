import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
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

  it("rejects an unauthenticated protected request", async () => {
    const response = await request(app).get("/api/me");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });
});