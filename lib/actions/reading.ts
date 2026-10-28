"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fetchTitle, normalizeUrl, sourceFromUrl } from "@/lib/reading";
import { setTags } from "@/lib/tags";
import { emptyToNull, type ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);
const tags = z.array(z.string().max(60)).max(30);
const url = z
  .string()
  .max(2000)
  .transform((s, ctx) => {
    const u = normalizeUrl(s);
    if (!u) ctx.addIssue({ code: "custom", message: "That doesn't look like a web link." });
    return u ?? "";
  });

const addSchema = z.object({ url, tags });

const editSchema = z.object({
  url,
  title: z.string().max(300).nullish(),
  takeaway: z.string().max(500).nullish(),
  tags,
});

function done() {
  revalidatePath("/", "layout");
}

/** Saves the link; the title is fetched from the page (≤5 s), falling back to the URL. */
export async function addReadingItem(
  input: z.input<typeof addSchema>,
): Promise<ActionResult<{ id: string; title: string | null }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { url, tags } = parsed.data;
  const title = await fetchTitle(url);
  const item = await db.readingItem.create({
    data: {
      url,
      title,
      source: sourceFromUrl(url),
      tags: { connectOrCreate: setTags(tags).connectOrCreate },
    },
  });
  done();
  return { ok: true, data: { id: item.id, title } };
}

export async function updateReadingItem(
  itemId: string,
  input: z.input<typeof editSchema>,
): Promise<ActionResult> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(itemId).success)
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const res = await db.readingItem
    .update({
      where: { id: itemId },
      data: {
        url: d.url,
        title: emptyToNull(d.title),
        source: sourceFromUrl(d.url),
        takeaway: emptyToNull(d.takeaway),
        tags: setTags(d.tags),
      },
    })
    .catch(() => null);
  if (!res) return { ok: false, error: "This item was deleted." };
  done();
  return { ok: true };
}

const statusSchema = z.object({
  status: z.enum(["UNREAD", "READ", "ARCHIVED"]),
  takeaway: z.string().max(500).nullish(),
});

/**
 * Moves an item between Unread / Read / Archived. Marking read records when (and the
 * optional takeaway); moving back to Unread clears both. Archiving keeps them.
 */
export async function setReadingStatus(
  itemId: string,
  input: z.input<typeof statusSchema>,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(itemId).success)
    return { ok: false, error: "Invalid input" };
  const { status, takeaway } = parsed.data;
  const current = await db.readingItem.findUnique({
    where: { id: itemId },
    select: { readAt: true },
  });
  if (!current) return { ok: false, error: "This item was deleted." };
  await db.readingItem.update({
    where: { id: itemId },
    data:
      status === "READ"
        ? { status, readAt: current.readAt ?? new Date(), takeaway: emptyToNull(takeaway) }
        : status === "UNREAD"
          ? { status, readAt: null, takeaway: null }
          : { status },
  });
  done();
  return { ok: true };
}

export async function deleteReadingItem(itemId: string): Promise<ActionResult> {
  if (!id.safeParse(itemId).success) return { ok: false, error: "Invalid input" };
  await db.readingItem.delete({ where: { id: itemId } }).catch(() => null);
  done();
  return { ok: true };
}
