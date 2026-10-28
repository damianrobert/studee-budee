import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCoursePlan } from "@/lib/ai/course";
import { COURSE_SYSTEM, coursePrompt } from "@/lib/ai/prompts";
import { gatherPromptBody } from "@/lib/course-templates";
import {
  courseProgress,
  embedUrl,
  fmtTimestamp,
  librarySummary,
  moduleRows,
  nextItem,
  parseResourcesFile,
  parseTimestamp,
  planByTopic,
  practiceKey,
  typeFromName,
  unusedKeys,
  type Library,
} from "@/lib/courses";
import { checkReferences, exportSchema } from "@/lib/export-format";

const template = (name: string) => readFileSync(path.join(__dirname, "../templates", name), "utf8");

function library(text: string): Library {
  const res = parseResourcesFile(text);
  if (!res.ok) throw new Error(res.errors.join("\n"));
  return res.library;
}

const small = `
subject: Docker
topics:
  - { id: basics, title: Basics }
  - { id: compose, title: Compose }
resources:
  videos:
    - id: v1
      title: Docker in 100 seconds
      url: https://www.youtube.com/watch?v=abc123
      minutes: 2
      topics: [basics]
      start: "0:10"
      end: "1:40"
  docs:
    - { id: d1, title: Get started, url: docs.docker.com/get-started/, minutes: 20, topics: [basics] }
    - { id: d2, title: Compose file, url: https://docs.docker.com/compose/, topics: [compose] }
  tools:
    - { id: t1, title: Play with Docker, url: https://labs.play-with-docker.com/, topics: [basics] }
`;

describe("parseResourcesFile", () => {
  it("reads the example resources file", () => {
    const res = parseResourcesFile(template("resources-template.yaml"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings).toEqual([]);
    expect(res.library.subject).toBe("Kubernetes fundamentals");
    expect(res.library.topics).toHaveLength(7);
    expect(res.library.resources).toHaveLength(17);
    expect(res.library.resources.find((r) => r.key === "nana-k8s-full-course")).toMatchObject({
      type: "VIDEO",
      minutes: 240,
      author: "TechWorld with Nana",
    });
    expect(librarySummary(res.library)).toMatch(/^17 resources in 7 topics: .*11 docs/);
  });

  it("maps groups to types, normalizes links and parses timestamps", () => {
    const lib = library(small);
    expect(lib.resources.map((r) => r.type)).toEqual(["VIDEO", "DOCS", "DOCS", "TOOL"]);
    expect(lib.resources[0]).toMatchObject({ startSec: 10, endSec: 100 });
    expect(lib.resources[1]!.url).toBe("https://docs.docker.com/get-started/");
  });

  it("accepts JSON with one list of typed resources and builds topics from them", () => {
    const lib = library(
      JSON.stringify({
        subject: "Go",
        resources: [
          { id: 1, type: "article", title: "Tour", url: "https://go.dev/tour", topic: "intro" },
          { id: "b", type: "Book", title: "Book", url: "https://gobyexample.com", topics: "intro" },
        ],
      }),
    );
    expect(lib.resources.map((r) => [r.key, r.type, r.topics])).toEqual([
      ["1", "ARTICLE", ["intro"]],
      ["b", "BOOK", ["intro"]],
    ]);
    expect(lib.topics).toEqual([{ key: "intro", title: "intro", level: null }]);
  });

  it("says where the problems are", () => {
    const res = parseResourcesFile(`
resources:
  videos:
    - { id: a, title: A, url: https://a.dev }
    - { id: a, title: B, url: https://b.dev }
    - { id: c, title: C }
    - { id: d, title: D, url: "not a link" }
`);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toEqual([
      "resources › videos #2 (“a”): the id is used twice.",
      "resources › videos #3 › url: is missing",
      "resources › videos #4 (“d”): “not a link” isn't a web link.",
    ]);
  });

  it("rejects broken YAML and empty files", () => {
    expect(parseResourcesFile("resources: [")).toMatchObject({ ok: false });
    expect(parseResourcesFile("  ")).toEqual({ ok: false, errors: ["The file is empty."] });
    expect(parseResourcesFile("subject: x\nresources: {}")).toMatchObject({
      ok: false,
      errors: ["resources: there are no resources."],
    });
  });

  it("warns about unknown topics, duplicate links and reversed timestamps", () => {
    const res = parseResourcesFile(`
topics: [{ id: a, title: A }]
resources:
  docs:
    - { id: x, title: X, url: https://x.dev/page, topics: [a, nope] }
    - { id: y, title: Y, url: "https://www.x.dev/page/", start: "2:00", end: "1:00" }
`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings).toHaveLength(3);
    expect(res.library.resources[0]!.topics).toEqual(["a"]);
    expect(res.library.resources[1]).toMatchObject({ startSec: null, endSec: null });
  });
});

describe("helpers", () => {
  it("parses and formats timestamps", () => {
    expect(parseTimestamp("2:10")).toBe(130);
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp(90)).toBe(90);
    expect(parseTimestamp("90")).toBe(90);
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("soon")).toBeNull();
    expect(fmtTimestamp(130)).toBe("2:10");
    expect(fmtTimestamp(3723)).toBe("1:02:03");
  });

  it("names types from group names", () => {
    expect(typeFromName("videos")).toBe("VIDEO");
    expect(typeFromName("Documentation")).toBe("DOCS");
    expect(typeFromName("labs")).toBe("TUTORIAL");
    expect(typeFromName("podcasts")).toBe("OTHER");
  });

  it("embeds YouTube and Vimeo only", () => {
    expect(embedUrl("https://www.youtube.com/watch?v=abc", 10, 100)).toBe(
      "https://www.youtube-nocookie.com/embed/abc?start=10&end=100&rel=0",
    );
    expect(embedUrl("https://youtu.be/xyz?t=42")).toBe(
      "https://www.youtube-nocookie.com/embed/xyz?start=42&rel=0",
    );
    expect(embedUrl("https://www.youtube.com/playlist?list=PL1")).toBe(
      "https://www.youtube-nocookie.com/embed/videoseries?list=PL1&rel=0",
    );
    expect(embedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
    expect(embedUrl("https://example.com/video")).toBeNull();
  });

  it("reads the gather prompt below the --- line", () => {
    const body = gatherPromptBody(template("prompt-1-gather-resources.md"));
    expect(body).toMatch(/^You are a research assistant/);
    expect(body).toContain("Never guess or reconstruct a URL");
  });
});

