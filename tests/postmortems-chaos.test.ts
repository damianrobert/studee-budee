import { describe, expect, it } from "vitest";
import { normalizeCategory, pickExperiment } from "@/lib/chaos";
import { postmortemText, postmortemToMarkdown } from "@/lib/postmortems";

const pm = {
  title: "DB password rotated",
  occurredAt: new Date("2026-10-21T22:30:00Z"),
  whatBroke: "The app couldn't connect.",
  symptoms: "```\nFATAL: password authentication failed\n```",
  investigation: "",
  rootCause: "The app kept the old password.",
  fix: "Updated `.env` and restarted.",
  lessons: "Rotate in the app first.",
  wasDeliberate: false,
};

describe("postmortemToMarkdown", () => {
  it("writes a title, date in TZ, kind and only the filled sections in order", () => {
    const md = postmortemToMarkdown(pm, "Europe/Bucharest");
    expect(md).toMatch(/^# Postmortem: DB password rotated\n/);
    expect(md).toContain("**Date:** 22 October 2026"); // 01:30 next day in Bucharest
    expect(md).toContain("**Type:** Real incident");
    expect(md).not.toContain("## How I found the cause");
    const order = ["## What broke", "## Symptoms", "## Root cause", "## Fix", "## What I learned"];
    const idx = order.map((h) => md.indexOf(h));
    expect(idx.every((i) => i > 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(md).toContain("```\nFATAL: password authentication failed\n```");
  });

  it("labels deliberate postmortems with their experiment", () => {
    const md = postmortemToMarkdown(
      { ...pm, wasDeliberate: true, chaosExperiment: { title: "Rotate the DB password" } },
      "UTC",
    );
    expect(md).toContain("**Type:** Deliberate failure (chaos experiment: Rotate the DB password)");
  });

  it("joins all fields for attachment lookups", () => {
    expect(postmortemText(pm)).toContain("Updated `.env`");
    expect(postmortemText(pm)).toContain("FATAL");
  });
});

describe("pickExperiment", () => {
  const all = [
    { id: "a", category: "containers", difficulty: 1, completedAt: null },
    { id: "b", category: "containers", difficulty: 2, completedAt: null },
    { id: "c", category: "kubernetes", difficulty: 2, completedAt: null },
    { id: "d", category: "kubernetes", difficulty: 1, completedAt: new Date() },
  ];

  it("never picks a completed experiment", () => {
    for (let i = 0; i < 20; i++)
      expect(pickExperiment(all, { category: "kubernetes" }, null, () => i / 20)?.id).toBe("c");
  });

  it("applies category and difficulty filters", () => {
    expect(pickExperiment(all, { category: "containers", difficulty: 2 })?.id).toBe("b");
    expect(pickExperiment(all, { category: "kubernetes", difficulty: 1 })).toBeNull();
  });

  it("avoids repeating the current pick when there is another option", () => {
    for (let i = 0; i < 10; i++)
      expect(pickExperiment(all, { category: "containers" }, "a", () => i / 10)?.id).toBe("b");
    expect(pickExperiment(all, { category: "kubernetes" }, "c")?.id).toBe("c");
  });
});

describe("normalizeCategory", () => {
  it("makes lower-case kebab names and empties null", () => {
    expect(normalizeCategory(" Config / Secrets ")).toBe("config-secrets");
    expect(normalizeCategory("  ")).toBeNull();
    expect(normalizeCategory(null)).toBeNull();
  });
});
