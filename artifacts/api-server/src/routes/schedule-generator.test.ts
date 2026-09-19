import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "COMMISSIONER" as "COMMISSIONER" | "PLAYER" | "CAPTAIN",
  gameRows: [] as Record<string, unknown>[],
  auditRows: [] as Record<string, unknown>[],
  insertAttempts: 0,
  failAtInsert: 0,
  executeCalls: 0,
  ignoreExistingConflicts: false,
  tables: {} as Record<string, unknown>,
}));

vi.mock("../middlewares/auth", () => ({
  resolveCurrentUser: (
    _req: unknown,
    res: { locals: Record<string, unknown> },
    next: () => void,
  ) => {
    res.locals.currentUser = {
      id: 41,
      role: state.role,
      active: true,
      accessState: "ACTIVE",
    };
    next();
  },
  currentUser: (
    _req: unknown,
    res: { locals: { currentUser: { id: number; role: string } } },
  ) => res.locals.currentUser,
  requireActiveUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCommissioner: (
    _req: unknown,
    res: {
      locals: { currentUser?: { role: string } };
      status: (code: number) => { json: (body: unknown) => void };
    },
    next: () => void,
  ) => {
    if (res.locals.currentUser?.role !== "COMMISSIONER")
      return res.status(403).json({ error: "Commissioner access required" });
    next();
  },
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  state.tables = {
    leagues: actual.leagues,
    seasons: actual.seasons,
    teams: actual.teams,
    venues: actual.venues,
    courts: actual.courts,
    games: actual.games,
    auditEvents: actual.auditEvents,
  };
  const rowsFor = (table: unknown, fields?: unknown) => {
    if (table === state.tables.leagues)
      return [{ id: 1, name: "Dirty 30", active: true }];
    if (table === state.tables.seasons)
      return [
        {
          id: 1,
          leagueId: 1,
          name: "Fall",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          active: true,
        },
      ];
    if (table === state.tables.teams)
      return [
        { id: 1, name: "One", seasonId: 1, active: true },
        { id: 2, name: "Two", seasonId: 1, active: true },
        { id: 3, name: "Three", seasonId: 1, active: true },
        { id: 4, name: "Four", seasonId: 1, active: true },
      ];
    if (table === state.tables.venues)
      return [{ id: 1, leagueId: 1, name: "Gym", active: true }];
    if (table === state.tables.courts)
      return [{ id: 1, venueId: 1, name: "Court 1", active: true }];
    if (table === state.tables.games) {
      // The manual validator selects only { id } for conflict checks. Keep
      // generated rows out of this mock's conflict read; production sees
      // those rows transactionally and the generator itself already checks
      // generated reservations.
      if (fields && typeof fields === "object" && "id" in fields)
        return state.ignoreExistingConflicts
          ? []
          : state.gameRows.filter((game) => Number(game.id) >= 90);
      return state.gameRows;
    }
    if (table === state.tables.auditEvents) return state.auditRows;
    return [];
  };
  const select = vi.fn((fields?: unknown) => ({
    from: (table: unknown) => {
      const rows = rowsFor(table, fields);
      const chain: Record<string, unknown> = {
        where: () => chain,
        orderBy: () => chain,
        limit: async (count: number) => rows.slice(0, count),
        then: (
          resolve: (value: unknown[]) => unknown,
          reject?: (error: unknown) => unknown,
        ) => Promise.resolve(rows).then(resolve, reject),
      };
      return chain;
    },
  }));
  const insert = vi.fn((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      if (table === state.tables.games) {
        return {
          returning: async () => {
            state.insertAttempts += 1;
            if (state.failAtInsert === state.insertAttempts)
              throw new Error("injected insert failure");
            const game = {
              id: state.gameRows.length + 1,
              ...values,
              status: values.status ?? "DRAFT",
            };
            state.gameRows.push(game);
            return [game];
          },
        };
      }
      state.auditRows.push(values);
      return {
        then: (
          resolve: (value: undefined) => unknown,
          reject?: (error: unknown) => unknown,
        ) => Promise.resolve(undefined).then(resolve, reject),
      };
    },
  }));
  const transaction = vi.fn(async (operation: (tx: unknown) => unknown) => {
    const gamesBefore = [...state.gameRows];
    const auditsBefore = [...state.auditRows];
    try {
      return await operation({
        select,
        insert,
        execute: async () => {
          state.executeCalls += 1;
        },
      });
    } catch (error) {
      state.gameRows = gamesBefore;
      state.auditRows = auditsBefore;
      throw error;
    }
  });
  return {
    ...actual,
    db: {
      select,
      insert,
      transaction,
      query: {},
    },
  };
});

import router from "./league";

const app = express();
app.use(express.json());
app.use(router);
app.use(
  (
    error: { status?: number; message?: string },
    _req: unknown,
    res: { status: (status: number) => { json: (body: unknown) => void } },
    _next: unknown,
  ) => res.status(error.status ?? 500).json({ error: error.message }),
);

const body = (overrides: Record<string, unknown> = {}) => ({
  format: "SINGLE",
  venueId: 1,
  courtIds: [1],
  firstPlayDate: "2026-09-01",
  weekdays: [2],
  timeSlots: ["18:00"],
  maxMatchesPerTeamPerDate: 1,
  confirm: true,
  previewHash: "a".repeat(64),
  ...overrides,
});

const payloadWithPreview = async (overrides: Record<string, unknown> = {}) => {
  const payload = body(overrides);
  const preview = await request(app)
    .post("/schedule/generator/preview")
    .send(payload);
  expect(preview.status).toBe(200);
  return {
    payload: { ...payload, previewHash: preview.body.previewHash },
    preview,
  };
};

