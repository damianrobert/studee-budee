import type { LoopStage } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { LOOP_STAGES, type SessionStage } from "./stages";
import { computeStreaks, countedDays } from "./streak";
import { addDays, appTz, dayKey, todayKey, weekStartKey, zonedDayStart } from "./time";

export const HEATMAP_DAYS = 365;
export const STATS_WEEKS = 12;
export const STATS_MONTHS = 12;
/** Below this share of stage-tagged sessions, Break/Explain gets flagged. */
export const LOOP_BALANCE_MIN_SHARE = 0.15;
/** Don't judge the loop balance on fewer tagged sessions than this. */
export const LOOP_BALANCE_MIN_SESSIONS = 8;

export type DayActivity = { sessions: number; minutes: number };

/**
 * 0 = no session; 1 = sessions, but under the counted-day minimum;
 * 2–4 = counted day with 1, 2, 3+ sessions.
 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export function heatLevel(a: DayActivity | undefined, minMinutes: number): HeatLevel {
  if (!a || a.sessions === 0) return 0;
  if (a.minutes < minMinutes) return 1;
  return Math.min(a.sessions + 1, 4) as HeatLevel;
}

export type HeatCell = { day: string; level: HeatLevel; sessions: number; minutes: number };

/**
 * Columns of Monday→Sunday days covering the last `days` days up to `today`. Days before
 * the window or after today are `null` so the grid stays aligned to weekdays.
 */
export function heatmapWeeks(
  activity: Map<string, DayActivity>,
  today: string,
  minMinutes: number,
  days = HEATMAP_DAYS,
): (HeatCell | null)[][] {
  const first = addDays(today, 1 - days);
  const weeks: (HeatCell | null)[][] = [];
  for (let start = weekStartKey(first); start <= today; start = addDays(start, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(start, i);
        if (day < first || day > today) return null;
        const a = activity.get(day);
        return {
          day,
          level: heatLevel(a, minMinutes),
          sessions: a?.sessions ?? 0,
          minutes: a?.minutes ?? 0,
        };
      }),
    );
  }
  return weeks;
}

/** Monday keys of the last `n` weeks, oldest first, ending with the current week. */
export function lastWeeks(today: string, n = STATS_WEEKS): string[] {
  const current = weekStartKey(today);
  return Array.from({ length: n }, (_, i) => addDays(current, -7 * (n - 1 - i)));
}

