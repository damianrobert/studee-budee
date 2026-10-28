"use client";

import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import type { ProjectOption } from "@/lib/sessions";
import { useDebouncedQuery, useQueryParams } from "@/components/use-query-params";

/** Search + filters, all kept in the URL so results are server-rendered and linkable. */
export function NoteFilters({ projects, tags }: { projects: ProjectOption[]; tags: string[] }) {
  const { params, update } = useQueryParams();
  const [q, setQ] = useDebouncedQuery(update, params.get("q") ?? "");

  const project = params.get("project") ?? "";
  const topics = projects.find((p) => p.id === project)?.topics ?? [];

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search notes"
          placeholder="Search notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>
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
        aria-label="Filter by type"
        className="w-auto"
        value={params.get("type") ?? ""}
        onChange={(e) => update({ type: e.target.value || null })}
      >
        <option value="">All types</option>
        <option value="NOTE">Notes</option>
        <option value="EXPLAIN_IT">Explain-it</option>
      </Select>
      {tags.length > 0 && (
        <Select
          aria-label="Filter by tag"
          className="w-auto"
          value={params.get("tag") ?? ""}
          onChange={(e) => update({ tag: e.target.value || null })}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
