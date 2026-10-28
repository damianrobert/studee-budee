import type { LoopStage } from "@prisma/client";
import { STAGES, STAGE_INFO } from "@/lib/stages";
import { cn } from "@/lib/utils";

export function StageBar({
  counts,
  showLegend = true,
}: {
  counts: Partial<Record<LoopStage, number>>;
  showLegend?: boolean;
}) {
  const total = STAGES.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const summary = STAGES.map((s) => `${STAGE_INFO[s].label} ${counts[s] ?? 0}`).join(", ");
  return (
    <div className="space-y-2">
      <div
        className="flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Topics per stage: ${summary}`}
      >
        {total > 0 &&
          STAGES.map((s) =>
            counts[s] ? (
              <div
                key={s}
                className={cn(STAGE_INFO[s].color)}
                style={{ width: `${((counts[s] ?? 0) / total) * 100}%` }}
              />
            ) : null,
          )}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-hidden>
          {STAGES.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn("size-2 rounded-full", STAGE_INFO[s].color)} />
              {STAGE_INFO[s].label} {counts[s] ?? 0}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