describe("planByTopic", () => {
  it("makes one module per topic, places every resource once and marks tools extra", () => {
    const lib = library(template("resources-template.yaml"));
    const plan = planByTopic(lib);
    expect(plan.modules.map((m) => m.title)).toEqual(lib.topics.map((t) => t.title));
    const keys = plan.modules.flatMap((m) => m.items.map((i) => i.resourceKey));
    expect(new Set(keys).size).toBe(17);
    expect(unusedKeys(lib, plan)).toEqual([]);
    const tool = plan.modules
      .flatMap((m) => m.items)
      .find((i) => i.resourceKey === "killercoda-playground");
    expect(tool?.required).toBe(false);
  });

  it("orders overview before reference and lists empty topics as gaps", () => {
    const lib = library(`
topics: [{ id: a, title: A }, { id: b, title: Empty }]
resources:
  tutorials: [{ id: t, title: T, url: https://t.dev, topics: [a] }]
  docs: [{ id: d, title: D, url: https://d.dev, topics: [a] }]
  videos: [{ id: v, title: V, url: https://v.dev, topics: [a] }]
  articles: [{ id: loose, title: L, url: https://l.dev }]
`);
    const plan = planByTopic(lib);
    expect(plan.modules[0]!.items.map((i) => i.resourceKey)).toEqual(["v", "d", "t"]);
    expect(plan.modules[1]).toMatchObject({ title: "More resources" });
    expect(plan.modules[1]!.items[0]!.required).toBe(false);
    expect(plan.gaps).toEqual(["Empty: no resources in the file"]);
  });
});

describe("parseCoursePlan", () => {
  const lib = library(small);

  it("keeps only resources from the file, once per module", () => {
    const plan = parseCoursePlan(
      {
        title: " Docker ",
        description: "d",
        level: "Beginner",
        outcomes: ["run containers", "run containers", ""],
        modules: [
          {
            title: "Basics",
            goal: "g",
            items: [
              { resource: "v1", required: false, why: "w" },
              { resource: "made-up", required: true, why: "x" },
              { resource: "v1", required: true, why: "again" },
              { resource: " d1 ", required: false, why: "", sections: ["Part 1", "Part 1"] },
            ],
            practice: [
              { stage: "pain", task: "Run nginx by hand", doneWhen: "curl works" },
              { stage: "weird", task: "Build it", doneWhen: "" },
              { stage: "BREAK", task: "", doneWhen: "x" },
            ],
            checkpoint: [
              { question: "Why?", answer: "Because." },
              { question: "No answer", answer: "" },
            ],
          },
          {
            title: "Ghost",
            goal: "",
            items: [{ resource: "nope", required: true, why: "" }],
            practice: [],
            checkpoint: [],
          },
        ],
        gaps: ["Networking"],
      },
      lib,
    );
    expect(plan).not.toBeNull();
    expect(plan!.title).toBe("Docker");
    expect(plan!.level).toBe("beginner");
    expect(plan!.outcomes).toEqual(["run containers"]);
    expect(plan!.modules).toHaveLength(1);
    const m = plan!.modules[0]!;
    expect(m.items.map((i) => i.resourceKey)).toEqual(["v1", "d1"]);
    // A module without required items gets its first one required.
    expect(m.items[0]!.required).toBe(true);
    expect(m.items[1]!.sections).toEqual(["Part 1"]);
    expect(m.practice.map((p) => p.stage)).toEqual(["PAIN", "BUILD"]);
    expect(m.checkpoints).toEqual([{ question: "Why?", answer: "Because." }]);
    expect(plan!.gaps).toEqual(["Networking"]);
  });

  it("returns null when nothing usable is left", () => {
    expect(parseCoursePlan({ modules: [] }, lib)).toBeNull();
    expect(
      parseCoursePlan({ modules: [{ title: "x", items: [{ resource: "zzz" }] }] }, lib),
    ).toBeNull();
    expect(parseCoursePlan("garbage", lib)).toBeNull();
  });
});

