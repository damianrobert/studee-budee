"use client";

import { usePathname, useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";

export function ProjectFilter({
  projects,
  value,
  param = "project",
}: {
  projects: { id: string; name: string }[];
  value: string;
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Select
      aria-label="Filter by project"
      className="w-auto"
      value={value}
      onChange={(e) =>
        router.push(e.target.value ? `${pathname}?${param}=${e.target.value}` : pathname)
      }
    >
      <option value="">All projects</option>
      <option value="none">No project</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}
