import { describe, expect, it } from "vitest";
import { addDays, dayKey, isoWeekday, weekStartKey, zonedDayStart } from "@/lib/time";

const TZ = "Europe/Bucharest";

describe("dayKey", () => {
  it("uses the app timezone, not UTC", () => {
    // 22:30 UTC on Oct 20 is 01:30 on Oct 21 in Bucharest (UTC+3, summer time)
    expect(dayKey(new Date("2026-10-20T22:30:00Z"), TZ)).toBe("2026-10-21");
    expect(dayKey(new Date("2026-10-20T20:59:00Z"), TZ)).toBe("2026-10-20");
  });
});

describe("week boundaries", () => {
  it("weeks start on Monday", () => {
    expect(isoWeekday("2026-10-19")).toBe(1); // Monday
    expect(isoWeekday("2026-10-25")).toBe(7); // Sunday
    expect(weekStartKey("2026-10-25")).toBe("2026-10-19");
    expect(weekStartKey("2026-10-19")).toBe("2026-10-19");
    expect(weekStartKey("2026-10-26")).toBe("2026-10-26");
  });

  it("crosses month and year ends", () => {
    expect(weekStartKey("2027-01-01")).toBe("2026-12-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("finds local midnight in UTC, including across DST", () => {
    // Summer time (UTC+3)
    expect(zonedDayStart("2026-10-19", TZ).toISOString()).toBe("2026-10-18T21:00:00.000Z");
    // DST ends 2026-10-25 at 04:00 local; midnight that day is still UTC+3
    expect(zonedDayStart("2026-10-25", TZ).toISOString()).toBe("2026-10-24T21:00:00.000Z");
    // Winter time (UTC+2)
    expect(zonedDayStart("2026-10-26", TZ).toISOString()).toBe("2026-10-25T22:00:00.000Z");
    // A Sunday late-evening session belongs to that week, a Monday 00:30 one to the next
    const nextWeek = zonedDayStart("2026-10-26", TZ);
    expect(new Date("2026-10-25T21:30:00Z") < nextWeek).toBe(true);
    expect(new Date("2026-10-25T22:30:00Z") >= nextWeek).toBe(true);
  });
});
