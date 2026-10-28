"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { mentorHistory } from "@/lib/ai/context";
import { generateJson } from "@/lib/ai/gemini";
import { updateMemory } from "@/lib/ai/memory";
import {
  IDEAS_SCHEMA,
  MEMORY_MAX,
  TOPICS_SCHEMA,
  parseIdeas,
  parseTopics,
  type ProjectIdea,
  type StarterTopic,
} from "@/lib/ai/mentor";
import { IDEAS_SYSTEM, TOPICS_SYSTEM, ideasPrompt, topicsPrompt } from "@/lib/ai/prompts";
import { runAi as run } from "@/lib/ai/run";
import { UserError, emptyToNull, type ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);

// --- New project: ideas and starter topics

const ideasInput = z.object({
  wish: z.string().max(5_000).default(""),
  /** Names of ideas already shown, so a second round brings new ones. */
  exclude: z.array(z.string().max(200)).max(40).default([]),
});

export async function suggestProjectIdeas(input: z.input<typeof ideasInput>) {
  return run<ProjectIdea[]>(async () => {
    const { wish, exclude } = ideasInput.parse(input);
    const [projects, doneTopics, roadmaps] = await Promise.all([
      db.project.findMany({
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { name: true, goal: true },
      }),
      db.topic.findMany({
        where: { stage: "DONE" },
        orderBy: { updatedAt: "desc" },
        take: 40,
        select: { title: true },
      }),
      db.roadmap.findMany({ orderBy: { updatedAt: "desc" }, take: 10, select: { title: true } }),
    ]);
    const data = await generateJson({
      system: IDEAS_SYSTEM,
      prompt: ideasPrompt({
        wish,
        projects,
        doneTopics: doneTopics.map((t) => t.title),
        roadmaps: roadmaps.map((r) => r.title),
        exclude,
      }),
      schema: IDEAS_SCHEMA,
    });
    const ideas = parseIdeas(data);
    if (!ideas) throw new UserError("The ideas came back garbled. Try again.");
    return ideas;
  });
}

const ownIdea = z.object({
  name: z.string().trim().min(1, "Give the project a name first.").max(200),
  goal: z.string().max(2_000).default(""),
  description: z.string().max(50_000).default(""),
});

/** Starter topics for the learner's own idea. */
export async function suggestStarterTopics(input: z.input<typeof ownIdea>) {
  return run<StarterTopic[]>(async () => {
    const parsed = ownIdea.safeParse(input);
    if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = await generateJson({
      system: TOPICS_SYSTEM,
      prompt: topicsPrompt(parsed.data),
      schema: TOPICS_SCHEMA,
    });
    const topics = parseTopics(data);
    if (!topics) throw new UserError("The topics came back garbled. Try again.");
    return topics;
  });
}

// --- The mentor's memory and conversation

/** The user's own edit of the memory; empty clears it. */
export async function saveMentorMemory(projectId: string, memory: string): Promise<ActionResult> {
  const text = z.string().max(MEMORY_MAX).safeParse(memory);
  if (!id.safeParse(projectId).success || !text.success)
    return {
      ok: false,
      error: `Keep the memory under ${MEMORY_MAX.toLocaleString("en")} characters.`,
    };
  const value = emptyToNull(text.data);
  await db.project.update({
    where: { id: projectId },
    data: { mentorMemory: value, mentorMemoryAt: value ? new Date() : null },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** Rewrites the memory now, from the project's facts and the latest conversation. */
export async function rebuildMentorMemory(projectId: string) {
  return run(async () => {
    if (!id.safeParse(projectId).success) throw new UserError("Invalid input");
    const written = await updateMemory(projectId, await mentorHistory(projectId));
    if (!written)
      throw new UserError("Couldn't rebuild the memory (it may have just changed). Try again.");
    revalidatePath(`/projects/${projectId}`);
    return undefined;
  });
}

/** Deletes the conversation; the memory stays. */
export async function clearMentorChat(projectId: string): Promise<ActionResult> {
  if (!id.safeParse(projectId).success) return { ok: false, error: "Invalid input" };
  await db.mentorMessage.deleteMany({ where: { projectId } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
