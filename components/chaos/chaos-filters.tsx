"use client";

import { Select } from "@/components/ui/input";
import { DIFFICULTY_LABEL } from "@/lib/chaos";
import { useQueryParams } from "@/components/use-query-params";

export function ChaosFilters({ categories }: { categories: string[] }) {
  const { params, update } = useQueryParams();
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Select
        aria-label="Filter by status"
        className="w-auto"
        value={params.get("status") ?? ""}
        onChange={(e) => update({ status: e.target.value || null })}
      >
        <option value="">Not done</option>
        <option value="done">Done</option>
        <option value="all">All</option>
      </Select>
      <Select
        aria-label="Filter by category"
        className="w-auto"
        value={params.get("category") ?? ""}
        onChange={(e) => update({ category: e.target.value || null })}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by difficulty"
        className="w-auto"
        value={params.get("difficulty") ?? ""}
        onChange={(e) => update({ difficulty: e.target.value || null })}
      >
        <option value="">All difficulties</option>
        {([1, 2, 3] as const).map((d) => (
          <option key={d} value={d}>
            {DIFFICULTY_LABEL[d]}
          </option>
        ))}
      </Select>
    </div>
  );
}
