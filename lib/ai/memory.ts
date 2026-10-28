import { db } from "@/lib/db";
import { mentorFacts } from "./context";
import { generate } from "./gemini";
import { cleanMemory, type MentorTurn } from "./mentor";
import { MEMORY_SYSTEM, memoryPrompt } from "./prompts";

/**
 * Rewrites a project's mentor memory from its facts and the latest conversation. Skips the
 * write when the memory changed meanwhile (the user edited it, or another update won).
 * Returns whether it was written.
 */
export async function updateMemory(projectId: string, turns: MentorTurn[]): Promise<boolean> {
  const facts = await mentorFacts(projectId);
  if (!facts) return false;
  const memory = cleanMemory(
    await generate({
      system: MEMORY_SYSTEM,
      prompt: memoryPrompt(facts, turns),
      maxOutputTokens: 2048,
    }),
  );
  if (!memory) return false;
  const res = await db.project.updateMany({
    where: { id: projectId, mentorMemoryAt: facts.memoryAt },
    data: { mentorMemory: memory, mentorMemoryAt: new Date() },
  });
  return res.count > 0;
}

// One update at a time per project, so quick messages don't race each other.
const queues = new Map<string, Promise<unknown>>();

/** Updates the memory in the background after a conversation turn; failures are only logged. */
export function updateMemoryLater(projectId: string, turns: MentorTurn[]) {
  const next = (queues.get(projectId) ?? Promise.resolve())
    .then(() => updateMemory(projectId, turns))
    .catch((e) => console.error("[ai] mentor memory update failed:", e))
    .finally(() => {
      if (queues.get(projectId) === next) queues.delete(projectId);
    });
  queues.set(projectId, next);
}
