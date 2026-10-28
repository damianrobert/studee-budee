import type { Bottleneck, LoopStage } from "@prisma/client";
import { db } from "./db";
import { addDays, appTz, dayKey, isoWeekday, weekStartKey, zonedDayStart } from "./time";

export const BOTTLENECKS: Bottleneck[] = [
  "TIME",
  "ENERGY",
  "FOCUS",
  "TUTORIAL_HELL",
  "STUCK_ON_CONCEPT",
  "TOOL_FOMO",
  "ENVIRONMENT_ISSUES",
  "OTHER",
];

export const BOTTLENECK_LABEL: Record<Bottleneck, string> = {
  TIME: "Time",
  ENERGY: "Energy",
  FOCUS: "Focus",
  TUTORIAL_HELL: "Tutorial hell",
  STUCK_ON_CONCEPT: "Stuck on a concept",
  TOOL_FOMO: "Tool FOMO",
  ENVIRONMENT_ISSUES: "Environment issues",
  OTHER: "Other",
};

/** How many past weeks (besides the current one) a new retro can still be written for. */
export const RETRO_BACKFILL_WEEKS = 4;

/**
 * Weeks (Monday keys, newest first) that don't have a retro yet: the current week and
 * the previous few.
 */
export function openRetroWeeks(today: string, existing: Set<string>): string[] {
  const current = weekStartKey(today);
  return Array.from({ length: RETRO_BACKFILL_WEEKS + 1 }, (_, i) =>
    addDays(current, -7 * i),
  ).filter((w) => !existing.has(w));
}

/**
 * The week a new retro is most likely for: the current one, except early in the week
 * (Mon/Tue) when last week's retro is still missing.
 */
export function defaultRetroWeek(today: string, open: string[]): string | undefined {
  const current = weekStartKey(today);
  const last = addDays(current, -7);
  if (isoWeekday(today) <= 2 && open.includes(last)) return last;
  return open.includes(current) ? current : open[0];
}

export function retroWeekKey(weekStart: Date, tz = appTz()): string {
  return dayKey(weekStart, tz);
}

export function weekLabel(key: string): string {
  const fmt = (k: string) =>
    new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${fmt(key)} – ${fmt(addDays(key, 6))}`;
}

export type WeekFacts = Awaited<ReturnType<typeof getWeekFacts>>;

/** What happened in a week, so "what did I ship?" is easy to answer. */
export async function getWeekFacts(weekKey: string, tz = appTz()) {
  const range = { gte: zonedDayStart(weekKey, tz), lt: zonedDayStart(addDays(weekKey, 7), tz) };
  const [sessions, changes, postmortems, artifacts, reading] = await Promise.all([
    db.session.aggregate({
      where: { endedAt: { not: null }, startedAt: range },
      _count: true,
      _sum: { durationMin: true },
    }),
    db.topicStageChange.findMany({
      where: { changedAt: range },
      orderBy: { changedAt: "asc" },
      select: {
        from: true,
        to: true,
        topic: { select: { id: true, title: true, projectId: true } },
      },
    }),
    db.postmortem.findMany({
      where: { createdAt: range },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, wasDeliberate: true },
    }),
    db.artifact.findMany({
      where: { status: "PUBLISHED", publishedAt: range },
      orderBy: { publishedAt: "asc" },
      select: { id: true, title: true, url: true },
    }),
    db.readingItem.findMany({
      where: { readAt: range },
      orderBy: { readAt: "asc" },
      select: { id: true, title: true, url: true },
    }),
  ]);
  return {
    sessions: sessions._count,
    minutes: sessions._sum.durationMin ?? 0,
    topics: summarizeMoves(changes),
    postmortems,
    artifacts,
    reading,
  };
}

/** One entry per topic: where it started the week and where it ended up. */
export function summarizeMoves<T extends { id: string }>(
  changes: { from: LoopStage; to: LoopStage; topic: T }[],
): { topic: T; from: LoopStage; to: LoopStage }[] {
  const byTopic = new Map<string, { topic: T; from: LoopStage; to: LoopStage }>();
  for (const c of changes) {
    const prev = byTopic.get(c.topic.id);
    if (prev) prev.to = c.to;
    else byTopic.set(c.topic.id, { topic: c.topic, from: c.from, to: c.to });
  }
  return [...byTopic.values()].filter((m) => m.from !== m.to);
}

/** Bottleneck counts over the last `weeks` weeks (including the current one), most frequent first. */
export function countBottlenecks(
  retros: { weekStart: Date; bottleneck: Bottleneck }[],
  today: string,
  weeks = 12,
  tz = appTz(),
): { bottleneck: Bottleneck; label: string; count: number }[] {
  const since = addDays(weekStartKey(today), -7 * (weeks - 1));
  const counts = new Map<Bottleneck, number>();
  for (const r of retros) {
    if (retroWeekKey(r.weekStart, tz) < since) continue;
    counts.set(r.bottleneck, (counts.get(r.bottleneck) ?? 0) + 1);
  }
  return BOTTLENECKS.filter((b) => counts.has(b))
    .map((b) => ({ bottleneck: b, label: BOTTLENECK_LABEL[b], count: counts.get(b)! }))
    .sort((a, b) => b.count - a.count);
}
