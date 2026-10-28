import { aiEnabled } from "@/lib/ai/config";
import { db } from "@/lib/db";
import { getProjectOptions } from "@/lib/sessions";
import { NoteEditor } from "@/components/notes/note-editor";

export const metadata = { title: "New note" };

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; projectId?: string; topicId?: string }>;
}) {
  const sp = await searchParams;
  const [projects, tags] = await Promise.all([
    getProjectOptions(),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  // Only pre-fill links that exist; a topic also selects its project.
  const topic = sp.topicId
    ? projects
        .flatMap((p) => p.topics.map((t) => ({ ...t, projectId: p.id })))
        .find((t) => t.id === sp.topicId)
    : undefined;
  const projectId = topic?.projectId ?? projects.find((p) => p.id === sp.projectId)?.id ?? null;

  return (
    <NoteEditor
      note={null}
      initial={{
        type: sp.type === "EXPLAIN_IT" ? "EXPLAIN_IT" : "NOTE",
        projectId,
        topicId: topic?.id ?? null,
      }}
      projects={projects}
      tagSuggestions={tags.map((t) => t.name)}
      ai={aiEnabled()}
    />
  );
}
