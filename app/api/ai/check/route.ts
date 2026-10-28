import { z } from "zod";
import { db } from "@/lib/db";
import { noteContext } from "@/lib/ai/context";
import { stream } from "@/lib/ai/gemini";
import { CHECK_SYSTEM, checkPrompt } from "@/lib/ai/prompts";
import { aiRoute, jsonError, streamText } from "@/lib/ai/stream";

export const dynamic = "force-dynamic";

/** "Check my explanation" on an explain-it note: streams a review (never a rewrite). */
export const POST = aiRoute(z.object({ noteId: z.string().min(1).max(50) }), async ({ noteId }) => {
  const note = await db.note.findUnique({
    where: { id: noteId },
    select: { title: true, content: true, type: true, projectId: true, topicId: true },
  });
  if (!note) return jsonError("This note was deleted.", 404);
  if (note.type !== "EXPLAIN_IT") return jsonError("Only explain-it notes can be checked.");
  if (note.content.trim().length < 40)
    return jsonError("Write your explanation first: a few sentences, as if teaching a colleague.");
  const ctx = await noteContext(note);
  return streamText(
    stream({ system: CHECK_SYSTEM, prompt: checkPrompt(note, ctx), maxOutputTokens: 4096 }),
  );
});
