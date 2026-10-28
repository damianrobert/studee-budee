import { describe, expect, it } from "vitest";
import { SseParser, httpError, requestBody, responseText, thinkingConfig } from "@/lib/ai/gemini";
import { parseCards, parseGrades, parseQuiz } from "@/lib/ai/output";
import {
  CHECK_SYSTEM,
  GRADE_SYSTEM,
  QUIZ_SYSTEM,
  STUCK_SYSTEM,
  hintPrompt,
  notesBlock,
} from "@/lib/ai/prompts";
import {
  STUCK_WAIT_MS,
  defaultOutcome,
  hintWait,
  parseStuckNote,
  stuckNoteContent,
  stuckTitle,
  type StuckState,
} from "@/lib/ai/stuck";

const attempt: StuckState = {
  goal: "Get the app container to reach Postgres",
  tried: "Checked `docker ps`, both are up.\n\n## Not a heading of mine",
  happened: "ECONNREFUSED 127.0.0.1:5432",
  hints: [],
  outcome: null,
};

describe("stuck notes", () => {
  it("round-trips through the note content", () => {
    const withHints = { ...attempt, hints: ["Where does `localhost` point inside a container?"] };
    const parsed = parseStuckNote(stuckNoteContent(withHints));
    expect(parsed).toEqual({
      ...withHints,
      // Headings in user text are demoted so they can't add sections.
      tried: "Checked `docker ps`, both are up.\n\n### Not a heading of mine",
    });
  });

  it("keeps hints in order and reads the outcome", () => {
    const state = { ...attempt, hints: ["one", "two", "three"], outcome: "Used the service name." };
    const parsed = parseStuckNote(stuckNoteContent(state))!;
    expect(parsed.hints).toEqual(["one", "two", "three"]);
    expect(parsed.outcome).toBe("Used the service name.");
  });

  it("refuses a note edited out of shape", () => {
    expect(parseStuckNote("just some text")).toBeNull();
    const content = stuckNoteContent({ ...attempt, hints: ["a", "b"] }).replace(
      "## Hint 1",
      "## Hint 3",
    );
    expect(parseStuckNote(content)).toBeNull();
  });

  it("titles the note from the first line of the goal", () => {
    expect(stuckTitle("Fix DNS\nmore detail")).toBe("Stuck: Fix DNS");
    expect(stuckTitle("x".repeat(100))).toHaveLength("Stuck: ".length + 80);
  });

  it("unlocks a hint after 15 minutes", () => {
    const created = new Date("2026-10-22T10:00:00Z");
    expect(hintWait(created, created.getTime())).toBe(STUCK_WAIT_MS);
    expect(hintWait(created, created.getTime() + 14 * 60_000)).toBe(60_000);
    expect(hintWait(created, created.getTime() + 20 * 60_000)).toBe(0);
  });

  it("writes a default outcome", () => {
    expect(defaultOutcome(0)).toBe("Solved it without a hint.");
    expect(defaultOutcome(1)).toBe("Solved it after 1 hint.");
    expect(defaultOutcome(3)).toBe("Solved it after 3 hints.");
  });
});

describe("prompts", () => {
  it("tell the model to tutor, not solve", () => {
    for (const system of [STUCK_SYSTEM, CHECK_SYSTEM, QUIZ_SYSTEM, GRADE_SYSTEM])
      expect(system).toMatch(/Never give a complete solution/);
    expect(CHECK_SYSTEM).toMatch(/Do not rewrite the note/);
  });

  it("asks for progressively stronger hints and passes the earlier ones", () => {
    const first = hintPrompt(attempt, { topic: "Networking" });
    expect(first).toContain("Topic: Networking");
    expect(first).toContain("Hint 1 of 3");
    const third = hintPrompt({ ...attempt, hints: ["h1", "h2"] }, {});
    expect(third).toContain("Hint 3 of 3");
    expect(third).toContain("Hint 1: h1");
    expect(third).toContain("Hint 2: h2");
  });

  it("puts explain-it notes first and stays within the budget", () => {
    const notes = [
      { id: "a", title: "Plain", type: "NOTE" as const, content: "x".repeat(3000) },
      { id: "b", title: 'Say "hi"', type: "EXPLAIN_IT" as const, content: "y".repeat(3000) },
    ];
    const block = notesBlock(notes, 4000);
    expect(block.indexOf('id="b"')).toBeLessThan(block.indexOf('id="a"'));
    expect(block).toContain(`title="Say 'hi'" type="explain-it"`);
    expect(block).toContain("[…cut]");
    expect(block.length).toBeLessThan(4300);
  });
});

