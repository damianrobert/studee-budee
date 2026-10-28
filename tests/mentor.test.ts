import { describe, expect, it } from "vitest";
import { EXPORT_FORMAT, parseExport } from "@/lib/export-format";
import { requestBody } from "@/lib/ai/gemini";
import {
  HISTORY_MESSAGES,
  MEMORY_MAX,
  cleanMemory,
  parseIdeas,
  parseTopics,
  trimHistory,
  type MentorFacts,
  type MentorTurn,
} from "@/lib/ai/mentor";
import {
  IDEAS_SYSTEM,
  MEMORY_SYSTEM,
  MENTOR_NUDGE_RULES,
  MENTOR_SOLUTION_RULES,
  TOPICS_SYSTEM,
  ideasPrompt,
  memoryPrompt,
  mentorContextBlock,
  mentorSystem,
  mentorTurnText,
} from "@/lib/ai/prompts";

const facts: MentorFacts = {
  name: "Homelab GitOps",
  status: "ACTIVE",
  goal: "Argo CD deploys every app from the repo",
  description: "A k3s cluster on two old laptops.",
  repoUrl: "https://github.com/me/homelab",
  topics: [
    { title: "Argo CD sync", description: null, stage: "DONE", notes: 2, postmortems: 1 },
    {
      title: "Ingress",
      description: "Why can't I reach it?",
      stage: "BUILD",
      notes: 1,
      postmortems: 0,
    },
    { title: "Secrets", description: null, stage: "PAIN", notes: 0, postmortems: 0 },
  ],
  sessions: [
    {
      day: "2026-10-22",
      durationMin: 45,
      stage: "BUILD",
      topic: "Ingress",
      summary: "Installed Traefik",
      nextStep: "Find out why the 404 happens",
      producedOutput: false,
    },
  ],
  notes: [{ title: "Ingress basics", explainIt: true, topic: "Ingress", excerpt: "An ingress…" }],
  postmortems: [],
  memory: "## Where it stands\nWorking on ingress.",
  memoryAt: new Date("2026-10-22T10:00:00Z"),
};

const NEVER_SOLVE = "Never give a complete solution";

describe("mentor prompts", () => {
  it("nudges by default and carries the tutor rules", () => {
    const system = mentorSystem(facts, false);
    expect(system).toContain(NEVER_SOLVE);
    expect(system).toContain(MENTOR_NUDGE_RULES);
    expect(system).toContain('tick "Give me the solution"');
    expect(system).not.toContain(MENTOR_SOLUTION_RULES);
  });

  it("only gives the solution when it was asked for", () => {
    const system = mentorSystem(facts, true);
    expect(system).toContain(MENTOR_SOLUTION_RULES);
    expect(system).not.toContain(NEVER_SOLVE);
    expect(system).not.toContain(MENTOR_NUDGE_RULES);
  });

  it("knows the project and its memory either way", () => {
    for (const solution of [false, true]) {
      const system = mentorSystem(facts, solution);
      expect(system).toContain("Name: Homelab GitOps");
      expect(system).toContain("next: Find out why the 404 happens");
      expect(system).toContain("<memory>\n## Where it stands\nWorking on ingress.\n</memory>");
    }
    expect(mentorSystem({ ...facts, memory: null }, false)).toContain("first conversation");
  });

  it("lists topics in loop order with their counts", () => {
    const block = mentorContextBlock(facts);
    const pain = block.indexOf("[Pain] Secrets");
    const build = block.indexOf("[Build] Ingress — Why can't I reach it? (1 note)");
    const done = block.indexOf("[Done] Argo CD sync (2 notes, 1 postmortem)");
    expect(pain).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(pain);
    expect(done).toBeGreaterThan(build);
    expect(block).toContain('- "Ingress basics" (explain-it) · topic: Ingress: An ingress…');
    expect(block).toContain("Postmortems:\n(none yet)");
  });

  it("marks questions that unlocked a solution", () => {
    const asked: MentorTurn = { role: "USER", content: "Show me", solution: true };
    expect(mentorTurnText(asked)).toBe("[Asked for the solution]\nShow me");
    expect(mentorTurnText({ ...asked, solution: false })).toBe("Show me");
    expect(mentorTurnText({ ...asked, role: "MENTOR" })).toBe("Show me");
  });

  it("asks for memory notes without solutions in them", () => {
    expect(MEMORY_SYSTEM).toContain("Never put code, configs or solutions in the notes");
    const prompt = memoryPrompt(facts, [
      { role: "USER", content: "Why the 404?", solution: false },
      { role: "MENTOR", content: "Which host header did you send?", solution: false },
    ]);
    expect(prompt).toContain("<learner>\nWhy the 404?\n</learner>");
    expect(prompt).toContain("<mentor>\nWhich host header did you send?\n</mentor>");
    expect(prompt).toContain("Working on ingress.");
    expect(memoryPrompt(facts, [])).toContain("build the notes from the app's facts");
  });

  it("idea and topic prompts carry the tutor rules and avoid repeats", () => {
    expect(IDEAS_SYSTEM).toContain(NEVER_SOLVE);
    expect(TOPICS_SYSTEM).toContain(NEVER_SOLVE);
    const prompt = ideasPrompt({
      wish: "",
      projects: [{ name: "Homelab GitOps", goal: null }],
      doneTopics: ["Argo CD sync"],
      roadmaps: [],
      exclude: ["Log pipeline"],
    });
    expect(prompt).toContain("surprise me");
    expect(prompt).toContain("- Homelab GitOps");
    expect(prompt).toContain("suggest different ones):\n- Log pipeline");
  });

  it("sends the conversation as turns before the new question", () => {
    const body = requestBody("gemini-3.5-flash", {
      system: "s",
      history: [
        { role: "user", text: "a" },
        { role: "model", text: "b" },
      ],
      prompt: "c",
    });
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "a" }] },
      { role: "model", parts: [{ text: "b" }] },
      { role: "user", parts: [{ text: "c" }] },
    ]);
  });
});

