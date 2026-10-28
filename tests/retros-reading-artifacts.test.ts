import { describe, expect, it } from "vitest";
import { monthKeyOf, nextPublishedAt, orderMonths } from "@/lib/artifacts";
import { extractTitle, normalizeUrl, sourceFromUrl } from "@/lib/reading";
import { countBottlenecks, defaultRetroWeek, openRetroWeeks, summarizeMoves } from "@/lib/retros";
import { zonedDayStart } from "@/lib/time";

const TZ = "Europe/Bucharest";

describe("retro weeks", () => {
  // Wednesday 2026-10-21 → week of Monday 2026-10-19.
  it("lists the current week and the previous four that have no retro, newest first", () => {
    expect(openRetroWeeks("2026-10-21", new Set(["2026-10-12"]))).toEqual([
      "2026-10-19",
      "2026-10-05",
      "2026-09-28",
      "2026-09-21",
    ]);
  });

  it("defaults to the current week mid-week", () => {
    const open = openRetroWeeks("2026-10-21", new Set());
    expect(defaultRetroWeek("2026-10-21", open)).toBe("2026-10-19");
  });

  it("defaults to last week on Monday/Tuesday if last week's retro is missing", () => {
    const open = openRetroWeeks("2026-10-20", new Set());
    expect(defaultRetroWeek("2026-10-20", open)).toBe("2026-10-12");
    const done = openRetroWeeks("2026-10-20", new Set(["2026-10-12"]));
    expect(defaultRetroWeek("2026-10-20", done)).toBe("2026-10-19");
  });

  it("falls back to an older open week when this week is done, or nothing", () => {
    const open = openRetroWeeks("2026-10-21", new Set(["2026-10-19", "2026-10-12"]));
    expect(defaultRetroWeek("2026-10-21", open)).toBe("2026-10-05");
    expect(defaultRetroWeek("2026-10-21", [])).toBeUndefined();
  });
});

describe("summarizeMoves", () => {
  const t = (id: string) => ({ id });
  it("collapses several moves of a topic into first-from → last-to", () => {
    const moves = summarizeMoves([
      { from: "PAIN", to: "BUILD", topic: t("a") },
      { from: "PAIN", to: "BUILD", topic: t("b") },
      { from: "BUILD", to: "BREAK", topic: t("a") },
    ]);
    expect(moves).toEqual([
      { topic: t("a"), from: "PAIN", to: "BREAK" },
      { topic: t("b"), from: "PAIN", to: "BUILD" },
    ]);
  });

  it("drops topics that ended the week where they started", () => {
    expect(
      summarizeMoves([
        { from: "BUILD", to: "BREAK", topic: t("a") },
        { from: "BREAK", to: "BUILD", topic: t("a") },
      ]),
    ).toEqual([]);
  });
});

describe("countBottlenecks", () => {
  const retro = (week: string, bottleneck: "TIME" | "ENERGY" | "FOCUS") => ({
    weekStart: zonedDayStart(week, TZ),
    bottleneck,
  });
  it("counts the last 12 weeks only, most frequent first", () => {
    const rows = countBottlenecks(
      [
        retro("2026-10-19", "ENERGY"),
        retro("2026-10-12", "TIME"),
        retro("2026-10-05", "TIME"),
        retro("2026-08-03", "FOCUS"), // 12th week back: included
        retro("2026-07-27", "FOCUS"), // 13th: excluded
      ],
      "2026-10-21",
      12,
      TZ,
    );
    expect(rows.map((r) => [r.bottleneck, r.count])).toEqual([
      ["TIME", 2],
      ["ENERGY", 1],
      ["FOCUS", 1],
    ]);
    expect(rows[0]!.label).toBe("Time");
  });
});

describe("reading links", () => {
  it("normalizes URLs and rejects non-web links", () => {
    expect(normalizeUrl(" example.com/post ")).toBe("https://example.com/post");
    expect(normalizeUrl("http://sre.google/book")).toBe("http://sre.google/book");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://example.com")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });

  it("derives the source domain without www", () => {
    expect(sourceFromUrl("https://www.brendangregg.com/x")).toBe("brendangregg.com");
    expect(sourceFromUrl("https://k8s.io")).toBe("k8s.io");
  });

  it("prefers og:title (either attribute order), then <title>, and decodes entities", () => {
    expect(
      extractTitle(
        `<head><title>Site</title><meta property="og:title" content="Debugging &amp; DNS"></head>`,
      ),
    ).toBe("Debugging & DNS");
    expect(extractTitle(`<meta content='Reversed &#8217;s' property='og:title' />`)).toBe(
      "Reversed ’s",
    );
    expect(extractTitle(`<title>\n  How  Kubernetes\n works &mdash; intro </title>`)).toBe(
      "How Kubernetes works — intro",
    );
    expect(extractTitle("<html><body>no title</body></html>")).toBeNull();
    expect(extractTitle("<title>   </title>")).toBeNull();
  });
});

describe("artifacts", () => {
  it("orders months: current, then upcoming soonest first, then past newest first", () => {
    expect(orderMonths("2026-10", ["2026-08", "2026-12", "2026-10", "2026-11", "2026-09"])).toEqual(
      { current: "2026-10", upcoming: ["2026-11", "2026-12"], past: ["2026-09", "2026-08"] },
    );
  });

  it("reads the target month in TZ", () => {
    expect(monthKeyOf(zonedDayStart("2026-11-01", TZ), TZ)).toBe("2026-11"); // 22:00Z on Oct 31
  });

  it("stamps publishedAt once, keeps it, and clears it when unpublished", () => {
    const now = new Date("2026-10-22T10:00:00Z");
    const earlier = new Date("2026-10-01T10:00:00Z");
    expect(nextPublishedAt("PUBLISHED", null, now)).toEqual(now);
    expect(nextPublishedAt("PUBLISHED", earlier, now)).toEqual(earlier);
    expect(nextPublishedAt("DRAFT", earlier, now)).toBeNull();
  });
});
