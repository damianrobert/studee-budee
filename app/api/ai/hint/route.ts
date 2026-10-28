import { z } from "zod";
import { db } from "@/lib/db";
import { noteContext } from "@/lib/ai/context";
import { stream } from "@/lib/ai/gemini";
import { STUCK_SYSTEM, hintPrompt } from "@/lib/ai/prompts";
import { aiRoute, jsonError, streamText } from "@/lib/ai/stream";
import { MAX_HINTS, STUCK_TAG, hintWait, parseStuckNote, stuckNoteContent } from "@/lib/ai/stuck";

export const dynamic = "force-dynamic";

/** A little slack for clock differences between the browser and the server. */
const GRACE_MS = 5_000;

/**
 * "I'm stuck": streams the next hint for a stuck note, once its 15 minutes are up, and
 * appends it to the note when it's complete.
 */
export const POST = aiRoute(z.object({ noteId: z.string().min(1).max(50) }), async ({ noteId }) => {
  const note = await db.note.findFirst({
    where: { id: noteId, tags: { some: { name: STUCK_TAG } } },
    select: { content: true, createdAt: true, projectId: true, topicId: true },
  });
  if (!note) return jsonError("This stuck note was deleted.", 404);
  const state = parseStuckNote(note.content);
  if (!state) return jsonError("This stuck note was edited, so hints can't continue on it.", 409);
  if (state.outcome !== null) return jsonError("This one is already solved.", 409);
  if (state.hints.length >= MAX_HINTS)
    return jsonError(`That was the last hint (${MAX_HINTS} per problem).`, 409);
  const wait = hintWait(note.createdAt) - GRACE_MS;
  if (wait > 0)
    return jsonError(`Keep going: a hint unlocks in ${Math.ceil(wait / 60_000)} min.`, 425);

  const ctx = await noteContext(note);
  const chunks = stream({
    system: STUCK_SYSTEM,
    prompt: hintPrompt(state, ctx),
    maxOutputTokens: 4096,
  });
  return streamText(chunks, async (hint) => {
    // Re-read: the note may have been saved in the meantime.
    const current = await db.note.findUnique({ where: { id: noteId }, select: { content: true } });
    const latest = current && parseStuckNote(current.content);
    if (!latest || latest.hints.length !== state.hints.length) return;
    await db.note.update({
      where: { id: noteId },
      data: { content: stuckNoteContent({ ...latest, hints: [...latest.hints, hint] }) },
    });
  });
});
