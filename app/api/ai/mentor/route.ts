import { z } from "zod";
import { db } from "@/lib/db";
import { mentorFacts, mentorHistory } from "@/lib/ai/context";
import { stream } from "@/lib/ai/gemini";
import { updateMemoryLater } from "@/lib/ai/memory";
import type { MentorTurn } from "@/lib/ai/mentor";
import { mentorSystem, mentorTurnText } from "@/lib/ai/prompts";
import { aiRoute, jsonError, streamText } from "@/lib/ai/stream";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  projectId: z.string().min(1).max(50),
  message: z.string().trim().min(1).max(10_000),
  /** Ticked "Give me the solution": the only way to get one. */
  solution: z.boolean(),
});

/**
 * One turn with the project mentor: streams the answer, then saves both messages and updates
 * the mentor's memory in the background. Nothing is saved when the answer fails.
 */
export const POST = aiRoute(bodySchema, async ({ projectId, message, solution }) => {
  const [facts, history] = await Promise.all([mentorFacts(projectId), mentorHistory(projectId)]);
  if (!facts) return jsonError("This project was deleted.", 404);
  return streamText(
    stream({
      system: mentorSystem(facts, solution),
      history: history.map((m) => ({
        role: m.role === "USER" ? "user" : "model",
        text: mentorTurnText(m),
      })),
      prompt: solution ? mentorTurnText({ role: "USER", content: message, solution }) : message,
      maxOutputTokens: solution ? 8192 : 2048,
      thinking: solution ? "high" : "low",
    }),
    async (reply) => {
      const asked = new Date();
      const answered = new Date(asked.getTime() + 1);
      await db.mentorMessage.createMany({
        data: [
          { projectId, role: "USER", content: message, solution, createdAt: asked },
          { projectId, role: "MENTOR", content: reply, solution, createdAt: answered },
        ],
      });
      const turns: MentorTurn[] = [
        ...history.slice(-4),
        { role: "USER", content: message, solution },
        { role: "MENTOR", content: reply, solution },
      ];
      updateMemoryLater(projectId, turns);
    },
  );
});
