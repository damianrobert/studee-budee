"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { referencedFileIds } from "@/lib/files";
import { resolveLinks } from "@/lib/links";
import { postmortemText } from "@/lib/postmortems";
import { setTags } from "@/lib/tags";
import type { ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);
const optId = id.nullish();
const md = z.string().max(200_000);

const postmortemSchema = z.object({
  title: z.string().trim().min(1, "Give the postmortem a title.").max(300),
  occurredAt: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s)),
  whatBroke: md,
  symptoms: md,
  investigation: md,
  rootCause: md,
  fix: md,
  lessons: md,
  wasDeliberate: z.boolean(),
  projectId: optId,
  topicId: optId,
  chaosExperimentId: optId,
  tags: z.array(z.string().max(60)).max(30),
});

export type PostmortemInput = z.input<typeof postmortemSchema>;

async function postmortemData(d: z.output<typeof postmortemSchema>) {
  const links = await resolveLinks(d.projectId ?? null, d.topicId ?? null);
  if (!links)
    return { ok: false, error: "That topic doesn't belong to the chosen project." } as const;
  const chaosExperimentId = d.chaosExperimentId ?? null;
  if (chaosExperimentId) {
    const exists = await db.chaosExperiment.count({ where: { id: chaosExperimentId } });
    if (!exists) return { ok: false, error: "That chaos experiment no longer exists." } as const;
  }
  // Attachments are the uploaded files any of the fields link to.
  const ids = referencedFileIds(postmortemText(d));
  const files = ids.length
    ? await db.fileAsset.findMany({ where: { id: { in: ids } }, select: { id: true } })
    : [];
  return {
    ok: true,
    data: {
      title: d.title,
      occurredAt: d.occurredAt,
      whatBroke: d.whatBroke,
      symptoms: d.symptoms,
      investigation: d.investigation,
      rootCause: d.rootCause,
      fix: d.fix,
      lessons: d.lessons,
      // A postmortem for a chaos experiment is deliberate by definition.
      wasDeliberate: d.wasDeliberate || !!chaosExperimentId,
      ...links,
      chaosExperimentId,
      tags: setTags(d.tags),
      files: { set: files },
    },
  } as const;
}

/** Writing up an experiment means it was run; mark it done if it wasn't yet. */
async function completeExperiment(experimentId: string | null) {
  if (!experimentId) return;
  await db.chaosExperiment.updateMany({
    where: { id: experimentId, completedAt: null },
    data: { completedAt: new Date() },
  });
}

export async function createPostmortem(input: PostmortemInput): Promise<ActionResult<string>> {
  const parsed = postmortemSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const res = await postmortemData(parsed.data);
  if (!res.ok) return res;
  const { tags, files, ...rest } = res.data;
  const pm = await db.postmortem.create({
    data: {
      ...rest,
      tags: { connectOrCreate: tags.connectOrCreate },
      files: { connect: files.set },
    },
  });
  await completeExperiment(rest.chaosExperimentId);
  revalidatePath("/", "layout");
  return { ok: true, data: pm.id };
}

export async function updatePostmortem(
  postmortemId: string,
  input: PostmortemInput,
): Promise<ActionResult> {
  const parsed = postmortemSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(postmortemId).success)
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  const res = await postmortemData(parsed.data);
  if (!res.ok) return res;
  const exists = await db.postmortem.count({ where: { id: postmortemId } });
  if (!exists) return { ok: false, error: "This postmortem was deleted." };
  await db.postmortem.update({ where: { id: postmortemId }, data: res.data });
  await completeExperiment(res.data.chaosExperimentId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deletePostmortem(postmortemId: string): Promise<ActionResult> {
  if (!id.safeParse(postmortemId).success) return { ok: false, error: "Invalid input" };
  await db.postmortem.delete({ where: { id: postmortemId } }).catch(() => null);
  revalidatePath("/", "layout");
  redirect("/postmortems");
}
