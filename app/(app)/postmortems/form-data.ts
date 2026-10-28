import { db } from "@/lib/db";
import { getProjectOptions } from "@/lib/sessions";

/** Options for the postmortem form. `keepProjectId` keeps a link to an archived project visible. */
export async function getPostmortemFormData(keepProjectId?: string | null) {
  const [projects, experiments, tags] = await Promise.all([
    getProjectOptions(),
    db.chaosExperiment.findMany({
      orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { title: "asc" }],
      select: { id: true, title: true },
    }),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  if (keepProjectId && !projects.some((p) => p.id === keepProjectId)) {
    const p = await db.project.findUnique({
      where: { id: keepProjectId },
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
  return { projects, experiments, tagSuggestions: tags.map((t) => t.name) };
}
