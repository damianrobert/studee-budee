import { describe, expect, it } from "vitest";
import { computeStreaks, countedDays } from "@/lib/streak";

const days = (...d: string[]) => new Set(d);

describe("countedDays", () => {
  it("counts a day only at the minimum total minutes", () => {
    const m = new Map([
      ["2026-10-19", 9],
      ["2026-10-20", 10],
      ["2026-10-21", 45],
    ]);
    expect([...countedDays(m, 10)].sort()).toEqual(["2026-10-20", "2026-10-21"]);
  });
});

describe("computeStreaks", () => {
  const today = "2026-10-21";

  it("is zero with no sessions", () => {
    expect(computeStreaks(days(), today)).toEqual({ current: 0, longest: 0 });
  });

  it("includes today when counted", () => {
    expect(computeStreaks(days("2026-10-19", "2026-10-20", "2026-10-21"), today).current).toBe(3);
  });

  it("doesn't break when today isn't counted yet", () => {
    expect(computeStreaks(days("2026-10-19", "2026-10-20"), today).current).toBe(2);
  });

  it("breaks after a missed day", () => {
    expect(computeStreaks(days("2026-10-18", "2026-10-19"), today).current).toBe(0);
  });

  it("tracks the longest run separately", () => {
    const s = days(
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-20",
      "2026-10-21",
    );
    expect(computeStreaks(s, today)).toEqual({ current: 2, longest: 4 });
  });

  it("handles month boundaries", () => {
    expect(computeStreaks(days("2026-09-30", "2026-10-01"), "2026-10-01").current).toBe(2);
  });
});
