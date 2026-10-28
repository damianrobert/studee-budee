"use client";

import { LOOP_STAGES, STAGE_INFO, type SessionStage } from "@/lib/stages";
import { cn } from "@/lib/utils";

export function StagePicker({
  value,
  onChange,
  name,
}: {
  value: SessionStage | null;
  onChange: (v: SessionStage | null) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Loop stage</legend>
      <div className="flex flex-wrap gap-2">
        {LOOP_STAGES.map((s) => {
          const checked = value === s;
          return (
            <label
              key={s}
              title={STAGE_INFO[s].description}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                checked ? "border-foreground bg-accent" : "hover:bg-accent/60",
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                onChange={() => onChange(s)}
                onClick={() => checked && onChange(null)}
              />
              <span aria-hidden className={cn("size-2 rounded-full", STAGE_INFO[s].color)} />
              {STAGE_INFO[s].label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
