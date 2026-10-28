"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { removeStoredFile } from "@/lib/uploads";
import type { ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);

/** Deletes the record and the file on disk. Links to it in notes simply stop resolving. */
export async function deleteFile(fileId: string): Promise<ActionResult> {
  if (!id.safeParse(fileId).success) return { ok: false, error: "Invalid input" };
  const file = await db.fileAsset.delete({ where: { id: fileId } }).catch(() => null);
  if (file) await removeStoredFile(file.storedName);
  revalidatePath("/files");
  revalidatePath("/notes");
  if (file?.projectId) revalidatePath(`/projects/${file.projectId}`);
  return { ok: true };
}

export async function setFileProject(
  fileId: string,
  projectId: string | null,
): Promise<ActionResult> {
  if (!id.safeParse(fileId).success || !id.nullable().safeParse(projectId).success)
    return { ok: false, error: "Invalid input" };
  const before = await db.fileAsset.findUnique({
    where: { id: fileId },
    select: { projectId: true },
  });
  if (!before) return { ok: false, error: "File not found" };
  await db.fileAsset.update({ where: { id: fileId }, data: { projectId } });
  revalidatePath("/files");
  for (const p of [before.projectId, projectId]) if (p) revalidatePath(`/projects/${p}`);
  return { ok: true };
}
