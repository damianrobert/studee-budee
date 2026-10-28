import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PostmortemForm } from "@/components/postmortems/postmortem-form";
import { getPostmortemFormData } from "../../form-data";

export const metadata = { title: "Edit postmortem" };

export default async function EditPostmortemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pm = await db.postmortem.findUnique({
    where: { id },
    include: {
      tags: { select: { name: true }, orderBy: { name: "asc" } },
      files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
    },
  });
  if (!pm) notFound();
  const { projects, experiments, tagSuggestions } = await getPostmortemFormData(pm.projectId);

  return (
    <PostmortemForm
      key={pm.id}
      postmortem={{
        id: pm.id,
        title: pm.title,
        occurredAt: pm.occurredAt,
        whatBroke: pm.whatBroke,
        symptoms: pm.symptoms,
        investigation: pm.investigation,
        rootCause: pm.rootCause,
        fix: pm.fix,
        lessons: pm.lessons,
        wasDeliberate: pm.wasDeliberate,
        projectId: pm.projectId,
        topicId: pm.topicId,
        chaosExperimentId: pm.chaosExperimentId,
        tags: pm.tags.map((t) => t.name),
        files: pm.files,
      }}
      projects={projects}
      experiments={experiments}
      tagSuggestions={tagSuggestions}
    />
  );
}
