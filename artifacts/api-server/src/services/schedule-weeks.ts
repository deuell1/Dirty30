import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import { scheduleWeeks, type ScheduleWeek } from "@workspace/db";

const ZONE = "America/Chicago";
const iso = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: ZONE });

/** Return the Monday-Sunday Chicago calendar range containing a local date. */
export function chicagoWeekRange(value: Date | string) {
  const local = typeof value === "string" ? value : iso(value);
  const [year, month, day] = local.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (utc.getUTCDay() + 6) % 7;
  const start = new Date(utc);
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const date = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: date(start), endDate: date(end), playDate: local };
}

/**
 * Find or atomically create the canonical week for a season/date. The caller
 * should hold the schedule mutation advisory lock when writing.
 */
export async function ensureScheduleWeek(
  database: any,
  seasonId: number,
  value: Date | string,
  requestedNumber?: number | null,
): Promise<ScheduleWeek> {
  const range = chicagoWeekRange(value);
  if (requestedNumber !== null && requestedNumber !== undefined) {
    const numbered = (
      await database
        .select()
        .from(scheduleWeeks)
        .where(eq(scheduleWeeks.seasonId, seasonId))
    ).find((week: ScheduleWeek) => week.weekNumber === requestedNumber);
    if (numbered) {
      if (
        numbered.startDate <= range.playDate &&
        numbered.endDate >= range.playDate
      )
        return numbered;
      throw Object.assign(
        new Error(
          `Schedule week ${requestedNumber} does not contain the selected date`,
        ),
        { status: 409 },
      );
    }
    const [created] = await database
      .insert(scheduleWeeks)
      .values({ seasonId, weekNumber: requestedNumber, ...range })
      .onConflictDoNothing({
        target: [scheduleWeeks.seasonId, scheduleWeeks.weekNumber],
      })
      .returning();
    if (created) return created;
    const winner = (
      await database
        .select()
        .from(scheduleWeeks)
        .where(eq(scheduleWeeks.seasonId, seasonId))
    ).find((week: ScheduleWeek) => week.weekNumber === requestedNumber);
    if (!winner) throw new Error("Unable to create canonical schedule week");
    return winner;
  }
  const predicates = [
    eq(scheduleWeeks.seasonId, seasonId),
    lte(scheduleWeeks.startDate, range.playDate),
    gt(sql`${scheduleWeeks.endDate} + 1`, range.playDate),
  ];
  const existing = await database
    .select()
    .from(scheduleWeeks)
    .where(and(...predicates))
    .orderBy(asc(scheduleWeeks.id))
    .limit(2);
  if (existing.length > 1)
    throw Object.assign(
      new Error("Multiple schedule weeks contain the selected date"),
      { status: 409 },
    );
  if (existing[0]) return existing[0];

  const [numberRow] = await database
    .select({ max: sql<number>`coalesce(max(${scheduleWeeks.weekNumber}), 0)` })
    .from(scheduleWeeks)
    .where(eq(scheduleWeeks.seasonId, seasonId));
  const weekNumber = requestedNumber ?? Number(numberRow?.max ?? 0) + 1;
  const [created] = await database
    .insert(scheduleWeeks)
    .values({ seasonId, weekNumber, ...range })
    .onConflictDoNothing({
      target: [scheduleWeeks.seasonId, scheduleWeeks.weekNumber],
    })
    .returning();
  if (created) return created;
  const [winner] = await database
    .select()
    .from(scheduleWeeks)
    .where(
      and(
        eq(scheduleWeeks.seasonId, seasonId),
        eq(scheduleWeeks.weekNumber, weekNumber),
      ),
    )
    .limit(1);
  if (!winner) throw new Error("Unable to create canonical schedule week");
  return winner;
}

export async function findScheduleWeek(
  database: any,
  seasonId: number,
  value: Date | string,
  requestedNumber?: number | null,
) {
  return ensureScheduleWeek(database, seasonId, value, requestedNumber);
}