beforeEach(() => {
  state.role = "COMMISSIONER";
  state.gameRows = [];
  state.auditRows = [];
  state.insertAttempts = 0;
  state.failAtInsert = 0;
  state.executeCalls = 0;
  state.ignoreExistingConflicts = false;
});

describe("schedule generator routes", () => {
  it("previews without writing", async () => {
    const response = await request(app)
      .post("/schedule/generator/preview")
      .send(body({ weekdays: [2, 3, 4, 5, 6] }));
    expect(response.status).toBe(200);
    expect(response.body.totalMatches).toBe(6);
    expect(typeof response.body.playDatesUsed[0]).toBe("string");
    expect(response.body.playDatesUsed[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(response.body.games[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state.gameRows).toHaveLength(0);
    expect(state.auditRows).toHaveLength(0);
  });

  it("commits every generated game as a draft and unpublished", async () => {
    const { payload } = await payloadWithPreview({ weekdays: [2, 3, 4, 5, 6] });
    const response = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(response.status).toBe(201);
    expect(response.body.createdCount).toBe(6);
    expect(state.gameRows).toHaveLength(6);
    expect(state.gameRows.every((game) => game.status === "DRAFT")).toBe(true);
    expect(state.gameRows.every((game) => !("published" in game))).toBe(true);
    expect(state.auditRows).toHaveLength(1);
    expect(state.executeCalls).toBe(1);
  });

  it("rejects a changed preview hash without writing", async () => {
    const { payload } = await payloadWithPreview({ weekdays: [2, 3, 4, 5, 6] });
    const response = await request(app)
      .post("/schedule/generator/commit")
      .send({ ...payload, timeSlots: ["19:00"] });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe(
      "Schedule changed since preview; preview again",
    );
    expect(state.gameRows).toHaveLength(0);
    expect(state.auditRows).toHaveLength(0);
  });

  it("revalidates conflicts through the manual game validator", async () => {
    state.gameRows.push({
      id: 99,
      seasonId: 1,
      homeTeamId: 1,
      awayTeamId: 3,
      venueId: 1,
      courtId: 1,
      scheduledAt: new Date("2026-09-01T23:00:00.000Z"),
      status: "PUBLISHED",
    });
    const { payload } = await payloadWithPreview({ weekdays: [2, 3, 4, 5, 6] });
    const response = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(response.status).toBe(409);
    expect(state.gameRows).toHaveLength(1);
  });

  it("commits the same constrained plan that preview shifted around", async () => {
    state.gameRows.push({
      id: 99,
      seasonId: 1,
      homeTeamId: 3,
      awayTeamId: 4,
      venueId: 1,
      courtId: 1,
      scheduledAt: new Date("2026-09-01T23:00:00.000Z"),
      status: "PUBLISHED",
    });
    const { payload, preview } = await payloadWithPreview({
      weekdays: [2, 3, 4, 5, 6],
    });
    expect(
      preview.body.games.some(
        (game: { date: string }) => game.date !== "2026-09-01",
      ),
    ).toBe(true);
    state.ignoreExistingConflicts = true;
    const commit = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(commit.status).toBe(201);
    expect(state.gameRows).toHaveLength(preview.body.games.length + 1);
    expect(
      state.gameRows
        .filter((game) => Number(game.id) !== 99)
        .every((game) => game.status === "DRAFT"),
    ).toBe(true);
  });

  it("rolls back the complete batch when an insert fails", async () => {
    state.failAtInsert = 2;
    const { payload } = await payloadWithPreview({ weekdays: [2, 3, 4, 5, 6] });
    const response = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(response.status).toBe(500);
    expect(state.gameRows).toHaveLength(0);
    expect(state.auditRows).toHaveLength(0);
  });

  it("returns a no-op for an identical retry", async () => {
    const { payload } = await payloadWithPreview({ weekdays: [2, 3, 4, 5, 6] });
    expect(
      (await request(app).post("/schedule/generator/commit").send(payload))
        .status,
    ).toBe(201);
    const retry = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ createdCount: 0, noOp: true });
    expect(state.gameRows).toHaveLength(6);
  });

  it("recognizes an audit batch after games are published or edited", async () => {
    const { payload } = await payloadWithPreview({ weekdays: [2, 3, 4, 5, 6] });
    const first = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(first.status).toBe(201);
    for (const game of state.gameRows) {
      game.status = "PUBLISHED";
      game.scheduledAt = new Date("2026-12-20T23:00:00.000Z");
    }
    const retry = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ createdCount: 0, noOp: true });
    expect(state.gameRows).toHaveLength(6);
  });

  it("reports capacity errors and performs no writes", async () => {
    const response = await request(app)
      .post("/schedule/generator/commit")
      .send(
        body({
          firstPlayDate: "2026-12-31",
          weekdays: [4],
        }),
      );
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Insufficient schedule capacity/);
    expect(state.gameRows).toHaveLength(0);
  });

  it("rejects duplicate court identifiers explicitly", async () => {
    const response = await request(app)
      .post("/schedule/generator/preview")
      .send(body({ courtIds: [1, 1] }));
    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Selected courts must be unique");
  });

  it("returns 422 for malformed generator input", async () => {
    const response = await request(app)
      .post("/schedule/generator/preview")
      .send({ format: "SINGLE" });
    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/venueId|courtIds/);
    expect(state.gameRows).toHaveLength(0);
  });
});
