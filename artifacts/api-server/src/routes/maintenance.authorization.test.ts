import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as {
    id: number;
    role: string;
    accessState: string;
    phone: string;
  } | null,
  auth: "ok" as "ok" | "unauthenticated",
  execute: vi.fn(),
}));

type MockResponse = {
  locals: Record<string, unknown>;
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
};

vi.mock("../middlewares/auth", () => ({
  resolveCurrentUser: (_req: unknown, res: MockResponse, next: () => void) => {
    if (state.auth === "unauthenticated") {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.locals.currentUser = state.user;
    next();
  },
  currentUser: (_req: unknown, res: { locals: { currentUser: unknown } }) =>
    res.locals.currentUser,
  requireActiveUser: (_req: unknown, res: MockResponse, next: () => void) => {
    const user = res.locals.currentUser as { accessState: string } | undefined;
    if (user?.accessState !== "ACTIVE") {
      res
        .status(403)
        .json({ error: "An active league invitation is required" });
      return;
    }
    next();
  },
  requireCommissioner: (_req: unknown, res: MockResponse, next: () => void) => {
    const user = res.locals.currentUser as { role: string } | undefined;
    if (user?.role !== "COMMISSIONER") {
      res.status(403).json({ error: "Commissioner access required" });
      return;
    }
    next();
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    transaction: vi.fn(async (operation: (tx: unknown) => unknown) =>
      operation({ execute: vi.fn() }),
    ),
  },
}));

vi.mock("../services/seedCleanup", () => ({
  SEED_CONFIRMATION: "DELETE DIRTY30 SEED DATA",
  isBootstrapCommissioner: (user: {
    role: string;
    accessState: string;
    phone: string;
  }) =>
    user.role === "COMMISSIONER" &&
    user.accessState === "ACTIVE" &&
    user.phone === "+12025550100",
  getSeedCleanupStatus: vi.fn(async () => ({
    safeToExecute: true,
    idempotent: false,
    counts: {
      seedUsers: 15,
      nonSeedUsers: 1,
      leagues: 1,
      seasons: 1,
      teams: 4,
      memberships: 14,
      games: 10,
      invitations: 1,
      venues: 1,
      courts: 2,
      auditEvents: 0,
      nonSeedMembersOnSeededTeams: 0,
      nonSeedUsersToDelete: 0,
    },
    discrepancies: [],
    blockers: [],
    initialization: {
      requiresInitialization: false,
      hasActiveLeague: true,
      hasActiveSeason: true,
      leagueName: "Dirty 30 Beer League",
    },
  })),
  executeSeedCleanup: state.execute,
}));

import router from "./maintenance";

const app = express();
app.use(express.json());
app.use(router);

describe("seed cleanup authorization", () => {
  const previous = process.env.BOOTSTRAP_COMMISSIONER_PHONE;

  beforeEach(() => {
    process.env.BOOTSTRAP_COMMISSIONER_PHONE = "+12025550100";
    state.auth = "ok";
    state.user = {
      id: 1,
      role: "COMMISSIONER",
      accessState: "ACTIVE",
      phone: "+12025550100",
    };
    state.execute.mockReset();
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.BOOTSTRAP_COMMISSIONER_PHONE;
    else process.env.BOOTSTRAP_COMMISSIONER_PHONE = previous;
  });

  it("rejects an unauthenticated request", async () => {
    state.auth = "unauthenticated";
    expect((await request(app).get("/maintenance/seed-cleanup")).status).toBe(
      401,
    );
  });

  it("rejects a pending user", async () => {
    state.user!.accessState = "PENDING";
    expect((await request(app).get("/maintenance/seed-cleanup")).status).toBe(
      403,
    );
  });

  it("rejects an active non-bootstrap commissioner", async () => {
    state.user!.phone = "+12025550101";
    expect((await request(app).get("/maintenance/seed-cleanup")).status).toBe(
      403,
    );
  });

  it("allows the bootstrap commissioner to dry run", async () => {
    expect((await request(app).get("/maintenance/seed-cleanup")).status).toBe(
      200,
    );
  });

  it("rejects an inexact destructive confirmation", async () => {
    const response = await request(app)
      .post("/maintenance/seed-cleanup")
      .send({ confirmation: "DELETE DIRTY30 SEED" });
    expect(response.status).toBe(400);
    expect(state.execute).not.toHaveBeenCalled();
  });
});
