"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebouncedQuery, useQueryParams } from "@/components/use-query-params";

export function CardSearch() {
  const { params, update } = useQueryParams();
  const [q, setQ] = useDebouncedQuery(update, params.get("q") ?? "");
  return (
    <div className="relative mb-4">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        aria-label="Search cards"
        placeholder="Search cards…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="pl-8"
      />
    </div>
  );
}
