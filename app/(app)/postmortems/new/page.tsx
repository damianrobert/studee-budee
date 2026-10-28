import { db } from "@/lib/db";
import { PostmortemForm } from "@/components/postmortems/postmortem-form";
import { getPostmortemFormData } from "../form-data";

export const metadata = { title: "New postmortem" };

export default async function NewPostmortemPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; topicId?: string; chaosId?: string }>;
}) {
  const sp = await searchParams;
  const [{ projects, experiments, tagSuggestions }, experiment] = await Promise.all([
    getPostmortemFormData(),
    sp.chaosId
      ? db.chaosExperiment.findUnique({
          where: { id: sp.chaosId },
          select: { id: true, title: true },
        })
      : null,
  ]);
  // Only pre-fill links that exist; a topic also selects its project.
  const topic = sp.topicId
    ? projects
        .flatMap((p) => p.topics.map((t) => ({ ...t, projectId: p.id })))
        .find((t) => t.id === sp.topicId)
    : undefined;
  const projectId = topic?.projectId ?? projects.find((p) => p.id === sp.projectId)?.id ?? null;

  return (
    <PostmortemForm
      postmortem={null}
      initial={{
        projectId,
        topicId: topic?.id ?? null,
        chaosExperimentId: experiment?.id ?? null,
        title: experiment?.title ?? "",
      }}
      projects={projects}
      experiments={experiments}
      tagSuggestions={tagSuggestions}
    />
  );
}
