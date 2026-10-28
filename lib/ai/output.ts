// JSON shapes the model is asked for (Gemini response schemas) and their validators.
// Pure, so the client can use the types.

import { z } from "zod";
import type { GeminiSchema } from "./gemini";
import { CARDS_MAX, CARDS_MIN, QUIZ_COUNT } from "./prompts";

const str = (description?: string): GeminiSchema => ({ type: "STRING", description });

export const QUIZ_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      minItems: QUIZ_COUNT,
      maxItems: QUIZ_COUNT,
      items: {
        type: "OBJECT",
        properties: { question: str(), noteId: str("id of the note it's based on") },
        required: ["question", "noteId"],
      },
    },
  },
  required: ["questions"],
};

export const VERDICTS = ["correct", "partial", "wrong"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const GRADE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    grades: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          verdict: { type: "STRING", enum: [...VERDICTS] },
          feedback: str(),
          answer: str("concise correct answer, for a flashcard"),
        },
        required: ["verdict", "feedback", "answer"],
      },
    },
  },
  required: ["grades"],
};

export const CARDS_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    cards: {
      type: "ARRAY",
      minItems: CARDS_MIN,
      maxItems: CARDS_MAX,
      items: {
        type: "OBJECT",
        properties: { front: str(), back: str() },
        required: ["front", "back"],
      },
    },
  },
  required: ["cards"],
};

const text = z.string().trim().min(1);

export type QuizQuestion = { question: string; noteId: string | null };
export type Grade = { verdict: Verdict; feedback: string; answer: string };
export type CardDraft = { front: string; back: string };

/** Keeps the first `QUIZ_COUNT` questions; a note id the model made up becomes null. */
export function parseQuiz(data: unknown, noteIds: Set<string>): QuizQuestion[] | null {
  const parsed = z
    .object({ questions: z.array(z.object({ question: text, noteId: z.string().nullish() })) })
    .safeParse(data);
  if (!parsed.success || !parsed.data.questions.length) return null;
  return parsed.data.questions.slice(0, QUIZ_COUNT).map((q) => ({
    question: q.question,
    noteId: q.noteId && noteIds.has(q.noteId) ? q.noteId : null,
  }));
}

/** One grade per question, in order; anything else is rejected. */
export function parseGrades(data: unknown, count: number): Grade[] | null {
  const parsed = z
    .object({
      grades: z.array(
        z.object({
          verdict: z.enum(VERDICTS),
          feedback: text,
          answer: z.string().trim().default(""),
        }),
      ),
    })
    .safeParse(data);
  if (!parsed.success || parsed.data.grades.length < count) return null;
  return parsed.data.grades.slice(0, count);
}

export function parseCards(data: unknown): CardDraft[] | null {
  const parsed = z
    .object({ cards: z.array(z.object({ front: text, back: text })) })
    .safeParse(data);
  if (!parsed.success || !parsed.data.cards.length) return null;
  return parsed.data.cards.slice(0, CARDS_MAX);
}
