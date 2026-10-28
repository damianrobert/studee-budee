// The roadmap drawn as a path: an overview line of stages on top, then each stage as a node on
// a vertical spine with its steps as cards. A card opens the step drawer (`?step=`).

import Link from "next/link";
import type { ResourceKind, RoadmapStepStatus } from "@prisma/client";
import { Check, Hammer } from "lucide-react";
import { progress, type Progress } from "@/lib/roadmaps";
import { cn } from "@/lib/utils";
import { KindIcon } from "./kind-icon";
import { StatusIcon } from "./status-icon";

export type MapStep = {
  id: string;
  title: string;
  description: string | null;
  practice: string | null;
  status: RoadmapStepStatus;
  kinds: ResourceKind[];
  resourceCount: number;
};
export type MapStage = { id: string; title: string; description: string | null; steps: MapStep[] };

function StageNode({ n, p, className }: { n: number; p: Progress; className?: string }) {
  const complete = p.total > 0 && p.done === p.total;
  const started = p.done + p.doing > 0;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-2 bg-background font-semibold tabular-nums",
        complete
          ? "border-success bg-success text-background"
          : started
            ? "border-chart-1 text-chart-1"
            : "text-muted-foreground",
        className,
      )}
    >
      {complete ? <Check aria-label="Complete" className="size-4" strokeWidth={3} /> : n}
    </span>
  );
}

/** The stages as stops on a line, linking to each stage below. */
export function StageOverview({ stages }: { stages: MapStage[] }) {
  return (
    <nav aria-label="Stages" className="overflow-x-auto pb-1">
      <ol className="flex min-w-max">
        {stages.map((s, i) => {
          const p = progress(s.steps);
          const complete = p.total > 0 && p.done === p.total;
          return (
            <li key={s.id} className="relative w-32">
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[17px] left-1/2 h-0.5 w-full",
                    complete ? "bg-success" : "bg-border",
                  )}
                />
              )}
              <a
                href={`#stage-${i + 1}`}
                className="group relative flex flex-col items-center gap-1.5 px-2 text-center"
              >
                <StageNode n={i + 1} p={p} className="size-9 text-sm" />
                <span className="line-clamp-2 text-xs font-medium group-hover:underline">
                  {s.title}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {p.done}/{p.total}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function RoadmapMap({
  stages,
  selectedStepId,
}: {
  stages: MapStage[];
  selectedStepId?: string;
}) {
  return (
    <ol>
      {stages.map((s, i) => {
        const p = progress(s.steps);
        return (
          <li
            key={s.id}
            id={`stage-${i + 1}`}
            aria-labelledby={`stage-${i + 1}-title`}
            className="relative scroll-mt-20 pb-10 pl-14 last:pb-0"
          >
            {i < stages.length - 1 && (
              <span aria-hidden className="absolute top-10 bottom-0 left-[19px] w-0.5 bg-border" />
            )}
            <StageNode n={i + 1} p={p} className="absolute top-0 left-0 size-10" />
            <div className="flex min-h-10 flex-col justify-center">
              <p className="text-xs text-muted-foreground tabular-nums">
                Stage {i + 1} · {p.done} of {p.total} done
              </p>
              <h2 id={`stage-${i + 1}-title`} className="text-lg leading-snug font-semibold">
                {s.title}
              </h2>
            </div>
            {s.description && (
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">{s.description}</p>
            )}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {s.steps.map((t) => (
                <li key={t.id}>
                  <StepCard step={t} selected={t.id === selectedStepId} />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({ step, selected }: { step: MapStep; selected: boolean }) {
  return (
    <Link
      href={`?step=${step.id}`}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex h-full flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        step.status === "DONE" && "border-success/40 bg-success/5",
        step.status === "DOING" && "border-chart-1/50",
        selected && "ring-2 ring-ring",
      )}
    >
      <span className="flex items-start gap-2">
        <StatusIcon status={step.status} className="mt-0.5 size-4" />
        <span className="leading-snug font-medium group-hover:underline">{step.title}</span>
      </span>
      {step.description && (
        <span className="line-clamp-2 text-xs text-muted-foreground">{step.description}</span>
      )}
      <span className="mt-auto flex items-center gap-3 pt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {step.kinds.slice(0, 4).map((k) => (
            <KindIcon key={k} kind={k} className="size-3.5" />
          ))}
          <span className="tabular-nums">
            {step.resourceCount
              ? `${step.resourceCount} resource${step.resourceCount === 1 ? "" : "s"}`
              : "No resources"}
          </span>
        </span>
        {step.practice && (
          <span className="flex items-center gap-1" title="Has a practice task">
            <Hammer aria-hidden className="size-3.5" /> Practice
          </span>
        )}
      </span>
    </Link>
  );
}
