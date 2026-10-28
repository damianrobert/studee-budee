import { addDays } from "./time";

/** Days whose total session minutes reach the threshold. */
export function countedDays(minutesByDay: Map<string, number>, minMinutes: number): Set<string> {
  const out = new Set<string>();
  for (const [day, min] of minutesByDay) if (min >= minMinutes) out.add(day);
  return out;
}

/**
 * Current streak = consecutive counted days ending today, or ending yesterday
 * when today isn't counted yet (an unfinished today doesn't break the streak).
 */
export function computeStreaks(
  counted: Set<string>,
  today: string,
): { current: number; longest: number } {
  let current = 0;
  let cursor = counted.has(today) ? today : addDays(today, -1);
  while (counted.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of [...counted].sort()) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  return { current, longest };
}
