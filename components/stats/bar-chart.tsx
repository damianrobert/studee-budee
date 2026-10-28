"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type BarRow = {
  /** Axis label (short). */
  label: string;
  /** Tooltip / table heading (long). */
  title: string;
  value: number | null;
  /** Shown in the tooltip and table instead of the bare value. */
  text: string;
  /** Secondary tooltip line. */
  detail?: string;
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: BarRow }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium">{row.title}</p>
      <p>{row.text}</p>
      {row.detail && <p className="text-muted-foreground">{row.detail}</p>}
    </div>
  );
}

/** Single-series vertical bar chart with an optional dashed reference line (e.g. a target). */
export function StatBarChart({
  data,
  caption,
  valueHeading,
  target,
  targetLabel,
  max,
  unit = "",
  height = 180,
}: {
  data: BarRow[];
  caption: string;
  valueHeading: string;
  target?: number;
  targetLabel?: string;
  max?: number;
  unit?: string;
  height?: number;
}) {
  const top = Math.max(...data.map((d) => d.value ?? 0), target ?? 0, 3);
  return (
    <figure>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, max ?? top]}
              tickFormatter={(v: number) => `${v}${unit}`}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)" }} />
            <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            {target !== undefined && (
              <ReferenceLine
                y={target}
                stroke="var(--foreground)"
                strokeOpacity={0.55}
                strokeDasharray="4 4"
                label={{
                  value: targetLabel ?? `Target ${target}`,
                  position: "insideTopRight",
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* A table with sr-only still lays out at full width, so the wrapper clips it. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th>Period</th>
              <th>{valueHeading}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.title}>
                <td>{d.title}</td>
                <td>{d.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
