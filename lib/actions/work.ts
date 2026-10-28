"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { setTags } from "@/lib/tags";
import { emptyToNull, type ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);

const observationSchema = z.object({
  content: z.string().trim().min(1, "Write what you noticed.").max(10_000),
  question: z.string().max(2_000).nullish(),
  answer: z.string().max(10_000).nullish(),
  tags: z.array(z.string().max(60)).max(30),
});

export type ObservationInput = z.input<typeof observationSchema>;

function done() {
  revalidatePath("/", "layout");
}

export async function createObservation(input: ObservationInput): Promise<ActionResult<string>> {
  const parsed = observationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const o = await db.workObservation.create({
    data: {
      content: d.content,
      question: emptyToNull(d.question),
      answer: emptyToNull(d.answer),
      tags: { connectOrCreate: setTags(d.tags).connectOrCreate },
    },
  });
  done();
  return { ok: true, data: o.id };
}

export async function updateObservation(
  observationId: string,
  input: ObservationInput,
): Promise<ActionResult> {
  const parsed = observationSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(observationId).success)
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const res = await db.workObservation
    .update({
      where: { id: observationId },
      data: {
        content: d.content,
        question: emptyToNull(d.question),
        answer: emptyToNull(d.answer),
        tags: setTags(d.tags),
      },
    })
    .catch(() => null);
  if (!res) return { ok: false, error: "This observation was deleted." };
  done();
  return { ok: true };
}

const resolveSchema = z.object({ resolved: z.boolean(), answer: z.string().max(10_000).nullish() });

/** Resolving can record the answer; reopening keeps it (it's still useful context). */
export async function setObservationResolved(
  observationId: string,
  input: z.input<typeof resolveSchema>,
): Promise<ActionResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(observationId).success)
    return { ok: false, error: "Invalid input" };
  const { resolved, answer } = parsed.data;
  const res = await db.workObservation
    .update({
      where: { id: observationId },
      data: resolved ? { resolved, answer: emptyToNull(answer) } : { resolved },
    })
    .catch(() => null);
  if (!res) return { ok: false, error: "This observation was deleted." };
  done();
  return { ok: true };
}

export async function deleteObservation(observationId: string): Promise<ActionResult> {
  if (!id.safeParse(observationId).success) return { ok: false, error: "Invalid input" };
  await db.workObservation.delete({ where: { id: observationId } }).catch(() => null);
  done();
  return { ok: true };
}
