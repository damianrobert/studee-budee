"use client";

import { useEffect, useRef, useState } from "react";
import type { HeatCell, HeatLevel } from "@/lib/stats";
import { cn } from "@/lib/utils";

const LEVEL_CLASS: Record<HeatLevel, string> = {
  0: "bg-muted",
  1: "bg-heat-1",
  2: "bg-heat-2",
  3: "bg-heat-3",
  4: "bg-heat-4",
};

const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

function dayLabel(key: string) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function describe(c: HeatCell, minMinutes: number) {
  if (c.sessions === 0) return `${dayLabel(c.day)}: no sessions`;
  const s = `${c.sessions} session${c.sessions === 1 ? "" : "s"}, ${c.minutes} min`;
  return `${dayLabel(c.day)}: ${s}${c.minutes < minMinutes ? " (not counted)" : ""}`;
}

/** GitHub-style activity grid: one column per week (Mon→Sun), newest on the right. */
export function Heatmap({
  weeks,
  minMinutes,
}: {
  weeks: (HeatCell | null)[][];
  minMinutes: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HeatCell | null>(null);

  // On narrow screens show the most recent weeks first.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // A month label above the first week that starts in that month.
  const monthLabels = weeks.map((w, i) => {
    const first = w.find((c) => c)?.day;
    if (!first) return "";
    const prev = weeks[i - 1]?.find((c) => c)?.day;
    if (prev && prev.slice(0, 7) === first.slice(0, 7)) return "";
    if (i === 0 && Number(first.slice(8)) > 14) return "";
    return new Date(`${first}T12:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      timeZone: "UTC",
    });
  });

  return (
    <div className="space-y-3">
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="inline-flex gap-1.5" role="img" aria-label="Activity, last 365 days">
          <div className="grid grid-rows-[1rem_repeat(7,0.75rem)] gap-[3px] pr-1 text-[10px] leading-3 text-muted-foreground">
            <span />
            {WEEKDAYS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          {weeks.map((week, i) => (
            <div key={i} className="grid grid-rows-[1rem_repeat(7,0.75rem)] gap-[3px]">
              <span className="w-3 overflow-visible text-[10px] leading-3 whitespace-nowrap text-muted-foreground">
                {monthLabels[i]}
              </span>
              {week.map((c, j) =>
                c ? (
                  <span
                    key={j}
                    title={describe(c, minMinutes)}
                    onMouseEnter={() => setHover(c)}
                    onMouseLeave={() => setHover(null)}
                    className={cn(
                      "size-3 rounded-[3px]",
                      LEVEL_CLASS[c.level],
                      hover?.day === c.day && "ring-2 ring-foreground/60",
                    )}
                    data-level={c.level}
                    data-day={c.day}
                  />
                ) : (
                  <span key={j} className="size-3" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <p aria-live="polite" className="min-h-4">
          {hover ? describe(hover, minMinutes) : "Hover a day for details."}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden>
          <span>Less</span>
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <span key={l} className={cn("size-3 rounded-[3px]", LEVEL_CLASS[l])} />
          ))}
          <span>More</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Lightest blue: sessions under {minMinutes} min (day not counted). Darker: counted days with
        1, 2, 3+ sessions.
      </p>
    </div>
  );
}
