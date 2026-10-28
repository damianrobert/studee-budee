import { db } from "./db";
import {
  addDays,
  appTz,
  isoWeekday,
  monthStartKey,
  todayKey,
  weekStartKey,
  zonedDayStart,
} from "./time";

export type Nudge = { id: string; text: string; href: string; cta: string };

/** At most two, in priority order, and only when relevant. */
export async function getNudges(): Promise<Nudge[]> {
  const tz = appTz();
  const today = todayKey(tz);
  const weekStart = zonedDayStart(weekStartKey(today), tz);
  const monthStart = zonedDayStart(monthStartKey(today), tz);
  const fourteenDaysAgo = zonedDayStart(addDays(today, -14), tz);
  const isSunday = isoWeekday(today) === 7;
  const pastThe20th = Number(today.slice(8)) > 20;

  const [retro, recentChaos, published, unread, due] = await Promise.all([
    isSunday ? db.weeklyRetro.findUnique({ where: { weekStart }, select: { id: true } }) : null,
    db.chaosExperiment.count({ where: { completedAt: { gte: fourteenDaysAgo } } }),
    pastThe20th
      ? db.artifact.count({ where: { status: "PUBLISHED", publishedAt: { gte: monthStart } } })
      : 1,
    db.readingItem.count({ where: { status: "UNREAD" } }),
    db.flashcard.count({ where: { dueAt: { lte: new Date() } } }),
  ]);

  const nudges: Nudge[] = [];
  if (isSunday && !retro)
    nudges.push({
      id: "retro",
      text: "Time for your 15-minute retro.",
      href: "/retros/new",
      cta: "Write retro",
    });
  if (recentChaos === 0)
    nudges.push({
      id: "chaos",
      text: "Break something this week.",
      href: "/chaos",
      cta: "Open Chaos Lab",
    });
  if (published === 0)
    nudges.push({
      id: "artifact",
      text: "One artifact this month?",
      href: "/artifacts",
      cta: "Plan one",
    });
  if (unread > 15)
    nudges.push({
      id: "reading",
      text: "Your reading inbox is piling up.",
      href: "/reading",
      cta: `${unread} unread`,
    });
  if (due > 0)
    nudges.push({
      id: "flashcards",
      text: `${due} flashcard${due === 1 ? "" : "s"} due.`,
      href: "/flashcards/review",
      cta: "Review",
    });
  return nudges.slice(0, 2);
}
