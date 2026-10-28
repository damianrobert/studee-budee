// The project mentor: project ideas, starter topics, the conversation and the mentor's memory.
// JSON shapes the model is asked for and their validators. Pure (no DB), so it's unit tested
// and the client can use the types.

import { z } from "zod";
import type { LoopStage } from "@prisma/client";
import type { GeminiSchema } from "./gemini";

export const IDEA_COUNT = 4;
export const STARTER_TOPICS_MAX = 8;
/** Messages of the conversation sent with each question; older ones live in the memory. */
export const HISTORY_MESSAGES = 20;
export const HISTORY_BUDGET = 40_000;
export const MEMORY_MAX = 8_000;

const str = (description?: string): GeminiSchema => ({ type: "STRING", description });

const topicSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    title: str("at most 8 words"),
    description: str("1–2 sentences: what to figure out, phrased as the problem, not the answer"),
  },
  required: ["title", "description"],
};

// No maxItems on the nested arrays: Gemini refuses schemas with nested limits (see roadmap.ts).
export const IDEAS_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    ideas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: str("at most 6 words"),
          pitch: str("one sentence"),
          goal: str("what done looks like, observable, 1–2 sentences"),
          description: str("markdown: what to build and its scope, not how"),
          skills: { type: "ARRAY", items: { type: "STRING" } },
          topics: { type: "ARRAY", items: topicSchema },
        },
        required: ["name", "pitch", "goal", "description", "skills", "topics"],
      },
    },
  },
  required: ["ideas"],
};

export const TOPICS_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: { topics: { type: "ARRAY", items: topicSchema } },
  required: ["topics"],
};

export type StarterTopic = { title: string; description: string };
export type ProjectIdea = {
  name: string;
  pitch: string;
  goal: string;
  description: string;
  skills: string[];
  topics: StarterTopic[];
};

const text = z.string().trim().min(1);
const topic = z.object({ title: text.max(200), description: z.string().trim().max(2_000) });
const topics = z.array(z.unknown()).transform((items) =>
  items
    .flatMap((t) => {
      const parsed = topic.safeParse(t);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, STARTER_TOPICS_MAX),
);

export function parseIdeas(data: unknown): ProjectIdea[] | null {
  const parsed = z
    .object({
      ideas: z.array(
        z.object({
          name: text.max(200),
          pitch: text,
          goal: text.max(2_000),
          description: text,
          skills: z.array(z.string()).default([]),
          topics,
        }),
      ),
    })
    .safeParse(data);
  if (!parsed.success || !parsed.data.ideas.length) return null;
  return parsed.data.ideas.slice(0, IDEA_COUNT).map((i) => ({
    ...i,
    skills: i.skills
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
  }));
}

export function parseTopics(data: unknown): StarterTopic[] | null {
  const parsed = z.object({ topics }).safeParse(data);
  if (!parsed.success || !parsed.data.topics.length) return null;
  return parsed.data.topics;
}

// --- Conversation

export type MentorTurn = { role: "USER" | "MENTOR"; content: string; solution: boolean };

/**
 * The latest messages that fit the budget, oldest first, starting with a question (the model
 * wants the conversation to open with the user).
 */
export function trimHistory<T extends MentorTurn>(
  newestFirst: T[],
  budget = HISTORY_BUDGET,
  max = HISTORY_MESSAGES,
): T[] {
  const out: T[] = [];
  let left = budget;
  for (const m of newestFirst.slice(0, max)) {
    if (m.content.length > left) break;
    left -= m.content.length;
    out.push(m);
  }
  out.reverse();
  while (out.length && out[0]!.role !== "USER") out.shift();
  return out;
}

/** The memory as the model wrote it, minus a code fence around it; null when empty. */
export function cleanMemory(raw: string): string | null {
  let t = raw.trim();
  const fenced = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(t);
  if (fenced) t = fenced[1]!.trim();
  if (!t) return null;
  return t.length > MEMORY_MAX ? `${t.slice(0, MEMORY_MAX)}\n[…cut]` : t;
}

// --- What the mentor knows about a project

export type MentorFacts = {
  name: string;
  status: string;
  goal: string | null;
  description: string | null;
  repoUrl: string | null;
  topics: {
    title: string;
    description: string | null;
    stage: LoopStage;
    notes: number;
    postmortems: number;
  }[];
  sessions: {
    day: string;
    durationMin: number | null;
    stage: LoopStage | null;
    topic: string | null;
    summary: string | null;
    nextStep: string | null;
    producedOutput: boolean;
  }[];
  notes: { title: string; explainIt: boolean; topic: string | null; excerpt: string }[];
  postmortems: {
    title: string;
    deliberate: boolean;
    topic: string | null;
    rootCause: string;
    lessons: string;
  }[];
  memory: string | null;
  memoryAt: Date | null;
};
