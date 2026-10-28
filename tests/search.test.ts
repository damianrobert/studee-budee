import { describe, expect, it } from "vitest";
import { firstLine, searchHref } from "@/lib/search-hits";

describe("searchHref", () => {
  it("links notes, postmortems and topics to their pages", () => {
    expect(searchHref("note", { id: "n1" })).toBe("/notes/n1");
    expect(searchHref("postmortem", { id: "m1" })).toBe("/postmortems/m1");
    expect(searchHref("topic", { id: "t1", projectId: "p1" })).toBe("/projects/p1?topic=t1");
  });

  it("highlights reading items on the tab they're in", () => {
    expect(searchHref("reading", { id: "r1", status: "UNREAD" })).toBe("/reading?hl=r1");
    expect(searchHref("reading", { id: "r1", status: "READ" })).toBe("/reading?tab=read&hl=r1");
    expect(searchHref("reading", { id: "r1", status: "ARCHIVED" })).toBe(
      "/reading?tab=archived&hl=r1",
    );
  });

  it("highlights observations in the full work log", () => {
    expect(searchHref("work", { id: "w1" })).toBe("/work?hl=w1");
  });
});

describe("firstLine", () => {
  it("takes the first non-blank line", () => {
    expect(firstLine("\n  Deploys wait on approval \nmore detail")).toBe(
      "Deploys wait on approval",
    );
  });
  it("truncates long lines with an ellipsis", () => {
    const t = firstLine("x".repeat(200), 10);
    expect(t).toHaveLength(10);
    expect(t.endsWith("…")).toBe(true);
  });
});
