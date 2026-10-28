"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { setItemDone, setPracticeDone } from "@/lib/actions/courses";
import { cn } from "@/lib/utils";

/** A round checkbox that marks a course item or practice task done (optimistic). */
export function DoneToggle({
  kind,
  id,
  done,
  label,
  className,
}: {
  kind: "item" | "practice";
  id: string;
  done: boolean;
  label: string;
  className?: string;
}) {
  const [checked, setChecked] = React.useState(done);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();
  React.useEffect(() => setChecked(done), [done]);
  return (
    <span className={cn("inline-flex flex-col items-center", className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        title={error ?? (checked ? "Done — click to undo" : "Mark done")}
        onClick={() => {
          const next = !checked;
          setChecked(next);
          setError(null);
          startTransition(async () => {
            const res = await (kind === "item" ? setItemDone : setPracticeDone)(id, next);
            if (!res.ok) {
              setChecked(!next);
              setError(res.error);
            }
          });
        }}
        className={cn(
          "flex size-5 items-center justify-center rounded-full border-2 transition-colors",
          checked
            ? "border-success bg-success text-background"
            : "border-muted-foreground/40 hover:border-foreground",
          error && "border-destructive",
        )}
      >
        {checked && <Check aria-hidden className="size-3" strokeWidth={3} />}
      </button>
    </span>
  );
}