describe("moduleRows and progress", () => {
  const lib = library(small);
  const plan = planByTopic(lib);
  plan.modules[0]!.practice = [{ stage: "BUILD", task: "Run  NGINX", doneWhen: null }];

  it("fills in resource details and carries progress over by resource id and task text", () => {
    const done = new Date("2026-10-01T10:00:00Z");
    const rows = moduleRows(plan, lib, {
      items: new Map([["d1", done]]),
      practice: new Map([[practiceKey("run nginx"), done]]),
    });
    const items = rows.flatMap((m) => m.items);
    expect(items.find((i) => i.resourceKey === "d1")).toMatchObject({
      title: "Get started",
      type: "DOCS",
      minutes: 20,
      doneAt: done,
    });
    expect(items.find((i) => i.resourceKey === "v1")).toMatchObject({ startSec: 10, doneAt: null });
    expect(rows[0]!.practice[0]!.doneAt).toBe(done);
  });

  it("counts required items, time left and the next one", () => {
    const d = new Date();
    const items = [
      { id: "a", required: true, doneAt: d, minutes: 10 },
      { id: "b", required: true, doneAt: null, minutes: 25 },
      { id: "c", required: false, doneAt: d, minutes: 5 },
      { id: "e", required: true, doneAt: null, minutes: null },
    ];
    expect(courseProgress(items)).toEqual({
      done: 1,
      total: 3,
      percent: 33,
      extraDone: 1,
      minutesLeft: 25,
    });
    expect(nextItem([{ items: [items[0]!, items[2]!] }, { items: [items[1]!] }])?.id).toBe("b");
    expect(nextItem([{ items: [items[0]!] }])).toBeNull();
  });
});

describe("course prompt", () => {
  it("lists resources by id with their facts and the learner's options", () => {
    const prompt = coursePrompt(library(small), { weeklyMinutes: 180, focus: "hands-on" });
    expect(prompt).toContain(
      "- v1: Docker in 100 seconds (Video, 2 min, from 0:10, to 1:40) [topics: basics]",
    );
    expect(prompt).toContain("about 180 minutes");
    expect(prompt).toContain("Focus: hands-on");
    expect(prompt).toContain("- compose: Compose");
    expect(COURSE_SYSTEM).toContain("Never invent a resource");
  });
});

describe("export format", () => {
  const data = {
    courses: [
      {
        id: "c",
        title: "Docker",
        subject: "Docker",
        source: "subject: Docker",
        build: "TOPICS",
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z",
      },
    ],
    courseModules: [{ id: "m", courseId: "c", position: 0, title: "Basics" }],
    courseItems: [
      {
        id: "i",
        moduleId: "m",
        position: 0,
        resourceKey: "v1",
        type: "VIDEO",
        title: "V",
        url: "https://v.dev",
        required: true,
      },
    ],
    coursePractice: [{ id: "p", moduleId: "m", position: 0, stage: "PAIN", task: "t" }],
    courseCheckpoints: [{ id: "q", moduleId: "m", position: 0, question: "q", answer: "a" }],
  };

  it("round-trips course tables and checks their references", () => {
    const parsed = exportSchema.parse({ format: "studee-budee-export", version: 1, data });
    expect(parsed.data.courses[0]).toMatchObject({ outcomes: [], gaps: [], weeklyMinutes: null });
    expect(parsed.data.courseItems[0]).toMatchObject({ doneAt: null, sections: [] });
    expect(() => checkReferences(parsed.data)).not.toThrow();
    const broken = exportSchema.parse({
      format: "studee-budee-export",
      version: 1,
      data: { ...data, courseItems: [{ ...data.courseItems[0], moduleId: "missing" }] },
    });
    expect(() => checkReferences(broken.data)).toThrow(/course resource i points to missing/);
  });

  it("still imports older exports without courses", () => {
    const parsed = exportSchema.parse({ format: "studee-budee-export", version: 1, data: {} });
    expect(parsed.data.courses).toEqual([]);
  });
});
