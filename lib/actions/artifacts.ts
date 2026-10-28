"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { ARTIFACT_KINDS, ARTIFACT_STATUSES, nextPublishedAt } from "@/lib/artifacts";
import { appTz, zonedDayStart } from "@/lib/time";
import { emptyToNull, type ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);
const status = z.enum(ARTIFACT_STATUSES as [string, ...string[]]);

const artifactSchema = z.object({
  title: z.string().trim().min(1, "Give the artifact a title.").max(300),
  kind: z.enum(ARTIFACT_KINDS as [string, ...string[]]),
  status,
  url: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (s) => !s || /^https?:\/\/\S+$/i.test(s),
      "The link must start with http:// or https://",
    )
    .nullish(),
  notes: z.string().max(20_000).nullish(),
  /** "YYYY-MM" */
  targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month."),
  sourceNoteId: id.nullish(),
  sourcePostmortemId: id.nullish(),
});

export type ArtifactInput = z.input<typeof artifactSchema>;
type Status = (typeof ARTIFACT_STATUSES)[number];
type Kind = (typeof ARTIFACT_KINDS)[number];

function data(d: z.output<typeof artifactSchema>) {
  return {
    title: d.title,
    kind: d.kind as Kind,
    status: d.status as Status,
    url: emptyToNull(d.url),
    notes: emptyToNull(d.notes),
    targetMonth: zonedDayStart(`${d.targetMonth}-01`, appTz()),
  };
}

function done() {
  revalidatePath("/", "layout");
}

export async function createArtifact(input: ArtifactInput): Promise<ActionResult<string>> {
  const parsed = artifactSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  // Sources that were deleted in the meantime are just dropped.
  const [note, pm] = await Promise.all([
    d.sourceNoteId
      ? db.note.findUnique({ where: { id: d.sourceNoteId }, select: { id: true } })
      : null,
    d.sourcePostmortemId
      ? db.postmortem.findUnique({ where: { id: d.sourcePostmortemId }, select: { id: true } })
      : null,
  ]);
  const base = data(d);
  const a = await db.artifact.create({
    data: {
      ...base,
      publishedAt: nextPublishedAt(base.status, null),
      sourceNoteId: note?.id ?? null,
      sourcePostmortemId: pm?.id ?? null,
    },
  });
  done();
  return { ok: true, data: a.id };
}

export async function updateArtifact(
  artifactId: string,
  input: ArtifactInput,
): Promise<ActionResult> {
  const parsed = artifactSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(artifactId).success)
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  const prev = await db.artifact.findUnique({
    where: { id: artifactId },
    select: { publishedAt: true },
  });
  if (!prev) return { ok: false, error: "This artifact was deleted." };
  const base = data(parsed.data);
  await db.artifact.update({
    where: { id: artifactId },
    data: { ...base, publishedAt: nextPublishedAt(base.status, prev.publishedAt) },
  });
  done();
  return { ok: true };
}

export async function setArtifactStatus(artifactId: string, next: string): Promise<ActionResult> {
  const s = status.safeParse(next);
  if (!s.success || !id.safeParse(artifactId).success) return { ok: false, error: "Invalid input" };
  const prev = await db.artifact.findUnique({
    where: { id: artifactId },
    select: { publishedAt: true },
  });
  if (!prev) return { ok: false, error: "This artifact was deleted." };
  await db.artifact.update({
    where: { id: artifactId },
    data: {
      status: s.data as Status,
      publishedAt: nextPublishedAt(s.data as Status, prev.publishedAt),
    },
  });
  done();
  return { ok: true };
}

export async function deleteArtifact(artifactId: string): Promise<ActionResult> {
  if (!id.safeParse(artifactId).success) return { ok: false, error: "Invalid input" };
  await db.artifact.delete({ where: { id: artifactId } }).catch(() => null);
  done();
  return { ok: true };
}
