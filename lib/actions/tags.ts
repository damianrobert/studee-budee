"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeTag } from "@/lib/tags";
import type { ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);

const usage = {
  notes: { select: { id: true } },
  postmortems: { select: { id: true } },
  readingItems: { select: { id: true } },
  workObservations: { select: { id: true } },
} as const;

function revalidate() {
  // Tag names show up in lists, filters and the capture/editor suggestions.
  revalidatePath("/", "layout");
}

/**
 * Renames a tag. If another tag already has that name, nothing changes and the result
 * carries `code: "exists:<id>"` so the UI can offer a merge instead.
 */
export async function renameTag(
  tagId: string,
  newName: string,
): Promise<ActionResult<{ name: string }>> {
  if (!id.safeParse(tagId).success) return { ok: false, error: "Invalid input" };
  const name = normalizeTag(newName);
  if (!name) return { ok: false, error: "Enter a name (letters, numbers, dashes)." };
  const [tag, clash] = await Promise.all([
    db.tag.findUnique({ where: { id: tagId } }),
    db.tag.findUnique({ where: { name } }),
  ]);
  if (!tag) return { ok: false, error: "That tag no longer exists." };
  if (clash && clash.id !== tagId)
    return { ok: false, error: `"${name}" already exists.`, code: `exists:${clash.id}` };
  if (tag.name !== name) await db.tag.update({ where: { id: tagId }, data: { name } });
  revalidate();
  return { ok: true, data: { name } };
}

/** Moves everything tagged `sourceId` to `targetId`, then deletes the source tag. */
export async function mergeTags(sourceId: string, targetId: string): Promise<ActionResult> {
  if (!id.safeParse(sourceId).success || !id.safeParse(targetId).success)
    return { ok: false, error: "Invalid input" };
  if (sourceId === targetId) return { ok: false, error: "Pick a different tag." };
  const ok = await db.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.tag.findUnique({ where: { id: sourceId }, include: usage }),
      tx.tag.findUnique({ where: { id: targetId }, select: { id: true } }),
    ]);
    if (!source || !target) return false;
    await tx.tag.update({
      where: { id: targetId },
      data: {
        notes: { connect: source.notes },
        postmortems: { connect: source.postmortems },
        readingItems: { connect: source.readingItems },
        workObservations: { connect: source.workObservations },
      },
    });
    await tx.tag.delete({ where: { id: sourceId } });
    return true;
  });
  if (!ok) return { ok: false, error: "That tag no longer exists." };
  revalidate();
  return { ok: true };
}

/** Removes the tag from everything it's on; the items themselves stay. */
export async function deleteTag(tagId: string): Promise<ActionResult> {
  if (!id.safeParse(tagId).success) return { ok: false, error: "Invalid input" };
  await db.tag.delete({ where: { id: tagId } }).catch(() => null);
  revalidate();
  return { ok: true };
}

export async function deleteUnusedTags(): Promise<ActionResult<{ count: number }>> {
  const { count } = await db.tag.deleteMany({
    where: {
      notes: { none: {} },
      postmortems: { none: {} },
      readingItems: { none: {} },
      workObservations: { none: {} },
    },
  });
  revalidate();
  return { ok: true, data: { count } };
}
