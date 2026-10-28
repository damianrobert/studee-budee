// SM-2 spaced repetition (SuperMemo 2, Wozniak 1990). Pure functions, shared by
// the review action (server) and the interval hints on the rating buttons (client).

import { addDays, dayKey, daysBetween, zonedDayStart } from "./time";

export const RATINGS = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABEL: Record<Rating, string> = {
  AGAIN: "Again",
  HARD: "Hard",
  GOOD: "Good",
  EASY: "Easy",
};

/** SM-2 response quality (0–5) for each button. Below 3 is a lapse. */
export const QUALITY: Record<Rating, number> = { AGAIN: 1, HARD: 3, GOOD: 4, EASY: 5 };

export const MIN_EASE = 1.3;
export const MAX_INTERVAL = 36_500; // days; keeps dueAt in range

export type CardState = { easeFactor: number; interval: number; repetitions: number };

/**
 * One SM-2 step.
 * - Lapse (Again): repetitions restart and the card is due again now (interval 0), so it
 *   comes back in this review; the ease factor is left alone, as in the original algorithm.
 * - Pass: the ease factor moves by 0.1 − (5−q)(0.08 + (5−q)·0.02) (floored at 1.3), then the
 *   interval is 1 day, 6 days, then the previous interval × the new ease factor.
 */
export function sm2(card: CardState, rating: Rating): CardState {
  const q = QUALITY[rating];
  if (q < 3) return { easeFactor: card.easeFactor, interval: 0, repetitions: 0 };
  const easeFactor = Math.max(
    MIN_EASE,
    round2(card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))),
  );
  const repetitions = card.repetitions + 1;
  const interval =
    repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.min(MAX_INTERVAL, Math.max(1, Math.round(card.interval * easeFactor)));
  return { easeFactor, interval, repetitions };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * When a card with this interval is next due: now for 0, otherwise the start of the day
 * `interval` days from today in `tz` — so "tomorrow" means any time tomorrow, not +24 h.
 */
export function dueDate(interval: number, now: Date, tz: string): Date {
  if (interval <= 0) return now;
  return zonedDayStart(addDays(dayKey(now, tz), interval), tz);
}

/** Short label for an interval in days: "now", "1d", "3w", "4mo", "1.5y". */
export function intervalLabel(days: number): string {
  if (days <= 0) return "now";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const y = Math.round((days / 365) * 10) / 10;
  return `${y}y`;
}

/** "due now", "due today", "due tomorrow", "due in 5 days", for a list row. */
export function dueLabel(dueAt: Date, now: Date, tz: string): string {
  if (dueAt <= now) return "due now";
  const days = daysBetween(dayKey(now, tz), dayKey(dueAt, tz));
  if (days <= 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}