/** "2026-10" keys of the last `n` months, oldest first, ending with the current month. */
export function lastMonths(today: string, n = STATS_MONTHS): string[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export type WeekRow = {
  week: string;
  sessions: number;
  withOutput: number;
  /** % of the week's sessions with visible output; null when there were none. */
  outputPct: number | null;
  minutes: number;
};

export function weeklySessions(
  sessions: { day: string; producedOutput: boolean; minutes: number }[],
  weeks: string[],
): WeekRow[] {
  const rows = new Map<string, WeekRow>(
    weeks.map((week) => [week, { week, sessions: 0, withOutput: 0, outputPct: null, minutes: 0 }]),
  );
  for (const s of sessions) {
    const row = rows.get(weekStartKey(s.day));
    if (!row) continue;
    row.sessions++;
    row.minutes += s.minutes;
    if (s.producedOutput) row.withOutput++;
  }
  for (const row of rows.values()) {
    row.outputPct = row.sessions ? Math.round((row.withOutput / row.sessions) * 100) : null;
  }
  return [...rows.values()];
}

/** Counts per month for the given month keys (zero-filled). */
export function countByMonth(
  monthKeys: string[],
  dayKeys: string[],
): { month: string; count: number }[] {
  const counts = new Map(monthKeys.map((m) => [m, 0]));
  for (const d of dayKeys) {
    const m = d.slice(0, 7);
    if (counts.has(m)) counts.set(m, counts.get(m)! + 1);
  }
  return monthKeys.map((month) => ({ month, count: counts.get(month)! }));
}

export type LoopBalance = {
  rows: { stage: SessionStage; count: number; share: number; low: boolean }[];
  tagged: number;
  untagged: number;
  /** Stages under the threshold among Break/Explain, once there's enough data to judge. */
  weak: SessionStage[];
};

export function loopBalance(stages: (LoopStage | null)[]): LoopBalance {
  const counts = new Map<SessionStage, number>(LOOP_STAGES.map((s) => [s, 0]));
  let untagged = 0;
  for (const s of stages) {
    if (s && counts.has(s as SessionStage))
      counts.set(s as SessionStage, counts.get(s as SessionStage)! + 1);
    else untagged++;
  }
  const tagged = stages.length - untagged;
  const judge = tagged >= LOOP_BALANCE_MIN_SESSIONS;
  const rows = LOOP_STAGES.map((stage) => {
    const count = counts.get(stage)!;
    const share = tagged ? count / tagged : 0;
    const low =
      judge && (stage === "BREAK" || stage === "EXPLAIN") && share < LOOP_BALANCE_MIN_SHARE;
    return { stage, count, share, low };
  });
  return { rows, tagged, untagged, weak: rows.filter((r) => r.low).map((r) => r.stage) };
}

/** First time each topic reached Done (a topic that bounced back and forth counts once). */
export function firstDone(changes: { topicId: string; changedAt: Date }[]): Date[] {
  const first = new Map<string, Date>();
  for (const c of changes) {
    const prev = first.get(c.topicId);
    if (!prev || c.changedAt < prev) first.set(c.topicId, c.changedAt);
  }
  return [...first.values()];
}

export function monthShortLabel(monthKey: string): string {
  return new Date(`${monthKey}-15T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
}

export function dayShortLabel(key: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...opts,
  });
}

export async function getStats() {
  const tz = appTz();
  const today = todayKey(tz);
  const weeks = lastWeeks(today);
  const months = lastMonths(today);
  const heatFrom = zonedDayStart(addDays(today, 1 - HEATMAP_DAYS), tz);
  const monthsFrom = zonedDayStart(`${months[0]}-01`, tz);
  const weeksFrom = zonedDayStart(weeks[0]!, tz);

  const [settings, allMinutes, sessions, doneChanges, postmortems, artifacts, reading] =
    await Promise.all([
      getSettings(),
      // All-time per-day minutes, for the longest streak.
      db.$queryRaw<{ day: string; minutes: number }[]>`
        SELECT to_char(("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
               SUM("durationMin")::int AS minutes
        FROM "Session"
        WHERE "endedAt" IS NOT NULL AND "durationMin" IS NOT NULL
        GROUP BY 1`,
      db.session.findMany({
        where: { endedAt: { not: null }, startedAt: { gte: heatFrom } },
        select: { startedAt: true, durationMin: true, producedOutput: true, stage: true },
      }),
      db.topicStageChange.findMany({
        where: { to: "DONE" },
        select: { topicId: true, changedAt: true },
      }),
      db.postmortem.groupBy({ by: ["wasDeliberate"], _count: true }),
      db.artifact.findMany({
        where: { status: "PUBLISHED", publishedAt: { gte: monthsFrom } },
        select: { publishedAt: true },
      }),
      db.readingItem.findMany({
        where: { readAt: { gte: monthsFrom } },
        select: { readAt: true },
      }),
    ]);

  const minMinutes = settings.minSessionMinutes;
  const streaks = computeStreaks(
    countedDays(new Map(allMinutes.map((r) => [r.day, r.minutes])), minMinutes),
    today,
  );

  const withDay = sessions.map((s) => ({
    day: dayKey(s.startedAt, tz),
    minutes: s.durationMin ?? 0,
    producedOutput: s.producedOutput,
    stage: s.stage,
    startedAt: s.startedAt,
  }));

  const activity = new Map<string, DayActivity>();
  for (const s of withDay) {
    const a = activity.get(s.day) ?? { sessions: 0, minutes: 0 };
    a.sessions++;
    a.minutes += s.minutes;
    activity.set(s.day, a);
  }
  const heatmap = heatmapWeeks(activity, today, minMinutes);
  const heatDays = heatmap.flat().filter((c): c is HeatCell => c !== null);

  const recent = withDay.filter((s) => s.startedAt >= weeksFrom);
  const done = firstDone(doneChanges);

  const deliberate = postmortems.find((p) => p.wasDeliberate)?._count ?? 0;
  const real = postmortems.find((p) => !p.wasDeliberate)?._count ?? 0;

  return {
    today,
    minMinutes,
    weeklyTarget: settings.weeklyTarget,
    streaks,
    heatmap,
    countedLastYear: heatDays.filter((c) => c.level >= 2).length,
    sessionsLastYear: heatDays.reduce((n, c) => n + c.sessions, 0),
    weekly: weeklySessions(recent, weeks),
    loop: loopBalance(recent.map((s) => s.stage)),
    topicsDone: {
      total: done.length,
      byMonth: countByMonth(
        months,
        done.map((d) => dayKey(d, tz)),
      ),
    },
    postmortems: { total: deliberate + real, deliberate, real },
    artifactsByMonth: countByMonth(
      months,
      artifacts.map((a) => dayKey(a.publishedAt!, tz)),
    ),
    readingByMonth: countByMonth(
      months,
      reading.map((r) => dayKey(r.readAt!, tz)),
    ),
  };
}

export type Stats = Awaited<ReturnType<typeof getStats>>;
