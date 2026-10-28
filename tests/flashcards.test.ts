import { describe, expect, it } from "vitest";
import {
  MAX_INTERVAL,
  MIN_EASE,
  dueDate,
  dueLabel,
  intervalLabel,
  sm2,
  type CardState,
  type Rating,
} from "@/lib/flashcards";

const NEW: CardState = { easeFactor: 2.5, interval: 0, repetitions: 0 };
const run = (ratings: Rating[], start = NEW) => ratings.reduce(sm2, start);

describe("sm2", () => {
  it("schedules a new card 1 day, then 6 days, then interval × ease", () => {
    const a = sm2(NEW, "GOOD");
    expect(a).toEqual({ easeFactor: 2.5, interval: 1, repetitions: 1 });
    const b = sm2(a, "GOOD");
    expect(b).toEqual({ easeFactor: 2.5, interval: 6, repetitions: 2 });
    const c = sm2(b, "GOOD");
    expect(c).toEqual({ easeFactor: 2.5, interval: 15, repetitions: 3 });
    expect(sm2(c, "GOOD").interval).toBe(38); // 15 × 2.5 = 37.5 → 38
  });

  it("changes the ease factor by quality: Easy +0.1, Good 0, Hard −0.14", () => {
    expect(sm2(NEW, "EASY").easeFactor).toBe(2.6);
    expect(sm2(NEW, "GOOD").easeFactor).toBe(2.5);
    expect(sm2(NEW, "HARD").easeFactor).toBe(2.36);
  });

  it("uses the updated ease factor for the next interval", () => {
    const s = { easeFactor: 2.5, interval: 10, repetitions: 3 };
    expect(sm2(s, "EASY").interval).toBe(26); // 10 × 2.6
    expect(sm2(s, "HARD").interval).toBe(24); // 10 × 2.36 = 23.6
  });

  it("restarts a lapsed card and keeps its ease factor", () => {
    const learned = run(["GOOD", "GOOD", "HARD"]);
    const lapsed = sm2(learned, "AGAIN");
    expect(lapsed).toEqual({ easeFactor: learned.easeFactor, interval: 0, repetitions: 0 });
    expect(sm2(lapsed, "GOOD").interval).toBe(1);
  });

  it("never lets the ease factor drop below 1.3", () => {
    const s = run(Array<Rating>(20).fill("HARD"));
    expect(s.easeFactor).toBe(MIN_EASE);
    expect(sm2(s, "HARD").easeFactor).toBe(MIN_EASE);
  });

  it("caps the interval", () => {
    expect(sm2({ easeFactor: 2.5, interval: 30_000, repetitions: 9 }, "EASY").interval).toBe(
      MAX_INTERVAL,
    );
  });

  it("keeps the interval growing at the minimum ease", () => {
    expect(sm2({ easeFactor: 1.3, interval: 1, repetitions: 5 }, "HARD").interval).toBe(1);
    expect(sm2({ easeFactor: 1.3, interval: 6, repetitions: 5 }, "HARD").interval).toBe(8);
  });
});

describe("dueDate", () => {
  const tz = "Europe/Bucharest"; // UTC+3 in summer, UTC+2 in winter

  it("is now for interval 0", () => {
    const now = new Date("2026-10-22T10:00:00Z");
    expect(dueDate(0, now, tz)).toBe(now);
  });

  it("is local midnight N days ahead, not N × 24 h", () => {
    // 23:30 local on Oct 22 → tomorrow starts 30 min later.
    const now = new Date("2026-10-22T20:30:00Z");
    expect(dueDate(1, now, tz).toISOString()).toBe("2026-10-22T21:00:00.000Z");
  });

  it("uses the local date, not the UTC date", () => {
    // 01:00 local on Oct 23 is still Oct 22 in UTC.
    const now = new Date("2026-10-22T22:00:00Z");
    expect(dueDate(1, now, tz).toISOString()).toBe("2026-10-23T21:00:00.000Z");
  });

  it("follows DST changes", () => {
    // Clocks go back on Oct 25, 2026: midnight Oct 26 is 22:00 UTC.
    const now = new Date("2026-10-22T10:00:00Z");
    expect(dueDate(4, now, tz).toISOString()).toBe("2026-10-25T22:00:00.000Z");
  });
});

describe("labels", () => {
  it("shortens intervals", () => {
    expect([0, 1, 6, 13, 15, 45, 90, 400].map(intervalLabel)).toEqual([
      "now",
      "1d",
      "6d",
      "13d",
      "2w",
      "6w",
      "3mo",
      "1.1y",
    ]);
  });

  it("describes when a card is due, in local days", () => {
    const tz = "Europe/Bucharest";
    const now = new Date("2026-10-22T10:00:00Z");
    expect(dueLabel(new Date("2026-10-22T09:00:00Z"), now, tz)).toBe("due now");
    expect(dueLabel(new Date("2026-10-22T18:00:00Z"), now, tz)).toBe("due today");
    expect(dueLabel(new Date("2026-10-22T21:00:00Z"), now, tz)).toBe("due tomorrow");
    expect(dueLabel(new Date("2026-10-26T22:00:00Z"), now, tz)).toBe("due in 5 days");
  });
});
