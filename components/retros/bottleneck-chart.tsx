"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { label: string; count: number };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium">{row.label}</p>
      <p className="text-muted-foreground">
        {row.count} week{row.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Horizontal bars: how often each bottleneck was named in the last 12 weeks. */
export function BottleneckChart({ data }: { data: Row[] }) {
  const max = Math.max(...data.map((d) => d.count));
  return (
    <figure>
      <div style={{ height: data.length * 36 + 32 }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              allowDecimals={false}
              domain={[0, Math.max(max, 3)]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={130}
              tick={{ fill: "var(--foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)" }} />
            <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* A table with sr-only still lays out at full width, so the wrapper clips it. */}
      <div className="sr-only">
        <table>
          <caption>Bottleneck frequency, last 12 weeks</caption>
          <thead>
            <tr>
              <th>Bottleneck</th>
              <th>Weeks</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
