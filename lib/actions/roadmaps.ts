"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, ResourceKind, RoadmapStepStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { generateJson } from "@/lib/ai/gemini";
import {
  PLAN_SCHEMA,
  REVISE_SCHEMA,
  STEP_REVISE_SCHEMA,
  mergePlan,
  parsePlan,
  parseStepRevision,
  type NewResource,
} from "@/lib/ai/roadmap";
import {
  ROADMAP_REVISE_SYSTEM,
  ROADMAP_SYSTEM,
  STEP_REVISE_SYSTEM,
  roadmapPrompt,
  roadmapRevisePrompt,
  stepRevisePrompt,
  type RoadmapForPrompt,
} from "@/lib/ai/prompts";
import { findResources, type ResearchStep } from "@/lib/ai/research";
import { runAi } from "@/lib/ai/run";
import { fetchTitle, normalizeUrl } from "@/lib/reading";
import { RESOURCE_KINDS, STEP_STATUSES, urlKey } from "@/lib/roadmaps";
import { UserError, emptyToNull, type ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);
const request = z
  .string()
  .trim()
  .min(3, "Say what you want.")
  .max(4_000, "Keep it under 4000 characters.");
/** Searches per step when a roadmap is made or revised (each step gets 1–2 queries). */
const QUERIES_PER_STEP = 2;

function refresh(roadmapId?: string) {
  revalidatePath("/roadmaps");
  if (roadmapId) revalidatePath(`/roadmaps/${roadmapId}`);
}

function parseRequest(input: unknown): string {
  const parsed = request.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Invalid input");
  return parsed.data;
}

const fullRoadmap = {
  stages: {
    orderBy: { position: "asc" },
    include: {
      steps: {
        orderBy: { position: "asc" },
        include: { resources: { orderBy: { position: "asc" } } },
      },
    },
  },
} satisfies Prisma.RoadmapInclude;

type FullRoadmap = Prisma.RoadmapGetPayload<{ include: typeof fullRoadmap }>;

function forPrompt(r: FullRoadmap): RoadmapForPrompt {
  return {
    title: r.title,
    summary: r.summary,
    prompt: r.prompt,
    stages: r.stages.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      steps: s.steps.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        practice: t.practice,
        status: t.status,
        resources: t.resources.map((x) => ({ title: x.title, url: x.url })),
      })),
    })),
  };
}

function resourceRows(list: NewResource[] | undefined, from = 0) {
  return (list ?? []).map((r, i) => ({
    position: from + i,
    title: r.title,
    url: r.url,
    kind: r.kind,
    note: r.note,
    origin: r.origin,
  }));
}

