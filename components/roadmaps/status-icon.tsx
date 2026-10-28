import type { RoadmapStepStatus } from "@prisma/client";
import { CircleCheck, CircleDashed, CircleDot } from "lucide-react";
import { STEP_STATUS_INFO } from "@/lib/roadmaps";
import { cn } from "@/lib/utils";

const ICON = { TODO: CircleDashed, DOING: CircleDot, DONE: CircleCheck };
const COLOR = { TODO: "text-muted-foreground", DOING: "text-chart-1", DONE: "text-success" };

export function StatusIcon({
  status,
  className,
  plain,
}: {
  status: RoadmapStepStatus;
  className?: string;
  /** Inherit the text colour instead of the status colour. */
  plain?: boolean;
}) {
  const Icon = ICON[status];
  return (
    <Icon
      aria-label={STEP_STATUS_INFO[status].label}
      className={cn("shrink-0", !plain && COLOR[status], className)}
    />
  );
}
