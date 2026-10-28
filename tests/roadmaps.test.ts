import { describe, expect, it } from "vitest";
import { parseBrave, stripTags, type SearchResult } from "@/lib/ai/brave";
import { checkReferences, exportSchema } from "@/lib/export-format";
import { PICKS_MAX, mergePlan, parsePicks, parsePlan, parseStepRevision } from "@/lib/ai/roadmap";
import {
  PICK_SYSTEM,
  ROADMAP_REVISE_SYSTEM,
  ROADMAP_SYSTEM,
  pickPrompt,
  roadmapRevisePrompt,
} from "@/lib/ai/prompts";
import { progress, urlKey } from "@/lib/roadmaps";

const step = (title: string, extra: object = {}) => ({
  title,
  description: `About ${title}`,
  practice: `Do ${title}`,
  searchQueries: [`${title} tutorial`],
  ...extra,
});

describe("parsePlan", () => {
  it("accepts a plan, trimming text and deduplicating queries", () => {
    const plan = parsePlan({
      title: " K8s ",
      summary: "",
      stages: [
        {
          title: "Basics",
          description: "d",
          steps: [step("Pods", { searchQueries: [" pods ", "pods", ""] })],
        },
      ],
    });
    expect(plan?.title).toBe("K8s");
    expect(plan?.summary).toBeNull();
    expect(plan?.stages[0]!.steps[0]!.searchQueries).toEqual(["pods"]);
  });

  it("drops empty stages and refuses a plan without steps", () => {
    const plan = parsePlan({
      title: "x",
      summary: "y",
      stages: [
        { title: "Empty", description: "", steps: [] },
        { title: "Real", description: "", steps: [step("A")] },
      ],
    });
    expect(plan?.stages.map((s) => s.title)).toEqual(["Real"]);
    expect(parsePlan({ title: "x", stages: [{ title: "E", steps: [] }] })).toBeNull();
    expect(parsePlan({ nonsense: true })).toBeNull();
  });
});

describe("mergePlan", () => {
  const current = {
    stages: [
      { id: "s1", steps: [{ id: "a" }, { id: "b" }] },
      { id: "s2", steps: [{ id: "c" }] },
    ],
  };

  it("keeps known ids, creates new ones, deletes what was left out", () => {
    const plan = parsePlan({
      title: "t",
      stages: [
        { id: "s1", title: "One", steps: [step("A", { id: "a" }), step("New")] },
        { title: "Fresh", steps: [step("C moved", { id: "c", findResources: true })] },
      ],
    })!;
    const m = mergePlan(current, plan);
    expect(m.stages.map((s) => s.id)).toEqual(["s1", null]);
    expect(m.stages[0]!.steps.map((t) => [t.id, t.research])).toEqual([
      ["a", false],
      [null, true],
    ]);
    // A step moved into a new stage keeps its id (and so its status and resources).
    expect(m.stages[1]!.steps[0]).toMatchObject({ id: "c", research: true });
    expect(m.deleteStepIds).toEqual(["b"]);
    expect(m.deleteStageIds).toEqual(["s2"]);
  });

  it("treats unknown and repeated ids as new", () => {
    const plan = parsePlan({
      title: "t",
      stages: [
        { id: "s1", title: "One", steps: [step("A", { id: "a" }), step("A again", { id: "a" })] },
        { id: "s1", title: "Dup", steps: [step("X", { id: "made-up" })] },
      ],
    })!;
    const m = mergePlan(current, plan);
    expect(m.stages.map((s) => s.id)).toEqual(["s1", null]);
    expect(m.stages[0]!.steps.map((t) => t.id)).toEqual(["a", null]);
    expect(m.stages[1]!.steps[0]!.id).toBeNull();
    expect(m.deleteStepIds.sort()).toEqual(["b", "c"]);
  });

  it("falls back to the title when a step has no queries", () => {
    const plan = parsePlan({
      title: "t",
      stages: [{ title: "S", steps: [step("Helm charts", { searchQueries: [] })] }],
    })!;
    expect(mergePlan({ stages: [] }, plan).stages[0]!.steps[0]!.searchQueries).toEqual([
      "Helm charts",
    ]);
  });
});

describe("parsePicks", () => {
  const results = new Map<string, SearchResult>([
    ["r1", { title: "Docs", url: "https://kubernetes.io/docs/", description: "" }],
    ["r2", { title: "Blog", url: "https://example.com/post", description: "" }],
  ]);

  it("only accepts real result ids and takes the URL from the result", () => {
    const picks = parsePicks(
      {
        steps: [
          {
            step: "0.0",
            resources: [
              { result: "r1", title: "K8s docs", kind: "DOCS", note: "Start here" },
              { result: "r9", title: "Invented", kind: "ARTICLE", note: "x" },
              { result: "r2", url: "https://evil.example", title: "", kind: "WEIRD", note: "" },
            ],
          },
          { step: "unknown", resources: [{ result: "r1", title: "x", kind: "DOCS", note: "" }] },
        ],
      },
      new Set(["0.0"]),
      results,
    );
    expect([...picks.keys()]).toEqual(["0.0"]);
    expect(picks.get("0.0")).toEqual([
      {
        title: "K8s docs",
        url: "https://kubernetes.io/docs/",
        kind: "DOCS",
        note: "Start here",
        origin: "SEARCH",
      },
      {
        title: "Blog",
        url: "https://example.com/post",
        kind: "OTHER",
        note: null,
        origin: "SEARCH",
      },
    ]);
  });

  it("drops links the step already has, repeats and anything past the limit", () => {
    const many = Array.from({ length: PICKS_MAX + 3 }, (_, i) => ({
      url: `https://site${i}.example/x`,
      title: `T${i}`,
      kind: "ARTICLE",
      note: "n",
    }));
    const picks = parsePicks(
      {
        steps: [
          {
            step: "s",
            resources: [
              { url: "http://www.kubernetes.io/docs#intro", title: "dup", kind: "DOCS", note: "" },
              { url: "javascript:alert(1)", title: "bad", kind: "DOCS", note: "" },
              many[0],
              many[0],
              ...many,
            ],
          },
        ],
      },
      new Set(["s"]),
      null,
      new Map([["s", new Set([urlKey("https://kubernetes.io/docs/")])]]),
    );
    const list = picks.get("s")!;
    expect(list).toHaveLength(PICKS_MAX);
    expect(list[0]).toMatchObject({ url: "https://site0.example/x", origin: "AI" });
    expect(new Set(list.map((r) => r.url)).size).toBe(PICKS_MAX);
  });

  it("returns nothing for garbage", () => {
    expect(parsePicks("nope", new Set(["s"]), results).size).toBe(0);
  });
});

