"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { RATINGS, dueDate, sm2 } from "@/lib/flashcards";
import { appTz } from "@/lib/time";
import type { ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);

const cardSchema = z.object({
  front: z.string().trim().min(1, "Write the question on the front.").max(10_000),
  back: z.string().trim().min(1, "Write the answer on the back.").max(20_000),
  noteId: id.nullish(),
});

export type FlashcardInput = z.input<typeof cardSchema>;

function done() {
  revalidatePath("/", "layout");
}

/** A note id that no longer exists is dropped rather than failing the save. */
async function existingNoteId(noteId: string | null | undefined): Promise<string | null> {
  if (!noteId) return null;
  const note = await db.note.findUnique({ where: { id: noteId }, select: { id: true } });
  return note?.id ?? null;
}

/** New cards are due right away, so they show up in the next review. */
export async function createFlashcard(input: FlashcardInput): Promise<ActionResult<string>> {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { front, back, noteId } = parsed.data;
  const card = await db.flashcard.create({
    data: { front, back, noteId: await existingNoteId(noteId) },
  });
  done();
  return { ok: true, data: card.id };
}

/** Saves reviewed cards in one go (from "Generate flashcards" or a quiz). */
export async function createFlashcards(inputs: FlashcardInput[]): Promise<ActionResult<number>> {
  const parsed = z.array(cardSchema).min(1, "No cards to save.").max(20).safeParse(inputs);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const noteIds = [...new Set(parsed.data.flatMap((c) => (c.noteId ? [c.noteId] : [])))];
  const existing = new Set(
    (await db.note.findMany({ where: { id: { in: noteIds } }, select: { id: true } })).map(
      (n) => n.id,
    ),
  );
  const res = await db.flashcard.createMany({
    data: parsed.data.map(({ front, back, noteId }) => ({
      front,
      back,
      noteId: noteId && existing.has(noteId) ? noteId : null,
    })),
  });
  done();
  return { ok: true, data: res.count };
}

/** Editing the text keeps the schedule; the source note can't be changed here. */
export async function updateFlashcard(
  cardId: string,
  input: Omit<FlashcardInput, "noteId">,
): Promise<ActionResult> {
  const parsed = cardSchema.omit({ noteId: true }).safeParse(input);
  if (!parsed.success || !id.safeParse(cardId).success)
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  const res = await db.flashcard
    .update({ where: { id: cardId }, data: parsed.data })
    .catch(() => null);
  if (!res) return { ok: false, error: "This card was deleted." };
  done();
  return { ok: true };
}

export async function deleteFlashcard(cardId: string): Promise<ActionResult> {
  if (!id.safeParse(cardId).success) return { ok: false, error: "Invalid input" };
  await db.flashcard.delete({ where: { id: cardId } }).catch(() => null);
  done();
  return { ok: true };
}

/** Starts the card over: due now, as if it were new. */
export async function resetFlashcard(cardId: string): Promise<ActionResult> {
  if (!id.safeParse(cardId).success) return { ok: false, error: "Invalid input" };
  const res = await db.flashcard
    .update({
      where: { id: cardId },
      data: { easeFactor: 2.5, interval: 0, repetitions: 0, dueAt: new Date() },
    })
    .catch(() => null);
  if (!res) return { ok: false, error: "This card was deleted." };
  done();
  return { ok: true };
}

/** Rates a review and schedules the next one with SM-2 (see `lib/flashcards.ts`). */
export async function reviewFlashcard(
  cardId: string,
  rating: (typeof RATINGS)[number],
): Promise<ActionResult<{ interval: number; dueAt: string }>> {
  if (!id.safeParse(cardId).success || !z.enum(RATINGS).safeParse(rating).success)
    return { ok: false, error: "Invalid input" };
  const card = await db.flashcard.findUnique({ where: { id: cardId } });
  if (!card) return { ok: false, error: "This card was deleted." };
  const next = sm2(card, rating);
  const dueAt = dueDate(next.interval, new Date(), appTz());
  await db.flashcard.update({ where: { id: cardId }, data: { ...next, dueAt } });
  done();
  return { ok: true, data: { interval: next.interval, dueAt: dueAt.toISOString() } };
}
