import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "PLAYER" as "PLAYER" | "CAPTAIN" | "COMMISSIONER", accessState: "ACTIVE" as "PENDING" | "ACTIVE" }));

vi.mock("../middlewares/auth", () => ({
  resolveCurrentUser: (_req: unknown, res: { locals: Record<string, unknown> }, next: () => void) => {
    res.locals.currentUser = { id: 41, role: state.role, active: true, accessState: state.accessState };
    next();
  },
  currentUser: (_req: unknown, res: { locals: { currentUser: { id: number; role: string } } }) => res.locals.currentUser,
  requireActiveUser: (_req: unknown, res: { locals: { currentUser?: { accessState: string } }; status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    if (res.locals.currentUser?.accessState !== "ACTIVE") return res.status(403).json({ error: "An active league invitation is required" });
    next();
  },
  requireCommissioner: (_req: unknown, res: { locals: { currentUser?: { role: string } }; status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    if (res.locals.currentUser?.role !== "COMMISSIONER") return res.status(403).json({ error: "Commissioner access required" });
    next();
  },
}));

vi.mock("@workspace/db", () => ({
  auditEvents: {}, courts: {}, games: {}, leagues: {}, playerInvitations: {}, seasons: {}, teamMemberships: {}, teams: {}, users: {},
  db: {},
}));

import router from "./league";

const app = express();
app.use(express.json());
app.use(router);

describe("league route authorization boundary", () => {
  beforeEach(() => { state.role = "PLAYER"; state.accessState = "ACTIVE"; });

  it.each([
    ["creates teams", "post", "/teams", { name: "Amber" }],
    ["reads the commissioner review queue", "get", "/scores/review", undefined],
    ["creates a schedule", "post", "/schedule", { homeTeamId: 1, awayTeamId: 2, venueId: 1, courtId: 1, scheduledAt: "2026-08-25T19:00:00.000Z" }],
    ["edits a venue", "patch", "/venues/1", { name: "New venue" }],
    ["enters an official score", "patch", "/scores/1", { homeScore: 5, awayScore: 4 }],
  ] as const)("rejects a player before database work when the player %s", async (_label, method, path, body) => {
    const response = body === undefined ? await request(app)[method](path) : await request(app)[method](path).send(body);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Commissioner access required" });
  });

  it.each(["/teams", "/schedule", "/standings"])("blocks a pending user from enumerating %s", async (path) => {
    state.accessState = "PENDING";
    const response = await request(app).get(path);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "An active league invitation is required" });
  });
});