describe("model output", () => {
  it("keeps 5 questions and drops made-up note ids", () => {
    const data = {
      questions: Array.from({ length: 6 }, (_, i) => ({
        question: `Q${i}`,
        noteId: i ? "n1" : "zz",
      })),
    };
    const quiz = parseQuiz(data, new Set(["n1"]))!;
    expect(quiz).toHaveLength(5);
    expect(quiz[0]).toEqual({ question: "Q0", noteId: null });
    expect(quiz[1]!.noteId).toBe("n1");
    expect(parseQuiz({ questions: [] }, new Set())).toBeNull();
    expect(parseQuiz({ nope: 1 }, new Set())).toBeNull();
  });

  it("needs one grade per question", () => {
    const g = { verdict: "partial", feedback: "Missing the why.", answer: "Because…" };
    expect(parseGrades({ grades: [g, g] }, 2)).toHaveLength(2);
    expect(parseGrades({ grades: [g] }, 2)).toBeNull();
    expect(parseGrades({ grades: [{ ...g, verdict: "maybe" }] }, 1)).toBeNull();
  });

  it("caps cards at 8 and rejects empty sides", () => {
    const card = { front: "Q", back: "A" };
    expect(parseCards({ cards: Array(10).fill(card) })).toHaveLength(8);
    expect(parseCards({ cards: [{ front: " ", back: "A" }] })).toBeNull();
  });
});

describe("gemini client", () => {
  it("parses server-sent events split across chunks", () => {
    const p = new SseParser();
    expect(p.push('data: {"a":')).toEqual([]);
    expect(p.push('1}\r\n\r\ndata: {"b":2}\n\n')).toEqual(['{"a":1}', '{"b":2}']);
    expect(p.push('data: {"c":3}')).toEqual([]);
    expect(p.end()).toEqual(['{"c":3}']);
  });

  it("skips thought parts and reports blocked answers", () => {
    expect(
      responseText({
        candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "Hi" }] } }],
      }),
    ).toBe("Hi");
    expect(() => responseText({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(/refused/);
    expect(() => responseText({ candidates: [{ finishReason: "SAFETY" }] })).toThrow(/filters/);
  });

  it("turns HTTP errors into friendly messages", () => {
    expect(httpError(400, "API key not valid", "m").message).toMatch(/GOOGLE_GEMINI_API_KEY/);
    expect(httpError(404, "", "gemini-x").message).toMatch(/gemini-x.*GEMINI_MODEL/);
    expect(httpError(429, "", "m").status).toBe(429);
    expect(httpError(503, "", "m").message).toMatch(/trouble/);
  });

  it("sets thinking per model generation and asks for JSON with a schema", () => {
    expect(thinkingConfig("gemini-3.5-flash", "low")).toEqual({ thinkingLevel: "low" });
    expect(thinkingConfig("gemini-2.5-flash", "low")).toEqual({ thinkingBudget: 512 });
    const body = requestBody("gemini-3.5-flash", {
      system: "s",
      prompt: "p",
      schema: { type: "OBJECT" },
    });
    expect(body.systemInstruction.parts[0]!.text).toBe("s");
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT" },
    });
  });
});