describe("parseStepRevision", () => {
  it("needs the flag and a summary", () => {
    expect(
      parseStepRevision({
        title: "T",
        description: "",
        practice: "p",
        findResources: true,
        searchQueries: ["a", "b", "c", "d"],
        changeSummary: "Looked for videos.",
      }),
    ).toMatchObject({ description: null, searchQueries: ["a", "b", "c"] });
    expect(parseStepRevision({ title: "T", changeSummary: "x" })).toBeNull();
  });
});

describe("helpers", () => {
  it("compares URLs loosely", () => {
    expect(urlKey("https://www.Example.com/a/")).toBe(urlKey("http://example.com/a#x"));
    expect(urlKey("https://example.com/a?b=1")).not.toBe(urlKey("https://example.com/a"));
  });

  it("computes progress", () => {
    expect(progress([{ status: "DONE" }, { status: "DOING" }, { status: "TODO" }])).toEqual({
      done: 1,
      doing: 1,
      total: 3,
      percent: 33,
    });
    expect(progress([]).percent).toBe(0);
  });

  it("parses Brave results as plain text and skips non-web links", () => {
    expect(stripTags("<strong>Pods</strong> &amp; nodes")).toBe("Pods & nodes");
    expect(
      parseBrave({
        web: {
          results: [
            { title: "<strong>K8s</strong>", url: "https://k8s.io", description: "a <b>b</b>" },
            { title: "x", url: "ftp://nope" },
          ],
        },
      }),
    ).toEqual([{ title: "K8s", url: "https://k8s.io", description: "a b" }]);
    expect(parseBrave({})).toEqual([]);
  });
});

describe("prompts", () => {
  it("carry the tutor rules and the ids the model must keep", () => {
    for (const p of [ROADMAP_SYSTEM, ROADMAP_REVISE_SYSTEM, PICK_SYSTEM])
      expect(p).toContain("Never give a complete solution");
    const prompt = roadmapRevisePrompt(
      {
        title: "T",
        summary: null,
        prompt: "learn k8s",
        stages: [
          {
            id: "stage-1",
            title: "S",
            description: null,
            steps: [
              {
                id: "step-1",
                title: "Pods",
                description: null,
                practice: null,
                status: "DONE",
                resources: [{ title: "Docs", url: "https://k8s.io" }],
              },
            ],
          },
        ],
      },
      "add videos",
      { title: "S" },
    );
    expect(prompt).toContain('"id": "step-1"');
    expect(prompt).toContain('"status": "DONE"');
    expect(prompt).toContain('about the stage "S"');
    expect(prompt).toMatch(/add videos$/);
  });

  it("lists search results with their ids", () => {
    const p = pickPrompt(
      [
        {
          key: "0.0",
          title: "Pods",
          description: null,
          stage: "Basics",
          existing: [{ title: "Old", url: "https://old.example" }],
          results: [{ id: "r1", title: "Docs", url: "https://k8s.io", description: "d" }],
        },
      ],
      "more videos",
    );
    expect(p).toContain('<step key="0.0">');
    expect(p).toContain("[r1] Docs — https://k8s.io");
    expect(p).toContain("Already on this step:\n- Old (https://old.example)");
    expect(p).toContain("more videos");
  });
});

describe("export", () => {
  const now = "2026-10-22T10:00:00.000Z";
  const data = {
    roadmaps: [{ id: "r", title: "T", prompt: "p", createdAt: now, updatedAt: now }],
    roadmapStages: [{ id: "s", roadmapId: "r", position: 0, title: "S" }],
    roadmapSteps: [{ id: "t", stageId: "s", position: 0, title: "T", status: "DOING" }],
    roadmapResources: [
      {
        id: "x",
        stepId: "t",
        position: 0,
        title: "Docs",
        url: "https://k8s.io",
        kind: "DOCS",
        origin: "SEARCH",
        createdAt: now,
      },
    ],
    roadmapEdits: [{ id: "e", roadmapId: "r", instruction: "i", summary: "s", createdAt: now }],
  };

  it("round-trips roadmap tables and checks their references", () => {
    const parsed = exportSchema.parse({ format: "studee-budee-export", version: 1, data });
    expect(parsed.data.roadmapSteps[0]).toMatchObject({ description: null, practice: null });
    expect(() => checkReferences(parsed.data)).not.toThrow();
    const broken = exportSchema.parse({
      format: "studee-budee-export",
      version: 1,
      data: { ...data, roadmapSteps: [{ ...data.roadmapSteps[0], stageId: "missing" }] },
    });
    expect(() => checkReferences(broken.data)).toThrow(/roadmap step t points to missing/);
  });

  it("still imports older exports without roadmaps", () => {
    const parsed = exportSchema.parse({ format: "studee-budee-export", version: 1, data: {} });
    expect(parsed.data.roadmaps).toEqual([]);
  });
});
