import { db } from "./db";
import { getSettings } from "./settings";
import { computeStreaks, countedDays } from "./streak";
import { addDays, appTz, todayKey, weekStartKey, zonedDayStart } from "./time";

export const FORGOTTEN_AFTER_MIN = 4 * 60;

export async function getRunningSession() {
  return db.session.findFirst({
    where: { endedAt: null },
    orderBy: { startedAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      topic: { select: { id: true, title: true } },
    },
  });
}

export type RunningSession = NonNullable<Awaited<ReturnType<typeof getRunningSession>>>;

/** Total completed-session minutes per day (in TZ), keyed by YYYY-MM-DD. */
export async function getMinutesByDay(tz = appTz()): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ day: string; minutes: number }[]>`
    SELECT to_char(("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
           SUM("durationMin")::int AS minutes
    FROM "Session"
    WHERE "endedAt" IS NOT NULL AND "durationMin" IS NOT NULL
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.day, r.minutes]));
}

export async function getStreakSummary() {
  const tz = appTz();
  const [settings, minutes] = await Promise.all([getSettings(), getMinutesByDay(tz)]);
  const counted = countedDays(minutes, settings.minSessionMinutes);
  const today = todayKey(tz);
  const { current, longest } = computeStreaks(counted, today);
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, counted: counted.has(day), minutes: minutes.get(day) ?? 0 };
  });
  return { current, longest, last7, today, minMinutes: settings.minSessionMinutes };
}

export function currentWeekRange(tz = appTz()) {
  const start = weekStartKey(todayKey(tz));
  return {
    startKey: start,
    start: zonedDayStart(start, tz),
    end: zonedDayStart(addDays(start, 7), tz),
  };
}

export async function getLastNextStep() {
  return db.session.findFirst({
    where: { endedAt: { not: null }, nextStep: { not: null } },
    orderBy: { endedAt: "desc" },
    select: {
      nextStep: true,
      endedAt: true,
      project: { select: { id: true, name: true } },
      topic: { select: { id: true, title: true } },
    },
  });
}

/** Defaults for a one-click start: the active project, and the last topic if it belongs to it. */
export async function getSessionDefaults() {
  const [active, last] = await Promise.all([
    db.project.findFirst({ where: { status: "ACTIVE" }, select: { id: true } }),
    db.session.findFirst({
      where: { endedAt: { not: null } },
      orderBy: { endedAt: "desc" },
      select: { projectId: true, topicId: true, topic: { select: { projectId: true } } },
    }),
  ]);
  const projectId = active?.id ?? last?.projectId ?? null;
  const topicId = last?.topicId && last.topic?.projectId === projectId ? last.topicId : null;
  return { projectId, topicId };
}

/** Projects with their topics, for project/topic pickers. */
export async function getProjectOptions() {
  return db.project.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      status: true,
      topics: {
        select: { id: true, title: true },
        orderBy: [{ stage: "asc" }, { position: "asc" }],
      },
    },
  });
}

export type ProjectOption = Awaited<ReturnType<typeof getProjectOptions>>[number];
