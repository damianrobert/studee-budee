import { describe, expect, it } from "vitest";
import {
  countByMonth,
  firstDone,
  heatLevel,
  heatmapWeeks,
  lastMonths,
  lastWeeks,
  loopBalance,
  weeklySessions,
} from "@/lib/stats";

describe("heatmap", () => {
  it("levels: none, under the minimum, then counted days by session count", () => {
    expect(heatLevel(undefined, 10)).toBe(0);
    expect(heatLevel({ sessions: 1, minutes: 5 }, 10)).toBe(1);
    expect(heatLevel({ sessions: 1, minutes: 10 }, 10)).toBe(2);
    expect(heatLevel({ sessions: 2, minutes: 40 }, 10)).toBe(3);
    expect(heatLevel({ sessions: 5, minutes: 200 }, 10)).toBe(4);
  });

  it("builds Monday-aligned weeks covering exactly the window", () => {
    // Thursday 2026-10-22, 365 days back = 2025-10-23 (a Thursday).
    const weeks = heatmapWeeks(
      new Map([["2026-10-22", { sessions: 1, minutes: 30 }]]),
      "2026-10-22",
      10,
    );
    const cells = weeks.flat().filter((c) => c !== null);
    expect(cells).toHaveLength(365);
    expect(weeks[0]![0]).toBeNull(); // Monday 2025-10-20 is before the window
    expect(weeks[0]![3]!.day).toBe("2025-10-23");
    const last = weeks.at(-1)!;
    expect(last[3]).toMatchObject({ day: "2026-10-22", level: 2 });
    expect(last[4]).toBeNull(); // Friday is in the future
  });
});

describe("periods", () => {
  it("last weeks end with the current Monday", () => {
    const w = lastWeeks("2026-10-22", 3);
    expect(w).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("last months cross the year boundary", () => {
    expect(lastMonths("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("counts per month, zero-filled, ignoring other months", () => {
    expect(
      countByMonth(["2026-09", "2026-10"], ["2026-10-01", "2026-10-31", "2026-08-15"]),
    ).toEqual([
      { month: "2026-09", count: 0 },
      { month: "2026-10", count: 2 },
    ]);
  });
});

describe("weeklySessions", () => {
  it("buckets sessions into weeks with output share", () => {
    const rows = weeklySessions(
      [
        { day: "2026-10-19", producedOutput: true, minutes: 30 },
        { day: "2026-10-25", producedOutput: false, minutes: 20 }, // Sunday, same week
        { day: "2026-10-12", producedOutput: false, minutes: 15 },
        { day: "2026-01-01", producedOutput: true, minutes: 15 }, // outside the window
      ],
      ["2026-10-12", "2026-10-19"],
    );
    expect(rows).toEqual([
      { week: "2026-10-12", sessions: 1, withOutput: 0, outputPct: 0, minutes: 15 },
      { week: "2026-10-19", sessions: 2, withOutput: 1, outputPct: 50, minutes: 50 },
    ]);
  });

  it("has no output share for empty weeks", () => {
    expect(weeklySessions([], ["2026-10-19"])[0]!.outputPct).toBeNull();
  });
});

describe("loopBalance", () => {
  const many = (stage: "PAIN" | "BUILD" | "BREAK" | "EXPLAIN", n: number) =>
    Array.from({ length: n }, () => stage);

  it("flags Break/Explain under 15% once there are enough tagged sessions", () => {
    const b = loopBalance([...many("PAIN", 2), ...many("BUILD", 8), ...many("BREAK", 1), null]);
    expect(b.tagged).toBe(11);
    expect(b.untagged).toBe(1);
    expect(b.weak).toEqual(["BREAK", "EXPLAIN"]);
    expect(b.rows.find((r) => r.stage === "PAIN")!.low).toBe(false); // only Break/Explain are judged
  });

  it("doesn't flag a balanced loop", () => {
    const b = loopBalance([
      ...many("PAIN", 2),
      ...many("BUILD", 4),
      ...many("BREAK", 2),
      ...many("EXPLAIN", 2),
    ]);
    expect(b.weak).toEqual([]);
  });

  it("doesn't judge on too few sessions", () => {
    expect(loopBalance(many("BUILD", 5)).weak).toEqual([]);
  });
});

describe("firstDone", () => {
  it("counts each topic once, at its first Done", () => {
    const a1 = new Date("2026-09-01T10:00:00Z");
    const a2 = new Date("2026-10-01T10:00:00Z");
    const b = new Date("2026-10-05T10:00:00Z");
    expect(
      firstDone([
        { topicId: "a", changedAt: a2 },
        { topicId: "a", changedAt: a1 },
        { topicId: "b", changedAt: b },
      ]),
    ).toEqual([a1, b]);
  });
});
