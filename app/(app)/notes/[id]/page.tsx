import { notFound } from "next/navigation";
import { aiEnabled } from "@/lib/ai/config";
import { db } from "@/lib/db";
import { getProjectOptions } from "@/lib/sessions";
import { NoteEditor } from "@/components/notes/note-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const n = await db.note.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: n?.title ?? "Note" };
}

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [note, projects, tags] = await Promise.all([
    db.note.findUnique({
      where: { id },
      include: {
        tags: { select: { name: true }, orderBy: { name: "asc" } },
        files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
      },
    }),
    getProjectOptions(),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  if (!note) notFound();

  // An archived project isn't in the picker options; keep the note's link visible anyway.
  if (note.projectId && !projects.some((p) => p.id === note.projectId)) {
    const p = await db.project.findUnique({
      where: { id: note.projectId },
      select: {
        id: true,
        name: true,
        status: true,
        topics: {
          select: { id: true, title: true },
          orderBy: [{ stage: "asc" }, { position: "asc" }],
        },
      },
    });
    if (p) projects.push(p);
  }

  return (
    <NoteEditor
      key={note.id}
      note={{
        id: note.id,
        title: note.title,
        content: note.content,
        type: note.type,
        projectId: note.projectId,
        topicId: note.topicId,
        tags: note.tags.map((t) => t.name),
        pinned: note.pinned,
        files: note.files,
      }}
      projects={projects}
      tagSuggestions={tags.map((t) => t.name)}
      ai={aiEnabled()}
    />
  );
}