function count(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// --- Made and changed by the AI

/** Plans a roadmap from the request, finds resources for every step and saves it. */
export async function createRoadmap(input: string) {
  return runAi<string>(async () => {
    const req = parseRequest(input);
    const plan = parsePlan(
      await generateJson({
        system: ROADMAP_SYSTEM,
        prompt: roadmapPrompt(req),
        schema: PLAN_SCHEMA,
        maxOutputTokens: 16_384,
        // Planning the whole path is worth the extra seconds.
        thinking: "high",
      }),
    );
    if (!plan) throw new UserError("The roadmap came back garbled. Try again.");

    const research: ResearchStep[] = plan.stages.flatMap((s, si) =>
      s.steps.map((t, ti) => ({
        key: `${si}.${ti}`,
        title: t.title,
        description: t.description,
        stage: s.title,
        queries: (t.searchQueries.length ? t.searchQueries : [t.title]).slice(0, QUERIES_PER_STEP),
        existing: [],
      })),
    );
    const found = await findResources(research);

    const roadmap = await db.roadmap.create({
      data: {
        title: plan.title,
        summary: plan.summary,
        prompt: req,
        stages: {
          create: plan.stages.map((s, si) => ({
            position: si,
            title: s.title,
            description: s.description,
            steps: {
              create: s.steps.map((t, ti) => ({
                position: ti,
                title: t.title,
                description: t.description,
                practice: t.practice,
                resources: { create: resourceRows(found.get(`${si}.${ti}`)) },
              })),
            },
          })),
        },
      },
    });
    refresh();
    return roadmap.id;
  });
}

/**
 * Changes the roadmap as asked (add/remove/reorder/rewrite stages and steps, or find more
 * resources). Kept steps keep their status and resources; new resources are appended.
 */
export async function reviseRoadmap(roadmapId: string, input: string, focusStageId?: string) {
  return runAi<string>(async () => {
    if (!id.safeParse(roadmapId).success) throw new UserError("Invalid input");
    const req = parseRequest(input);
    const roadmap = await db.roadmap.findUnique({ where: { id: roadmapId }, include: fullRoadmap });
    if (!roadmap) throw new UserError("This roadmap was deleted.");
    const focus = focusStageId ? (roadmap.stages.find((s) => s.id === focusStageId) ?? null) : null;

    const plan = parsePlan(
      await generateJson({
        system: ROADMAP_REVISE_SYSTEM,
        prompt: roadmapRevisePrompt(forPrompt(roadmap), req, focus),
        schema: REVISE_SCHEMA,
        maxOutputTokens: 24_576,
      }),
    );
    if (!plan) throw new UserError("The changes came back garbled. Try again.");
    const merge = mergePlan(roadmap, plan);

    const steps = new Map(roadmap.stages.flatMap((s) => s.steps.map((t) => [t.id, t])));
    const research: ResearchStep[] = merge.stages.flatMap((s, si) =>
      s.steps.flatMap((t, ti) =>
        t.research
          ? [
              {
                key: `${si}.${ti}`,
                title: t.title,
                description: t.description,
                stage: s.title,
                queries: t.searchQueries.slice(0, QUERIES_PER_STEP),
                existing: (t.id ? (steps.get(t.id)?.resources ?? []) : []).map((x) => ({
                  title: x.title,
                  url: x.url,
                })),
              },
            ]
          : [],
      ),
    );
    const found = await findResources(research, req);
    const added = [...found.values()].reduce((n, l) => n + l.length, 0);

    await db.$transaction(
      async (tx) => {
        // Stages and steps first, deletions last: a step can move out of a deleted stage.
        for (const [si, s] of merge.stages.entries()) {
          const data = { position: si, title: s.title, description: s.description };
          const stageId = s.id
            ? (await tx.roadmapStage.update({ where: { id: s.id }, data })).id
            : (await tx.roadmapStage.create({ data: { ...data, roadmapId } })).id;
          for (const [ti, t] of s.steps.entries()) {
            const fields = {
              stageId,
              position: ti,
              title: t.title,
              description: t.description,
              practice: t.practice,
            };
            const fresh = found.get(`${si}.${ti}`);
            if (t.id) {
              const from = steps.get(t.id)?.resources.length ?? 0;
              await tx.roadmapStep.update({
                where: { id: t.id },
                data: { ...fields, resources: { create: resourceRows(fresh, from) } },
              });
            } else {
              await tx.roadmapStep.create({
                data: { ...fields, resources: { create: resourceRows(fresh) } },
              });
            }
          }
        }
        await tx.roadmapStep.deleteMany({ where: { id: { in: merge.deleteStepIds } } });
        await tx.roadmapStage.deleteMany({ where: { id: { in: merge.deleteStageIds } } });
        await tx.roadmap.update({
          where: { id: roadmapId },
          data: { title: plan.title, summary: plan.summary },
        });
        const created = merge.stages.flatMap((s) => s.steps).filter((t) => !t.id).length;
        const facts = [
          created && `${count(created, "step")} added`,
          merge.deleteStepIds.length && `${count(merge.deleteStepIds.length, "step")} removed`,
          added && `${count(added, "resource")} found`,
        ].filter(Boolean);
        await tx.roadmapEdit.create({
          data: {
            roadmapId,
            instruction: req,
            scope: focus?.title ?? null,
            summary: [plan.changeSummary ?? "Updated the roadmap.", facts.join(", ")]
              .filter(Boolean)
              .join(" · "),
          },
        });
      },
      { timeout: 30_000 },
    );
    refresh(roadmapId);
    return plan.changeSummary ?? "Updated the roadmap.";
  });
}

/** Changes one step as asked: rewrites it and/or finds more resources for it. */
export async function reviseStep(stepId: string, input: string) {
  return runAi<{ summary: string; added: number }>(async () => {
    if (!id.safeParse(stepId).success) throw new UserError("Invalid input");
    const req = parseRequest(input);
    const step = await db.roadmapStep.findUnique({
      where: { id: stepId },
      include: {
        resources: { orderBy: { position: "asc" } },
        stage: { include: { roadmap: { select: { id: true, title: true, summary: true } } } },
      },
    });
    if (!step) throw new UserError("This step was deleted.");
    const roadmap = step.stage.roadmap;
    const existing = step.resources.map((x) => ({ title: x.title, url: x.url }));

    const revision = parseStepRevision(
      await generateJson({
        system: STEP_REVISE_SYSTEM,
        prompt: stepRevisePrompt(roadmap, step.stage.title, { ...step, resources: existing }, req),
        schema: STEP_REVISE_SCHEMA,
      }),
    );
    if (!revision) throw new UserError("The changes came back garbled. Try again.");

    const found = revision.findResources
      ? await findResources(
          [
            {
              key: "step",
              title: revision.title,
              description: revision.description,
              stage: step.stage.title,
              queries: revision.searchQueries.length ? revision.searchQueries : [revision.title],
              existing,
            },
          ],
          req,
        )
      : new Map<string, NewResource[]>();
    const fresh = found.get("step") ?? [];

    await db.$transaction([
      db.roadmapStep.update({
        where: { id: stepId },
        data: {
          title: revision.title,
          description: revision.description,
          practice: revision.practice,
          resources: { create: resourceRows(fresh, step.resources.length) },
        },
      }),
      db.roadmapEdit.create({
        data: {
          roadmapId: roadmap.id,
          instruction: req,
          scope: step.title,
          summary: revision.findResources
            ? `${revision.changeSummary} · ${count(fresh.length, "resource")} found`
            : revision.changeSummary,
        },
      }),
      db.roadmap.update({ where: { id: roadmap.id }, data: { updatedAt: new Date() } }),
    ]);
    refresh(roadmap.id);
    if (revision.findResources && !fresh.length)
      return {
        summary: `${revision.changeSummary} No new resources worth adding turned up — try asking differently.`,
        added: 0,
      };
    return { summary: revision.changeSummary, added: fresh.length };
  });
}

// --- By hand

async function roadmapOfStep(stepId: string) {
  const step = await db.roadmapStep.findUnique({
    where: { id: stepId },
    select: { stage: { select: { roadmapId: true } } },
  });
  return step?.stage.roadmapId ?? null;
}

export async function setStepStatus(
  stepId: string,
  status: RoadmapStepStatus,
): Promise<ActionResult> {
  if (!id.safeParse(stepId).success || !STEP_STATUSES.includes(status))
    return { ok: false, error: "Invalid input" };
  const res = await db.roadmapStep
    .update({ where: { id: stepId }, data: { status }, select: { stage: true } })
    .catch(() => null);
  if (!res) return { ok: false, error: "This step was deleted." };
  refresh(res.stage.roadmapId);
  return { ok: true };
}

export async function deleteStep(stepId: string): Promise<ActionResult> {
  if (!id.safeParse(stepId).success) return { ok: false, error: "Invalid input" };
  const roadmapId = await roadmapOfStep(stepId);
  await db.roadmapStep.deleteMany({ where: { id: stepId } });
  // A stage without steps has nothing to show.
  if (roadmapId) await db.roadmapStage.deleteMany({ where: { roadmapId, steps: { none: {} } } });
  refresh(roadmapId ?? undefined);
  return { ok: true };
}

const resourceSchema = z.object({
  url: z.string().max(2000),
  title: z.string().max(300).nullish(),
  kind: z.enum(RESOURCE_KINDS as [ResourceKind, ...ResourceKind[]]),
  note: z.string().max(1000).nullish(),
});

/** Adds a link by hand; without a title, the page's own title is fetched. */
export async function addResource(
  stepId: string,
  input: z.input<typeof resourceSchema>,
): Promise<ActionResult> {
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(stepId).success)
    return { ok: false, error: "Invalid input" };
  const url = normalizeUrl(parsed.data.url);
  if (!url) return { ok: false, error: "That doesn't look like a web link." };
  const step = await db.roadmapStep.findUnique({
    where: { id: stepId },
    select: { stage: { select: { roadmapId: true } }, resources: { select: { url: true } } },
  });
  if (!step) return { ok: false, error: "This step was deleted." };
  if (step.resources.some((r) => urlKey(r.url) === urlKey(url)))
    return { ok: false, error: "This step already has that link." };
  const title = emptyToNull(parsed.data.title) ?? (await fetchTitle(url)) ?? url;
  await db.roadmapResource.create({
    data: {
      stepId,
      position: step.resources.length,
      title,
      url,
      kind: parsed.data.kind,
      note: emptyToNull(parsed.data.note),
    },
  });
  refresh(step.stage.roadmapId);
  return { ok: true };
}

export async function deleteResource(resourceId: string): Promise<ActionResult> {
  if (!id.safeParse(resourceId).success) return { ok: false, error: "Invalid input" };
  const res = await db.roadmapResource
    .delete({ where: { id: resourceId }, select: { step: { select: { stage: true } } } })
    .catch(() => null);
  refresh(res?.step.stage.roadmapId);
  return { ok: true };
}

export async function renameRoadmap(roadmapId: string, title: string): Promise<ActionResult> {
  const t = z.string().trim().min(1, "Give it a title.").max(300).safeParse(title);
  if (!t.success || !id.safeParse(roadmapId).success)
    return { ok: false, error: t.error?.issues[0]?.message ?? "Invalid input" };
  const res = await db.roadmap
    .update({ where: { id: roadmapId }, data: { title: t.data } })
    .catch(() => null);
  if (!res) return { ok: false, error: "This roadmap was deleted." };
  refresh(roadmapId);
  return { ok: true };
}

export async function deleteRoadmap(roadmapId: string): Promise<ActionResult> {
  if (!id.safeParse(roadmapId).success) return { ok: false, error: "Invalid input" };
  await db.roadmap.deleteMany({ where: { id: roadmapId } });
  refresh();
  return { ok: true };
}
