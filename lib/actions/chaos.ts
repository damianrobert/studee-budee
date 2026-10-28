"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeCategory } from "@/lib/chaos";
import { emptyToNull, type ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);

const experimentSchema = z.object({
  title: z.string().trim().min(1, "Give the experiment a title.").max(300),
  description: z.string().max(20_000).nullish(),
  hypothesis: z.string().max(5_000).nullish(),
  difficulty: z.number().int().min(1).max(3),
  category: z.string().max(60).nullish(),
});

export type ExperimentInput = z.input<typeof experimentSchema>;

function data(d: z.output<typeof experimentSchema>) {
  return {
    title: d.title,
    description: emptyToNull(d.description),
    hypothesis: emptyToNull(d.hypothesis),
    difficulty: d.difficulty,
    category: normalizeCategory(d.category),
  };
}

function done() {
  revalidatePath("/", "layout");
}

export async function createExperiment(input: ExperimentInput): Promise<ActionResult<string>> {
  const parsed = experimentSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const e = await db.chaosExperiment.create({ data: data(parsed.data) });
  done();
  return { ok: true, data: e.id };
}

export async function updateExperiment(
  experimentId: string,
  input: ExperimentInput,
): Promise<ActionResult> {
  const parsed = experimentSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(experimentId).success)
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  const res = await db.chaosExperiment
    .update({ where: { id: experimentId }, data: data(parsed.data) })
    .catch(() => null);
  if (!res) return { ok: false, error: "This experiment was deleted." };
  done();
  return { ok: true };
}

export async function setExperimentDone(
  experimentId: string,
  isDone: boolean,
): Promise<ActionResult> {
  if (!id.safeParse(experimentId).success) return { ok: false, error: "Invalid input" };
  const res = await db.chaosExperiment
    .update({ where: { id: experimentId }, data: { completedAt: isDone ? new Date() : null } })
    .catch(() => null);
  if (!res) return { ok: false, error: "This experiment was deleted." };
  done();
  return { ok: true };
}

/** Linked postmortems are kept (they lose the link but stay deliberate). */
export async function deleteExperiment(experimentId: string): Promise<ActionResult> {
  if (!id.safeParse(experimentId).success) return { ok: false, error: "Invalid input" };
  await db.chaosExperiment.delete({ where: { id: experimentId } }).catch(() => null);
  done();
  return { ok: true };
}
