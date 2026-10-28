"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionDefaults } from "@/lib/sessions";
import { emptyToNull, type ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);
const optId = id.nullish();
const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));
const stage = z.enum(["PAIN", "BUILD", "BREAK", "EXPLAIN"]).nullish();
const nextStep = z
  .string()
  .trim()
  .min(1, "Write one concrete next step before you stop.")
  .max(1000);

async function topicMatchesProject(projectId: string | null, topicId: string | null) {
  if (!topicId) return true;
  const topic = await db.topic.findUnique({ where: { id: topicId }, select: { projectId: true } });
  return !!topic && (projectId === null || topic.projectId === projectId);
}

function done() {
  revalidatePath("/", "layout");
}

const startSchema = z.object({ projectId: optId, topicId: optId });

export async function startSession(input?: z.input<typeof startSchema>): Promise<ActionResult> {
  const parsed = startSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const running = await db.session.findFirst({ where: { endedAt: null }, select: { id: true } });
  if (running) return { ok: false, error: "A session is already running." };

  let { projectId = null, topicId = null } = parsed.data;
  if (input === undefined) ({ projectId, topicId } = await getSessionDefaults());
  if (topicId && !projectId) {
    projectId =
      (await db.topic.findUnique({ where: { id: topicId }, select: { projectId: true } }))
        ?.projectId ?? null;
  }
  if (!(await topicMatchesProject(projectId, topicId))) {
    return { ok: false, error: "That topic doesn't belong to the chosen project." };
  }

  await db.session.create({ data: { projectId, topicId, startedAt: new Date() } });
  done();
  return { ok: true };
}

const stopSchema = z.object({
  id,
  summary: z.string().max(5000).nullish(),
  stage,
  producedOutput: z.boolean(),
  outputLink: z.string().max(2000).nullish(),
  nextStep,
  durationMin: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  endedAt: isoDate.nullish(),
  projectId: optId,
  topicId: optId,
});

export async function stopSession(input: z.input<typeof stopSchema>): Promise<ActionResult> {
  const parsed = stopSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const session = await db.session.findUnique({ where: { id: d.id } });
  if (!session || session.endedAt)
    return { ok: false, error: "This session is no longer running." };

  const endedAt = d.endedAt ?? new Date();
  if (endedAt < session.startedAt)
    return { ok: false, error: "End time is before the start time." };
  const projectId = d.projectId === undefined ? session.projectId : d.projectId;
  const topicId = d.topicId === undefined ? session.topicId : d.topicId;
  if (!(await topicMatchesProject(projectId, topicId))) {
    return { ok: false, error: "That topic doesn't belong to the chosen project." };
  }

  await db.session.update({
    where: { id: d.id },
    data: {
      endedAt,
      durationMin: d.durationMin,
      summary: emptyToNull(d.summary),
      stage: d.stage ?? null,
      producedOutput: d.producedOutput,
      outputLink: emptyToNull(d.outputLink),
      nextStep: d.nextStep,
      projectId,
      topicId,
    },
  });
  done();
  return { ok: true };
}

export async function discardRunningSession(sessionId: string): Promise<ActionResult> {
  const parsed = id.safeParse(sessionId);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await db.session.deleteMany({ where: { id: parsed.data, endedAt: null } });
  done();
  return { ok: true };
}

const logSchema = z.object({
  startedAt: isoDate,
  durationMin: z
    .number()
    .int()
    .min(1, "Duration must be at least 1 minute")
    .max(24 * 60),
  projectId: optId,
  topicId: optId,
  stage,
  summary: z.string().max(5000).nullish(),
  producedOutput: z.boolean(),
  outputLink: z.string().max(2000).nullish(),
  nextStep: z.string().trim().max(1000).nullish(),
});

export async function logPastSession(input: z.input<typeof logSchema>): Promise<ActionResult> {
  const parsed = logSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const endedAt = new Date(d.startedAt.getTime() + d.durationMin * 60_000);
  if (endedAt > new Date(Date.now() + 60_000)) {
    return { ok: false, error: "A past session can't end in the future." };
  }
  if (!(await topicMatchesProject(d.projectId ?? null, d.topicId ?? null))) {
    return { ok: false, error: "That topic doesn't belong to the chosen project." };
  }

  await db.session.create({
    data: {
      startedAt: d.startedAt,
      endedAt,
      durationMin: d.durationMin,
      projectId: d.projectId ?? null,
      topicId: d.topicId ?? null,
      stage: d.stage ?? null,
      summary: emptyToNull(d.summary),
      producedOutput: d.producedOutput,
      outputLink: emptyToNull(d.outputLink),
      nextStep: emptyToNull(d.nextStep),
    },
  });
  done();
  return { ok: true };
}

export async function deleteSession(sessionId: string): Promise<ActionResult> {
  const parsed = id.safeParse(sessionId);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await db.session.delete({ where: { id: parsed.data } }).catch(() => null);
  done();
  return { ok: true };
}
