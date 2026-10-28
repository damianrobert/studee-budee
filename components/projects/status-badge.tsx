import type { ProjectStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const MAP: Record<ProjectStatus, { label: string; variant: "success" | "secondary" | "outline" }> =
  {
    ACTIVE: { label: "Active", variant: "success" },
    PAUSED: { label: "Paused", variant: "secondary" },
    DONE: { label: "Done", variant: "outline" },
    ARCHIVED: { label: "Archived", variant: "outline" },
  };

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={MAP[status].variant}>{MAP[status].label}</Badge>;
}