describe("mentor output", () => {
  const idea = {
    name: "Self-hosted status page",
    pitch: "Know when your homelab is down.",
    goal: "A public page shows the state of every service.",
    description: "- Probes every service\n- Alerts on Telegram",
    skills: [" prometheus ", "", "grafana"],
    topics: [
      { title: "Blackbox probes", description: "What counts as up?" },
      { title: "", description: "no title" },
      { nope: true },
    ],
  };

  it("parses ideas, dropping broken topics and empty skills", () => {
    const ideas = parseIdeas({ ideas: [idea, idea, idea, idea, idea] })!;
    expect(ideas).toHaveLength(4);
    expect(ideas[0]!.skills).toEqual(["prometheus", "grafana"]);
    expect(ideas[0]!.topics).toEqual([
      { title: "Blackbox probes", description: "What counts as up?" },
    ]);
    expect(parseIdeas({ ideas: [] })).toBeNull();
    expect(parseIdeas({ ideas: [{ ...idea, name: "" }] })).toBeNull();
    expect(parseIdeas("garbage")).toBeNull();
  });

  it("parses starter topics, capped", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, description: "" }));
    expect(parseTopics({ topics: many })).toHaveLength(8);
    expect(parseTopics({ topics: [{ title: " " }] })).toBeNull();
  });

  it("cleans the memory", () => {
    expect(cleanMemory("```markdown\n## Done\n- x\n```")).toBe("## Done\n- x");
    expect(cleanMemory("  \n")).toBeNull();
    expect(cleanMemory("x".repeat(MEMORY_MAX + 10))).toMatch(/\[…cut\]$/);
  });
});

describe("mentor history", () => {
  const turn = (role: "USER" | "MENTOR", content: string): MentorTurn => ({
    role,
    content,
    solution: false,
  });

  it("keeps the latest messages, oldest first, opening with a question", () => {
    const newestFirst = [turn("MENTOR", "a4"), turn("USER", "q4"), turn("MENTOR", "a3")];
    expect(trimHistory(newestFirst).map((m) => m.content)).toEqual(["q4", "a4"]);
  });

  it("stays within the budget and the message limit", () => {
    const newestFirst = [
      turn("MENTOR", "x".repeat(30)),
      turn("USER", "y".repeat(30)),
      turn("MENTOR", "z"),
    ];
    expect(trimHistory(newestFirst, 70).map((m) => m.content.length)).toEqual([30, 30]);
    expect(trimHistory(newestFirst, 40)).toEqual([]);
    const long = Array.from({ length: 50 }, (_, i) => turn(i % 2 ? "USER" : "MENTOR", `${i}`));
    expect(trimHistory(long).length).toBeLessThanOrEqual(HISTORY_MESSAGES);
  });
});

describe("mentor export", () => {
  const T = "2026-10-22T10:00:00.000Z";
  const file = (data: Record<string, unknown>) => ({ format: EXPORT_FORMAT, version: 1, data });
  const project = { id: "p1", name: "P", status: "ACTIVE", createdAt: T, updatedAt: T };

  it("imports messages and memory, and older exports without them", () => {
    const f = parseExport(
      file({
        projects: [{ ...project, mentorMemory: "## Done", mentorMemoryAt: T }],
        mentorMessages: [{ id: "m1", projectId: "p1", role: "USER", content: "hi", createdAt: T }],
      }),
    );
    expect(f.data.projects[0]!.mentorMemoryAt).toEqual(new Date(T));
    expect(f.data.mentorMessages[0]!.solution).toBe(false);

    const old = parseExport(file({ projects: [project] }));
    expect(old.data.projects[0]!.mentorMemory).toBeNull();
    expect(old.data.mentorMessages).toEqual([]);
  });

  it("refuses messages of a missing project", () => {
    expect(() =>
      parseExport(
        file({
          projects: [project],
          mentorMessages: [
            { id: "m1", projectId: "p9", role: "MENTOR", content: "x", createdAt: T },
          ],
        }),
      ),
    ).toThrow(/mentor message m1 points to missing p9/);
  });
});
