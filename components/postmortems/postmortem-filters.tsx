"use client";

import { Select } from "@/components/ui/input";
import type { ProjectOption } from "@/lib/sessions";
import { useQueryParams } from "@/components/use-query-params";

export function PostmortemFilters({ projects }: { projects: ProjectOption[] }) {
  const { params, update } = useQueryParams();
  const project = params.get("project") ?? "";
  const topics = projects.find((p) => p.id === project)?.topics ?? [];

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Select
        aria-label="Filter by project"
        className="w-auto"
        value={project}
        onChange={(e) => update({ project: e.target.value || null, topic: null })}
      >
        <option value="">All projects</option>
        <option value="none">No project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      {topics.length > 0 && (
        <Select
          aria-label="Filter by topic"
          className="w-auto"
          value={params.get("topic") ?? ""}
          onChange={(e) => update({ topic: e.target.value || null })}
        >
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
      )}
      <Select
        aria-label="Filter by kind"
        className="w-auto"
        value={params.get("kind") ?? ""}
        onChange={(e) => update({ kind: e.target.value || null })}
      >
        <option value="">Real and chaos</option>
        <option value="real">Real incidents</option>
        <option value="chaos">Chaos (deliberate)</option>
      </Select>
    </div>
  );
}
