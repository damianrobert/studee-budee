"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { referencedFileIds } from "@/lib/files";
import { resolveLinks } from "@/lib/links";
import { setTags } from "@/lib/tags";
import type { ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);
const optId = id.nullish();

const noteSchema = z.object({
  title: z.string().trim().max(300),
  content: z.string().max(500_000),
  type: z.enum(["NOTE", "EXPLAIN_IT"]),
  projectId: optId,
  topicId: optId,
  tags: z.array(z.string().max(60)).max(30),
  pinned: z.boolean(),
});

export type NoteInput = z.input<typeof noteSchema>;

async function noteData(d: z.output<typeof noteSchema>) {
  const links = await resolveLinks(d.projectId ?? null, d.topicId ?? null);
  if (!links) return null;
  // Attachments are the uploaded files the content links to.
  const ids = referencedFileIds(d.content);
  const files = ids.length
    ? await db.fileAsset.findMany({ where: { id: { in: ids } }, select: { id: true } })
    : [];
  return {
    title: d.title || "Untitled",
    content: d.content,
    type: d.type,
    pinned: d.pinned,
    ...links,
    tags: setTags(d.tags),
    files: { set: files },
  };
}

// Autosave doesn't revalidate: that would re-render the editor's page on every save.
// The lists that show notes are dynamic pages, so they're fresh on navigation anyway.

export async function createNote(input: NoteInput): Promise<ActionResult<string>> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = await noteData(parsed.data);
  if (!data) return { ok: false, error: "That topic doesn't belong to the chosen project." };
  const { tags, files, ...rest } = data;
  const note = await db.note.create({
    data: {
      ...rest,
      tags: { connectOrCreate: tags.connectOrCreate },
      files: { connect: files.set },
    },
  });
  return { ok: true, data: note.id };
}

export async function updateNote(noteId: string, input: NoteInput): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(noteId).success)
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  const data = await noteData(parsed.data);
  if (!data) return { ok: false, error: "That topic doesn't belong to the chosen project." };
  const exists = await db.note.findUnique({ where: { id: noteId }, select: { id: true } });
  if (!exists) return { ok: false, error: "This note was deleted." };
  await db.note.update({ where: { id: noteId }, data });
  return { ok: true };
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  if (!id.safeParse(noteId).success) return { ok: false, error: "Invalid input" };
  await db.note.delete({ where: { id: noteId } }).catch(() => null);
  revalidatePath("/", "layout");
  redirect("/notes");
}
