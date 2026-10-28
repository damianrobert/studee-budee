"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

/** Shown while the AI plans and researches; these calls take from a few seconds to a minute or two. */
export function AiWorking({ children }: { children: React.ReactNode }) {
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
      <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin" />
      <div className="space-y-0.5">
        <p>{children}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{seconds} s</p>
      </div>
    </div>
  );
}
