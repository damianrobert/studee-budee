"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { LoopStage } from "@prisma/client";
import { db } from "@/lib/db";
import { checkStageMove } from "@/lib/board";
import { emptyToNull, type ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v || /^https?:\/\//i.test(v), "Use a full http(s):// URL")
  .nullish();

const projectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name").max(200),
  goal: z.string().max(2000).nullish(),
  description: z.string().max(50_000).nullish(),
  repoUrl: url,
});

const createSchema = projectSchema.extend({
  /** Starter topics (suggested by the mentor), created in the Pain column. */
  topics: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(2_000).nullish(),
      }),
    )
    .max(10)
    .default([]),
});

function refresh(projectId?: string) {
  revalidatePath("/", "layout");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function createProject(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<string>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const p = await db.project.create({
    data: {
      name: d.name,
      goal: emptyToNull(d.goal),
      description: emptyToNull(d.description),
      repoUrl: emptyToNull(d.repoUrl),
      topics: {
        create: d.topics.map((t, position) => ({
          title: t.title,
          description: emptyToNull(t.description),
          stage: "PAIN" as const,
          position,
        })),
      },
    },
  });
  refresh();
  return { ok: true, data: p.id };
}

export async function updateProject(
  projectId: string,
  input: z.input<typeof projectSchema>,
): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(projectId).success) {
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  await db.project.update({
    where: { id: projectId },
    data: {
      name: d.name,
      goal: emptyToNull(d.goal),
      description: emptyToNull(d.description),
      repoUrl: emptyToNull(d.repoUrl),
    },
  });
  refresh(projectId);
  return { ok: true };
}

const statusSchema = z.enum(["ACTIVE", "PAUSED", "DONE", "ARCHIVED"]);

/** WIP limit = 1: activating a project pauses whichever one was active. */
export async function setProjectStatus(projectId: string, status: string): Promise<ActionResult> {
  const s = statusSchema.safeParse(status);
  if (!s.success || !id.safeParse(projectId).success) return { ok: false, error: "Invalid input" };
  await db.$transaction(async (tx) => {
    if (s.data === "ACTIVE") {
      await tx.project.updateMany({
        where: { status: "ACTIVE", id: { not: projectId } },
        data: { status: "PAUSED" },
      });
    }
    await tx.project.update({ where: { id: projectId }, data: { status: s.data } });
  });
  refresh(projectId);
  return { ok: true };
}

export async function deleteProject(
  projectId: string,
  deleteContent: boolean,
): Promise<ActionResult> {
  if (!id.safeParse(projectId).success) return { ok: false, error: "Invalid input" };
  await db.$transaction(async (tx) => {
    if (deleteContent) {
      const linked = { OR: [{ projectId }, { topic: { projectId } }] };
      await tx.note.deleteMany({ where: linked });
      await tx.postmortem.deleteMany({ where: linked });
    }
    await tx.project.delete({ where: { id: projectId } });
  });
  revalidatePath("/", "layout");
  redirect("/projects");
}

// --- Topics

const topicSchema = z.object({
  title: z.string().trim().min(1, "Give the topic a title").max(200),
  description: z.string().max(20_000).nullish(),
});

const stageSchema = z.enum(["PAIN", "BUILD", "BREAK", "EXPLAIN", "DONE"]);

export async function createTopic(
  projectId: string,
  input: z.input<typeof topicSchema>,
): Promise<ActionResult<string>> {
  const parsed = topicSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(projectId).success) {
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  }
  const last = await db.topic.findFirst({
    where: { projectId, stage: "PAIN" },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const t = await db.topic.create({
    data: {
      projectId,
      title: parsed.data.title,
      description: emptyToNull(parsed.data.description),
      stage: "PAIN",
      position: (last?.position ?? -1) + 1,
    },
  });
  refresh(projectId);
  return { ok: true, data: t.id };
}

export async function updateTopic(
  topicId: string,
  input: z.input<typeof topicSchema>,
): Promise<ActionResult> {
  const parsed = topicSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(topicId).success) {
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  }
  const t = await db.topic.update({
    where: { id: topicId },
    data: { title: parsed.data.title, description: emptyToNull(parsed.data.description) },
  });
  refresh(t.projectId);
  return { ok: true };
}

export async function deleteTopic(topicId: string): Promise<ActionResult> {
  if (!id.safeParse(topicId).success) return { ok: false, error: "Invalid input" };
  const t = await db.topic.delete({ where: { id: topicId } }).catch(() => null);
  refresh(t?.projectId);
  return { ok: true };
}

/**
 * Moves a topic to `toStage` at `toIndex` within that column, renumbering
 * positions, and records the stage change. Enforces the Done gate.
 */
export async function moveTopic(
  topicId: string,
  toStage: string,
  toIndex: number,
): Promise<ActionResult<{ hint?: "BREAK_FIRST" }>> {
  const stage = stageSchema.safeParse(toStage);
  const index = z.number().int().min(0).max(10_000).safeParse(toIndex);
  if (!stage.success || !index.success || !id.safeParse(topicId).success) {
    return { ok: false, error: "Invalid input" };
  }
  const to: LoopStage = stage.data;

  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: {
      projectId: true,
      stage: true,
      _count: { select: { postmortems: true, notes: { where: { type: "EXPLAIN_IT" } } } },
    },
  });
  if (!topic) return { ok: false, error: "Topic not found" };

  const check = checkStageMove(topic.stage, to, {
    explainNotes: topic._count.notes,
    postmortems: topic._count.postmortems,
  });
  if (!check.allowed) {
    return {
      ok: false,
      code: check.reason,
      error: "Write an explain-it note for this topic before marking it Done.",
    };
  }

  await db.$transaction(async (tx) => {
    const column = await tx.topic.findMany({
      where: { projectId: topic.projectId, stage: to, id: { not: topicId } },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const ids = column.map((t) => t.id);
    ids.splice(Math.min(index.data, ids.length), 0, topicId);
    await Promise.all(
      ids.map((tid, position) =>
        tx.topic.update({
          where: { id: tid },
          data: tid === topicId ? { stage: to, position } : { position },
        }),
      ),
    );
    if (topic.stage !== to) {
      await tx.topicStageChange.create({ data: { topicId, from: topic.stage, to } });
    }
  });

  refresh(topic.projectId);
  return { ok: true, data: { hint: check.hint } };
}
