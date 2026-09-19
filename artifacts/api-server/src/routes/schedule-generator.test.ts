import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "COMMISSIONER" as "COMMISSIONER" | "PLAYER" | "CAPTAIN",
  gameRows: [] as Record<string, unknown>[],
  auditRows: [] as Record<string, unknown>[],
  insertAttempts: 0,
  failAtInsert: 0,
  failAtUpdate: 0,
  failAtByeInsert: 0,
  failAtAuditInsert: 0,
  executeCalls: 0,
  ignoreExistingConflicts: false,
  teamCount: 4,
  byeRows: [] as Record<string, unknown>[],
  scheduleWeekRows: [] as Record<string, unknown>[],
  membershipRows: [] as Record<string, unknown>[],
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
    scheduleWeeks: actual.scheduleWeeks,
    teamByes: actual.teamByes,
    teamMemberships: actual.teamMemberships,
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
      ].slice(0, state.teamCount);
    if (table === state.tables.venues)
      return [{ id: 1, leagueId: 1, name: "Gym", active: true }];
    if (table === state.tables.courts)
      return [
        { id: 1, venueId: 1, name: "Court 1", active: true },
        { id: 2, venueId: 1, name: "Court 2", active: true },
        { id: 3, venueId: 1, name: "Court 3", active: true },
      ];
    if (table === state.tables.games) {
      if (fields && typeof fields === "object" && "game" in fields)
        return state.gameRows.map((game) => ({
          game,
          home: { id: game.homeTeamId, name: `Team ${game.homeTeamId}` },
          away: { id: game.awayTeamId, name: `Team ${game.awayTeamId}` },
          venue: { id: game.venueId, name: "Gym" },
          court: { id: game.courtId, name: `Court ${game.courtId}` },
        }));
      // The manual validator selects only { id } for conflict checks. Keep
      // generated rows out of this mock's conflict read; production sees
      // those rows transactionally and the generator itself already checks
      // generated reservations.
      if (fields && typeof fields === "object" && "id" in fields)
        return state.ignoreExistingConflicts
          ? []
          : state.gameRows.filter(
              (game) => Number(game.id) >= 90 && game.status !== "CANCELLED",
            );
      return state.gameRows;
    }
    if (table === state.tables.scheduleWeeks) {
      const weeks =
        state.scheduleWeekRows.length > 0 ? state.scheduleWeekRows : [];
      if (fields && typeof fields === "object" && "week" in fields)
        return weeks.map((week) => ({ week, seasonName: "Fall" }));
      return weeks;
    }
    if (table === state.tables.teamByes) {
      if (fields && typeof fields === "object" && "bye" in fields)
        return state.byeRows.map((bye) => ({
          bye,
          team: { id: bye.teamId, name: `Team ${bye.teamId}` },
        }));
      return state.byeRows;
    }
    if (table === state.tables.teamMemberships) return state.membershipRows;
    if (table === state.tables.auditEvents) return state.auditRows;
    return [];
  };
  const select = vi.fn((fields?: unknown) => ({
    from: (table: unknown) => {
      let resultRows = rowsFor(table, fields);
      const chain: Record<string, unknown> = {
        where: (predicate: unknown) => {
          if (table === state.tables.scheduleWeeks) {
            const dates: string[] = [];
            const visit = (value: unknown, seen = new Set<unknown>()) => {
              if (
                typeof value === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(value)
              )
                dates.push(value);
              else if (value && typeof value === "object" && !seen.has(value)) {
                seen.add(value);
                for (const child of Object.values(value)) visit(child, seen);
              }
            };
            visit(predicate);
            const target = dates[dates.length - 1];
            if (target)
              resultRows = resultRows.filter(
                (row) =>
                  String(row.startDate) <= target &&
                  String(row.endDate) >= target,
              );
          }
          return chain;
        },
        orderBy: () => chain,
        innerJoin: () => chain,
        limit: async (count: number) =>
          table === state.tables.teamByes &&
          !(fields && typeof fields === "object" && "id" in fields)
            ? []
            : resultRows.slice(0, count),
        then: (
          resolve: (value: unknown[]) => unknown,
          reject?: (error: unknown) => unknown,
        ) => Promise.resolve(resultRows).then(resolve, reject),
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
      if (table === state.tables.teamByes) {
        if (state.failAtByeInsert === state.byeRows.length + 1)
          throw new Error("injected bye failure");
        const bye = { id: state.byeRows.length + 1, ...values };
        return {
          then: (
            resolve: (value: undefined) => unknown,
            reject?: (error: unknown) => unknown,
          ) => {
            state.byeRows.push(bye);
            return Promise.resolve(undefined).then(resolve, reject);
          },
          returning: async () => {
            state.byeRows.push(bye);
            return [bye];
          },
        };
      }
      if (table === state.tables.scheduleWeeks) {
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              const exists = state.scheduleWeekRows.find(
                (week) =>
                  week.seasonId === values.seasonId &&
                  week.weekNumber === values.weekNumber,
              );
              if (exists) return [];
              const week = {
                id: state.scheduleWeekRows.length + 1,
                ...values,
              };
              state.scheduleWeekRows.push(week);
              return [week];
            },
          }),
          returning: async () => {
            const week = { id: state.scheduleWeekRows.length + 1, ...values };
            state.scheduleWeekRows.push(week);
            return [week];
          },
        };
      }
      if (state.failAtAuditInsert === state.auditRows.length + 1)
        throw new Error("injected audit failure");
      state.auditRows.push(values);
      return {
        then: (
          resolve: (value: undefined) => unknown,
          reject?: (error: unknown) => unknown,
        ) => Promise.resolve(undefined).then(resolve, reject),
      };
    },
  }));
  const update = vi.fn((table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if (table === state.tables.games) {
          state.insertAttempts += 0;
          if (state.failAtUpdate) throw new Error("injected update failure");
          const target =
            state.gameRows.find((game) => game.scheduleWeek == null) ??
            state.gameRows[0];
          if (target) {
            Object.assign(target, values);
            if (values.scheduleWeekId != null) {
              const week = state.scheduleWeekRows.find(
                (row) => row.id === values.scheduleWeekId,
              );
              if (week) target.scheduleWeek = week.weekNumber;
            }
            if (values.scheduleWeekId != null && target.scheduleWeek === 1)
              target.scheduleWeek = state.gameRows.indexOf(target) + 1;
          }
          return {
            returning: async () => (target ? [target] : []),
            then: (resolve: (value: unknown[]) => unknown) =>
              Promise.resolve([]).then(resolve),
          };
        }
        if (table === state.tables.scheduleWeeks) {
          const target =
            state.scheduleWeekRows.find(
              (week) =>
                week.playDate === values.playDate ||
                week.startDate === values.startDate,
            ) ?? state.scheduleWeekRows[0];
          if (target) Object.assign(target, values);
          return {
            returning: async () => (target ? [target] : []),
            then: (resolve: (value: unknown[]) => unknown) =>
              Promise.resolve([]).then(resolve),
          };
        }
        return {
          returning: async () => [],
          then: (resolve: (value: unknown[]) => unknown) =>
            Promise.resolve([]).then(resolve),
        };
      },
    }),
  }));
  const remove = vi.fn((table: unknown) => ({
    where: async () => {
      if (table === state.tables.teamByes) state.byeRows.pop();
      return [];
    },
  }));
  const transaction = vi.fn(async (operation: (tx: unknown) => unknown) => {
    const gamesBefore = structuredClone(state.gameRows);
    const byesBefore = structuredClone(state.byeRows);
    const weeksBefore = structuredClone(state.scheduleWeekRows);
    const auditsBefore = structuredClone(state.auditRows);
    try {
      return await operation({
        select,
        insert,
        update,
        delete: remove,
        execute: async () => {
          state.executeCalls += 1;
        },
      });
    } catch (error) {
      state.gameRows = gamesBefore;
      state.byeRows = byesBefore;
      state.scheduleWeekRows = weeksBefore;
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
      query: {
        leagues: {
          findFirst: async () => ({ id: 1, name: "Dirty 30", active: true }),
        },
        seasons: {
          findFirst: async () => ({
            id: 1,
            leagueId: 1,
            name: "Fall",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            active: true,
          }),
        },
      },
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
  courtIds: [1, 2, 3],
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

const reconciliationGames = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown>[] => [
  {
    id: 201,
    homeTeamId: 2,
    awayTeamId: 3,
    venueId: 1,
    courtId: 1,
    scheduledAt: new Date("2026-09-01T23:00:00.000Z"),
    scheduleWeek: null,
    status: "PUBLISHED",
    ...overrides,
  },
  {
    id: 202,
    homeTeamId: 1,
    awayTeamId: 3,
    venueId: 1,
    courtId: 1,
    scheduledAt: new Date("2026-09-08T23:00:00.000Z"),
    scheduleWeek: null,
    status: "PUBLISHED",
    ...overrides,
  },
  {
    id: 203,
    homeTeamId: 1,
    awayTeamId: 2,
    venueId: 1,
    courtId: 1,
    scheduledAt: new Date("2026-09-15T23:00:00.000Z"),
    scheduleWeek: null,
    status: "PUBLISHED",
    ...overrides,
  },
];

beforeEach(() => {
  state.role = "COMMISSIONER";
  state.gameRows = [];
  state.byeRows = [];
  state.scheduleWeekRows = [];
  state.teamCount = 4;
  state.auditRows = [];
  state.insertAttempts = 0;
  state.failAtInsert = 0;
  state.failAtUpdate = 0;
  state.failAtByeInsert = 0;
  state.failAtAuditInsert = 0;
  state.executeCalls = 0;
  state.ignoreExistingConflicts = false;
  state.membershipRows = [];
});

describe("schedule generator routes", () => {
  it("attaches aggregate members by canonical IDs, not compatibility week labels", async () => {
    state.scheduleWeekRows = [
      {
        id: 11,
        seasonId: 1,
        weekNumber: 1,
        playDate: "2026-09-01",
        startDate: "2026-08-31",
        endDate: "2026-09-06",
      },
      {
        id: 12,
        seasonId: 1,
        weekNumber: 2,
        playDate: "2026-09-08",
        startDate: "2026-09-07",
        endDate: "2026-09-13",
      },
    ];
    state.gameRows = [
      {
        id: 91,
        seasonId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        venueId: 1,
        courtId: 1,
        scheduledAt: new Date("2026-09-08T23:00:00Z"),
        scheduleWeekId: 12,
        scheduleWeek: 1,
        status: "PUBLISHED",
        homeScore: null,
        awayScore: null,
      },
    ];
    state.byeRows = [
      {
        id: 1,
        seasonId: 1,
        teamId: 3,
        scheduleWeekId: 12,
        scheduleWeek: 1,
        playDate: "2026-09-08",
        source: "MANUAL",
      },
    ];
    const response = await request(app).get("/schedule/weeks");
    expect(response.status).toBe(200);
    expect(response.body[0].games).toHaveLength(0);
    expect(response.body[0].byes).toHaveLength(0);
    expect(response.body[1].games[0].id).toBe(91);
    expect(response.body[1].byes[0].id).toBe(1);
  });

  it("hides draft-only canonical weeks from players while retaining published members", async () => {
    state.role = "PLAYER";
    state.scheduleWeekRows = [
      {
        id: 21,
        seasonId: 1,
        weekNumber: 1,
        playDate: "2026-09-01",
        startDate: "2026-08-31",
        endDate: "2026-09-06",
      },
      {
        id: 22,
        seasonId: 1,
        weekNumber: 2,
        playDate: "2026-09-08",
        startDate: "2026-09-07",
        endDate: "2026-09-13",
      },
    ];
    state.gameRows = [
      {
        id: 1,
        seasonId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        venueId: 1,
        courtId: 1,
        scheduledAt: new Date("2026-09-01T23:00:00Z"),
        scheduleWeekId: 21,
        scheduleWeek: 1,
        status: "DRAFT",
        homeScore: null,
        awayScore: null,
      },
      {
        id: 2,
        seasonId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        venueId: 1,
        courtId: 1,
        scheduledAt: new Date("2026-09-08T23:00:00Z"),
        scheduleWeekId: 22,
        scheduleWeek: 2,
        status: "PUBLISHED",
        homeScore: null,
        awayScore: null,
      },
    ];
    state.byeRows = [
      {
        id: 1,
        seasonId: 1,
        teamId: 3,
        scheduleWeekId: 21,
        scheduleWeek: 1,
        playDate: "2026-09-01",
        source: "GENERATED",
      },
      {
        id: 2,
        seasonId: 1,
        teamId: 3,
        scheduleWeekId: 22,
        scheduleWeek: 2,
        playDate: "2026-09-08",
        source: "GENERATED",
      },
    ];
    const response = await request(app).get("/schedule/weeks");
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: 22, weekNumber: 2 });
    expect(response.body[0].games).toHaveLength(1);
    expect(response.body[0].byes).toHaveLength(1);
  });

  it("rejects manual game creation when destination canonical week has a bye", async () => {
    state.scheduleWeekRows = [
      {
        id: 31,
        seasonId: 1,
        weekNumber: 1,
        playDate: "2026-09-01",
        startDate: "2026-08-31",
        endDate: "2026-09-06",
      },
    ];
    state.byeRows = [
      {
        id: 1,
        seasonId: 1,
        teamId: 1,
        scheduleWeekId: 31,
        scheduleWeek: 99,
        playDate: "2026-09-01",
        source: "MANUAL",
      },
    ];
    const response = await request(app).post("/schedule").send({
      homeTeamId: 1,
      awayTeamId: 2,
      venueId: 1,
      courtId: 1,
      scheduledAt: "2026-09-01T23:00:00.000Z",
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/bye/i);
    expect(state.gameRows).toHaveLength(0);
  });

  it("honors an explicit same-range scheduleWeekId on manual game creation", async () => {
    const weekOne = {
      id: 61,
      seasonId: 1,
      weekNumber: 1,
      playDate: "2026-09-01",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
    };
    const weekTwo = {
      id: 62,
      seasonId: 1,
      weekNumber: 2,
      playDate: "2026-09-02",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
    };
    state.scheduleWeekRows = [weekOne, weekTwo];
    const response = await request(app).post("/schedule").send({
      homeTeamId: 1,
      awayTeamId: 2,
      venueId: 1,
      courtId: 1,
      scheduledAt: "2026-09-02T23:00:00.000Z",
      scheduleWeekId: weekTwo.id,
    });
    expect(response.status).toBe(201);
    expect(state.gameRows[0]).toMatchObject({
      scheduleWeekId: weekTwo.id,
      scheduleWeek: weekTwo.weekNumber,
    });
    expect(state.scheduleWeekRows).toEqual([weekOne, weekTwo]);
  });

  it("preserves a same-range Week 2 link when editing without an explicit ID", async () => {
    const weekOne = {
      id: 71,
      seasonId: 1,
      weekNumber: 1,
      playDate: "2026-09-01",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
    };
    const weekTwo = {
      id: 72,
      seasonId: 1,
      weekNumber: 2,
      playDate: "2026-09-02",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
    };
    state.scheduleWeekRows = [weekOne, weekTwo];
    state.gameRows = [
      {
        id: 73,
        seasonId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        venueId: 1,
        courtId: 1,
        scheduledAt: new Date("2026-09-02T23:00:00Z"),
        scheduleWeekId: weekTwo.id,
        scheduleWeek: weekTwo.weekNumber,
        status: "PUBLISHED",
        homeScore: null,
        awayScore: null,
      },
    ];
    const response = await request(app).patch("/schedule/73").send({
      homeTeamId: 1,
      awayTeamId: 2,
      venueId: 1,
      courtId: 1,
      scheduledAt: "2026-09-02T23:00:00.000Z",
    });
    expect(response.status).toBe(200);
    expect(state.gameRows[0]).toMatchObject({
      scheduleWeekId: weekTwo.id,
      scheduleWeek: weekTwo.weekNumber,
    });
    expect(state.scheduleWeekRows).toEqual([weekOne, weekTwo]);
  });

  it("moves an editable game to the existing destination canonical week", async () => {
    const source = {
      id: 41,
      seasonId: 1,
      weekNumber: 1,
      playDate: "2026-09-01",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
    };
    const destination = {
      id: 42,
      seasonId: 1,
      weekNumber: 2,
      playDate: "2026-09-08",
      startDate: "2026-09-07",
      endDate: "2026-09-13",
    };
    state.scheduleWeekRows = [source, destination];
    state.gameRows = [
      {
        id: 1,
        seasonId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        venueId: 1,
        courtId: 1,
        scheduledAt: new Date("2026-09-01T23:00:00Z"),
        scheduleWeekId: source.id,
        scheduleWeek: source.weekNumber,
        status: "PUBLISHED",
        homeScore: null,
        awayScore: null,
      },
    ];
    const response = await request(app).patch("/schedule/91").send({
      homeTeamId: 1,
      awayTeamId: 2,
      venueId: 1,
      courtId: 1,
      scheduleWeekId: destination.id,
      scheduledAt: "2026-09-08T23:00:00.000Z",
    });
    expect(response.status).toBe(200);
    expect(state.gameRows[0]).toMatchObject({
      scheduleWeekId: destination.id,
      scheduleWeek: destination.weekNumber,
    });
    expect(state.scheduleWeekRows).toEqual([source, destination]);
    expect(state.scheduleWeekRows).toHaveLength(2);
    expect(source).toMatchObject({
      startDate: "2026-08-31",
      endDate: "2026-09-06",
      playDate: "2026-09-01",
    });
  });

  it("rejects an editable game move when the destination canonical week has a bye", async () => {
    state.scheduleWeekRows = [
      {
        id: 51,
        seasonId: 1,
        weekNumber: 1,
        playDate: "2026-09-01",
        startDate: "2026-08-31",
        endDate: "2026-09-06",
      },
      {
        id: 52,
        seasonId: 1,
        weekNumber: 2,
        playDate: "2026-09-08",
        startDate: "2026-09-07",
        endDate: "2026-09-13",
      },
    ];
    state.gameRows = [
      {
        id: 92,
        seasonId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        venueId: 1,
        courtId: 1,
        scheduledAt: new Date("2026-09-01T23:00:00Z"),
        scheduleWeekId: 51,
        scheduleWeek: 1,
        status: "PUBLISHED",
        homeScore: null,
        awayScore: null,
      },
    ];
    state.byeRows = [
      {
        id: 1,
        seasonId: 1,
        teamId: 1,
        scheduleWeekId: 52,
        scheduleWeek: 2,
        playDate: "2026-09-08",
        source: "MANUAL",
      },
    ];
    const response = await request(app).patch("/schedule/92").send({
      homeTeamId: 1,
      awayTeamId: 2,
      venueId: 1,
      courtId: 1,
      scheduleWeekId: 52,
      scheduledAt: "2026-09-08T23:00:00.000Z",
    });
    expect(response.status).toBe(409);
    expect(state.gameRows[0]).toMatchObject({
      scheduleWeekId: 51,
      scheduleWeek: 1,
    });
  });

  it("previews reconciliation without writes and infers every odd-team week", async () => {
    state.teamCount = 3;
    state.gameRows = reconciliationGames();
    const before = structuredClone(state.gameRows);
    const response = await request(app).post(
      "/schedule/byes/reconcile/preview",
    );
    expect(response.status).toBe(200);
    expect(response.body.canCommit).toBe(true);
    expect(response.body.detectedFormat).toBe("SINGLE");
    expect(response.body.weeks).toHaveLength(3);
    expect(
      response.body.weeks.every(
        (week: { blockers: unknown[] }) => week.blockers.length === 0,
      ),
    ).toBe(true);
    expect(
      response.body.weeks.flatMap((week: { byes: unknown[] }) => week.byes),
    ).toHaveLength(3);
    expect(state.gameRows).toEqual(before);
    expect(state.byeRows).toHaveLength(0);
    expect(state.auditRows).toHaveLength(0);
  });

  it("blocks reconciliation for mixed, missing, and extra matchups", async () => {
    state.teamCount = 3;
    state.gameRows = [
      ...reconciliationGames(),
      {
        id: 204,
        homeTeamId: 1,
        awayTeamId: 99,
        venueId: 1,
        courtId: 1,
        scheduledAt: new Date("2026-09-15T23:00:00.000Z"),
        status: "PUBLISHED",
      },
    ];
    const preview = await request(app).post("/schedule/byes/reconcile/preview");
    expect(preview.status).toBe(200);
    expect(preview.body.detectedFormat).toBeNull();
    expect(preview.body.canCommit).toBe(false);
    const commit = await request(app)
      .post("/schedule/byes/reconcile/commit")
      .send({ previewHash: preview.body.previewHash, confirm: true });
    expect(commit.status).toBe(409);
    expect(state.gameRows).toHaveLength(4);
    expect(state.byeRows).toHaveLength(0);
    expect(state.auditRows).toHaveLength(0);
  });

  it("reconciles only nullable schedule weeks and preserves game metadata", async () => {
    state.teamCount = 3;
    state.gameRows = reconciliationGames().map((game, index) => ({
      ...game,
      scheduleWeek: null,
      homeScore: index + 7,
      awayScore: index + 3,
      submittedByUserId: 88,
      submittedAt: new Date("2026-10-01T00:00:00.000Z"),
      confirmedAt: new Date("2026-10-02T00:00:00.000Z"),
      disputeReason: "reviewed",
    }));
    const before = structuredClone(state.gameRows);
    const preview = await request(app).post("/schedule/byes/reconcile/preview");
    const commit = await request(app)
      .post("/schedule/byes/reconcile/commit")
      .send({ previewHash: preview.body.previewHash, confirm: true });
    expect(commit.status).toBe(200);
    expect(commit.body).toMatchObject({ updatedGames: 3, createdByes: 3 });
    for (let index = 0; index < state.gameRows.length; index += 1) {
      const prior = before[index];
      const current = state.gameRows[index];
      expect(current).toMatchObject({
        id: prior.id,
        scheduledAt: prior.scheduledAt,
        homeTeamId: prior.homeTeamId,
        awayTeamId: prior.awayTeamId,
        venueId: prior.venueId,
        courtId: prior.courtId,
        status: prior.status,
        homeScore: prior.homeScore,
        awayScore: prior.awayScore,
        submittedByUserId: prior.submittedByUserId,
        submittedAt: prior.submittedAt,
        confirmedAt: prior.confirmedAt,
        disputeReason: prior.disputeReason,
      });
      expect(current.scheduleWeek).toBe(index + 1);
    }
  });

  it("rejects stale reconciliation and makes an identical commit a no-op", async () => {
    state.teamCount = 3;
    state.gameRows = reconciliationGames();
    const preview = await request(app).post("/schedule/byes/reconcile/preview");
    state.gameRows[0]!.scheduledAt = new Date("2026-11-01T23:00:00.000Z");
    const stale = await request(app)
      .post("/schedule/byes/reconcile/commit")
      .send({ previewHash: preview.body.previewHash, confirm: true });
    expect(stale.status).toBe(409);
    expect(state.byeRows).toHaveLength(0);
    expect(state.auditRows).toHaveLength(0);

    state.gameRows[0]!.scheduledAt = new Date("2026-09-01T23:00:00.000Z");
    const fresh = await request(app).post("/schedule/byes/reconcile/preview");
    const first = await request(app)
      .post("/schedule/byes/reconcile/commit")
      .send({ previewHash: fresh.body.previewHash, confirm: true });
    expect(first.status).toBe(200);
    const retry = await request(app)
      .post("/schedule/byes/reconcile/commit")
      .send({ previewHash: fresh.body.previewHash, confirm: true });
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ updatedGames: 0, createdByes: 0, noOp: true });
  });

  it("shows only the viewer team's bye and hides generated drafts until published", async () => {
    state.role = "PLAYER";
    state.membershipRows = [
      {
        userId: 41,
        teamId: 1,
        teamName: "Team 1",
        membershipRole: "PLAYER",
        active: true,
      },
    ];
    state.scheduleWeekRows = [
      {
        id: 62,
        seasonId: 1,
        weekNumber: 2,
        playDate: "2026-09-08",
        startDate: "2026-09-07",
        endDate: "2026-09-13",
      },
      {
        id: 63,
        seasonId: 1,
        weekNumber: 3,
        playDate: "2026-09-15",
        startDate: "2026-09-14",
        endDate: "2026-09-20",
      },
    ];
    state.byeRows = [
      {
        id: 1,
        seasonId: 1,
        teamId: 1,
        scheduleWeekId: 62,
        scheduleWeek: 2,
        playDate: "2026-09-08",
        source: "GENERATED",
      },
      {
        id: 2,
        seasonId: 1,
        teamId: 2,
        scheduleWeekId: 63,
        scheduleWeek: 3,
        playDate: "2026-09-15",
        source: "GENERATED",
      },
    ];
    const hidden = await request(app).get("/dashboard");
    expect(hidden.status).toBe(200);
    expect(hidden.body.nextBye).toBeNull();
    expect(hidden.body.myTeams).toEqual([
      {
        teamId: 1,
        teamName: "Team 1",
        membershipRole: "PLAYER",
      },
    ]);
    state.gameRows.push({
      id: 301,
      homeTeamId: 2,
      awayTeamId: 3,
      venueId: 1,
      courtId: 1,
      scheduledAt: new Date("2026-09-08T23:00:00.000Z"),
      scheduleWeekId: 62,
      scheduleWeek: 2,
      status: "PUBLISHED",
    });
    const visible = await request(app).get("/dashboard");
    expect(visible.status).toBe(200);
    expect(visible.body.nextBye).toMatchObject({
      teamId: 1,
      source: "GENERATED",
    });
  });

  it("keeps standings byte-for-byte unchanged when bye rows are added", async () => {
    const before = await request(app).get("/standings");
    expect(before.status).toBe(200);
    state.byeRows.push({
      id: 7,
      seasonId: 1,
      teamId: 1,
      scheduleWeek: 1,
      playDate: "2026-09-01",
      source: "GENERATED",
    });
    const after = await request(app).get("/standings");
    expect(after.status).toBe(200);
    expect(after.text).toBe(before.text);
  });

  it.each([
    ["game-week update", "update"],
    ["bye insertion", "bye"],
    ["audit insertion", "audit"],
  ] as const)(
    "rolls back reconciliation on injected %s failure",
    async (_label, failure) => {
      state.teamCount = 3;
      state.gameRows = reconciliationGames();
      const preview = await request(app).post(
        "/schedule/byes/reconcile/preview",
      );
      const originalGames = structuredClone(state.gameRows);
      if (failure === "update") state.failAtUpdate = 1;
      if (failure === "bye") state.failAtByeInsert = 1;
      if (failure === "audit") state.failAtAuditInsert = 1;
      const response = await request(app)
        .post("/schedule/byes/reconcile/commit")
        .send({ previewHash: preview.body.previewHash, confirm: true });
      expect(response.status).toBe(500);
      expect(state.gameRows).toEqual(originalGames);
      expect(state.byeRows).toHaveLength(0);
      expect(state.auditRows).toHaveLength(0);
    },
  );
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

  it("persists generated byes separately for an odd-team season", async () => {
    state.teamCount = 3;
    const { payload, preview } = await payloadWithPreview({
      weekdays: [2, 3, 4, 5, 6],
    });
    expect(preview.body.byes).toHaveLength(3);
    const response = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(response.status).toBe(201);
    expect(state.gameRows).toHaveLength(3);
    expect(state.byeRows).toHaveLength(3);
    expect(state.byeRows.every((bye) => bye.source === "GENERATED")).toBe(true);
    expect(state.byeRows.every((bye) => Number(bye.scheduleWeek) > 0)).toBe(
      true,
    );
    expect(state.scheduleWeekRows).toHaveLength(3);
    expect(new Set(state.scheduleWeekRows.map((week) => week.id)).size).toBe(3);
    expect(
      new Set(state.scheduleWeekRows.map((week) => week.startDate)).size,
    ).toBe(1);
    expect(
      new Set(state.gameRows.map((game) => game.scheduleWeekId)).size,
    ).toBe(3);
    expect(new Set(state.byeRows.map((bye) => bye.scheduleWeekId)).size).toBe(
      3,
    );
  });

  it("does not duplicate generated byes when an odd-team commit is retried", async () => {
    state.teamCount = 3;
    const { payload } = await payloadWithPreview({
      weekdays: [2, 3, 4, 5, 6],
    });
    const first = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(first.status).toBe(201);
    const retry = await request(app)
      .post("/schedule/generator/commit")
      .send(payload);
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ createdCount: 0, noOp: true });
    expect(state.gameRows).toHaveLength(3);
    expect(state.byeRows).toHaveLength(3);
  });

  it("rejects a manual bye when an active game occupies that week", async () => {
    state.gameRows.push({
      id: 90,
      seasonId: 1,
      homeTeamId: 1,
      awayTeamId: 2,
      scheduleWeek: 2,
      status: "PUBLISHED",
    });
    const response = await request(app)
      .post("/schedule/byes")
      .send({ teamId: 1, scheduleWeek: 2, playDate: "2026-09-08" });
    expect(response.status).toBe(409);
    expect(state.byeRows).toHaveLength(0);
  });

  it("allows a manual bye when the only game in that week is cancelled", async () => {
    state.gameRows.push({
      id: 90,
      seasonId: 1,
      homeTeamId: 1,
      awayTeamId: 2,
      scheduleWeek: 2,
      status: "CANCELLED",
    });
    const response = await request(app)
      .post("/schedule/byes")
      .send({ teamId: 1, scheduleWeek: 2, playDate: "2026-09-08" });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      teamId: 1,
      scheduleWeek: 2,
      source: "MANUAL",
    });
    expect(state.byeRows).toHaveLength(1);
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
