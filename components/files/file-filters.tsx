"use client";

import { LayoutGrid, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useDebouncedQuery, useQueryParams } from "@/components/use-query-params";

export function FileFilters({ projects }: { projects: { id: string; name: string }[] }) {
  const { params, update } = useQueryParams();
  const [q, setQ] = useDebouncedQuery(update, params.get("q") ?? "");
  const view = params.get("view") === "list" ? "list" : "grid";

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search files by name"
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>
      <Select
        aria-label="Filter by project"
        className="w-auto"
        value={params.get("project") ?? ""}
        onChange={(e) => update({ project: e.target.value || null })}
      >
        <option value="">All projects</option>
        <option value="none">No project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <div className="flex rounded-md border" role="group" aria-label="View">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Grid view"
          aria-pressed={view === "grid"}
          className={view === "grid" ? "bg-accent" : ""}
          onClick={() => update({ view: null })}
        >
          <LayoutGrid />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="List view"
          aria-pressed={view === "list"}
          className={view === "list" ? "bg-accent" : ""}
          onClick={() => update({ view: "list" })}
        >
          <List />
        </Button>
      </div>
    </div>
  );
}
