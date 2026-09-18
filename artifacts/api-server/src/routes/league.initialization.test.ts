import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activeLeague: undefined as
    { id: number; name: string; active: boolean } | undefined,
  activeSeason: undefined as
    | {
        id: number;
        leagueId: number;
        name: string;
        startDate: string;
        endDate: string;
        active: boolean;
      }
    | undefined,
  insertCount: 0,
  insertedValues: [] as Record<string, unknown>[],
  execute: vi.fn(),
}));

vi.mock("../middlewares/auth", () => ({
  resolveCurrentUser: (
    _req: unknown,
    res: { locals: Record<string, unknown> },
    next: () => void,
  ) => {
    res.locals.currentUser = {
      id: 41,
      role: "COMMISSIONER",
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
  requireCommissioner: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  const query = {
    leagues: {
      findFirst: vi.fn(async () => state.activeLeague),
    },
    seasons: {
      findFirst: vi.fn(async () => state.activeSeason),
    },
  };
  const transaction = vi.fn(
    async (
      operation: (tx: {
        query: typeof query;
        execute: typeof state.execute;
        insert: () => {
          values: (values: Record<string, unknown>) => {
            returning: () => Promise<Record<string, unknown>[]>;
          };
        };
      }) => Promise<unknown>,
    ) =>
      operation({
        query,
        execute: state.execute,
        insert: () => ({
          values: (values) => ({
            returning: async () => {
              state.insertedValues.push(values);
              state.insertCount += 1;
              if (state.insertCount === 1) {
                state.activeLeague = {
                  id: 1,
                  name: String(values.name),
                  active: true,
                };
                return [state.activeLeague];
              }
              state.activeSeason = {
                id: 1,
                leagueId: Number(values.leagueId),
                name: String(values.name),
                startDate: String(values.startDate),
                endDate: String(values.endDate),
                active: true,
              };
              return [state.activeSeason];
            },
          }),
        }),
      }),
  );
  return {
    ...actual,
    db: { query, transaction },
  };
});

import router from "./league";

const app = express();
app.use(express.json());
app.use(router);

const input = {
  leagueName: "Dirty 30",
  seasonName: "Fall 2026",
  startDate: "2026-09-01",
  endDate: "2026-12-01",
};

describe("league initialization", () => {
  beforeEach(() => {
    state.activeLeague = undefined;
    state.activeSeason = undefined;
    state.insertCount = 0;
    state.insertedValues = [];
    state.execute.mockReset();
  });

  it("reports that an empty database requires initialization", async () => {
    const response = await request(app).get("/league-initialization");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      requiresInitialization: true,
      hasActiveLeague: false,
      hasActiveSeason: false,
      leagueName: null,
    });
  });

  it("creates only an active league and its first active season", async () => {
    const response = await request(app)
      .post("/league-initialization")
      .send(input);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      leagueId: 1,
      seasonId: 1,
      leagueName: "Dirty 30",
      seasonName: "Fall 2026",
    });
    expect(state.execute).toHaveBeenCalledOnce();
    expect(state.insertedValues).toEqual([
      { name: "Dirty 30", active: true },
      {
        leagueId: 1,
        name: "Fall 2026",
        startDate: "2026-09-01",
        endDate: "2026-12-01",
        active: true,
      },
    ]);
  });

  it("rejects duplicate initialization after the first request wins", async () => {
    expect(
      (await request(app).post("/league-initialization").send(input)).status,
    ).toBe(201);
    const duplicate = await request(app)
      .post("/league-initialization")
      .send(input);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({
      error: "An active league and season already exist",
    });
    expect(state.insertCount).toBe(2);
  });

  it("bypasses initialization when an active league and season exist", async () => {
    state.activeLeague = { id: 7, name: "Dirty 30", active: true };
    state.activeSeason = {
      id: 9,
      leagueId: 7,
      name: "Fall 2026",
      startDate: "2026-09-01",
      endDate: "2026-12-01",
      active: true,
    };
    const response = await request(app).get("/league-initialization");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      requiresInitialization: false,
      hasActiveLeague: true,
      hasActiveSeason: true,
      leagueName: "Dirty 30",
    });
  });
});
