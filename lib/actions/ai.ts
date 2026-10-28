"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { quizMaterial, type QuizScope } from "@/lib/ai/context";
import { generateJson } from "@/lib/ai/gemini";
import { runAi as run } from "@/lib/ai/run";
import {
  CARDS_SCHEMA,
  GRADE_SCHEMA,
  QUIZ_SCHEMA,
  parseCards,
  parseGrades,
  parseQuiz,
  type CardDraft,
  type Grade,
  type QuizQuestion,
} from "@/lib/ai/output";
import {
  CARDS_SYSTEM,
  GRADE_SYSTEM,
  QUIZ_COUNT,
  QUIZ_SYSTEM,
  cardsPrompt,
  gradePrompt,
  quizPrompt,
} from "@/lib/ai/prompts";
import {
  STUCK_TAG,
  defaultOutcome,
  parseStuckNote,
  stuckNoteContent,
  stuckTitle,
  type StuckState,
} from "@/lib/ai/stuck";
import { getRunningSession } from "@/lib/sessions";
import { UserError } from "@/lib/utils";

const id = z.string().min(1).max(50);
const scopeSchema = z.union([z.object({ topicId: id }), z.object({ projectId: id })]);

// --- I'm stuck

export type StuckInfo = { noteId: string; createdAt: string } & StuckState;

const attemptSchema = z.object({
  goal: z.string().trim().min(1, "Say what you're trying to do.").max(5_000),
  tried: z.string().trim().min(1, "Say what you've tried so far.").max(10_000),
  happened: z.string().trim().min(1, "Say what happened.").max(20_000),
});

async function stuckNote(noteId: string) {
  if (!id.safeParse(noteId).success) throw new UserError("Invalid input");
  const note = await db.note.findFirst({
    where: { id: noteId, tags: { some: { name: STUCK_TAG } } },
    select: { id: true, content: true, createdAt: true },
  });
  if (!note) throw new UserError("This stuck note was deleted.");
  const state = parseStuckNote(note.content);
  if (!state) throw new UserError("This stuck note was edited, so it can't continue here.");
  return { ...note, state };
}

/**
 * Starts the 15-minute rule: saves the attempt as a note (tag `stuck`) linked to the running
 * session's project and topic. The note's creation time starts the countdown.
 */
export async function startStuck(input: z.input<typeof attemptSchema>) {
  return run<StuckInfo>(async () => {
    const parsed = attemptSchema.safeParse(input);
    if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Invalid input");
    const session = await getRunningSession();
    if (!session) throw new UserError("Start a session first.");
    const state: StuckState = { ...parsed.data, hints: [], outcome: null };
    const note = await db.note.create({
      data: {
        title: stuckTitle(state.goal),
        content: stuckNoteContent(state),
        type: "NOTE",
        projectId: session.projectId,
        topicId: session.topicId,
        tags: { connectOrCreate: { where: { name: STUCK_TAG }, create: { name: STUCK_TAG } } },
      },
    });
    return { noteId: note.id, createdAt: note.createdAt.toISOString(), ...state };
  });
}

export async function getStuck(noteId: string) {
  return run<StuckInfo>(async () => {
    const note = await stuckNote(noteId);
    return { noteId: note.id, createdAt: note.createdAt.toISOString(), ...note.state };
  });
}

/** Closes a stuck event with what fixed it (or a default line). */
export async function finishStuck(noteId: string, outcome: string) {
  return run(async () => {
    const note = await stuckNote(noteId);
    const text = z.string().max(20_000).parse(outcome).trim();
    await db.note.update({
      where: { id: note.id },
      data: {
        content: stuckNoteContent({
          ...note.state,
          outcome: text || defaultOutcome(note.state.hints.length),
        }),
      },
    });
    return undefined;
  });
}

export async function discardStuck(noteId: string) {
  return run(async () => {
    const note = await stuckNote(noteId);
    await db.note.delete({ where: { id: note.id } });
    return undefined;
  });
}

// --- Quiz me

export async function generateQuiz(scope: QuizScope) {
  return run<QuizQuestion[]>(async () => {
    const s = scopeSchema.parse(scope);
    const { notes, ctx } = await quizMaterial(s);
    const data = await generateJson({
      system: QUIZ_SYSTEM,
      prompt: quizPrompt(notes, ctx),
      schema: QUIZ_SCHEMA,
    });
    const questions = parseQuiz(data, new Set(notes.map((n) => n.id)));
    if (!questions) throw new UserError("The quiz came back garbled. Try again.");
    return questions;
  });
}

const itemsSchema = z
  .array(z.object({ question: z.string().min(1).max(2_000), answer: z.string().max(10_000) }))
  .min(1)
  .max(QUIZ_COUNT);

export async function gradeQuiz(scope: QuizScope, items: { question: string; answer: string }[]) {
  return run<Grade[]>(async () => {
    const s = scopeSchema.parse(scope);
    const parsed = itemsSchema.parse(items);
    if (parsed.every((it) => !it.answer.trim()))
      throw new UserError("Answer at least one question first.");
    const { notes, ctx } = await quizMaterial(s);
    const data = await generateJson({
      system: GRADE_SYSTEM,
      prompt: gradePrompt(notes, ctx, parsed),
      schema: GRADE_SCHEMA,
    });
    const grades = parseGrades(data, parsed.length);
    if (!grades) throw new UserError("The grading came back garbled. Try again.");
    return grades;
  });
}

// --- Flashcards from a note

export async function generateFlashcards(noteId: string) {
  return run<CardDraft[]>(async () => {
    if (!id.safeParse(noteId).success) throw new UserError("Invalid input");
    const note = await db.note.findUnique({
      where: { id: noteId },
      select: { title: true, content: true },
    });
    if (!note) throw new UserError("This note was deleted.");
    if (note.content.trim().length < 40)
      throw new UserError("This note is too short to make cards from. Write a bit more first.");
    const data = await generateJson({
      system: CARDS_SYSTEM,
      prompt: cardsPrompt(note),
      schema: CARDS_SCHEMA,
    });
    const cards = parseCards(data);
    if (!cards) throw new UserError("The cards came back garbled. Try again.");
    return cards;
  });
}
