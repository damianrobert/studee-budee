"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { setTheme, updateGoals } from "@/lib/actions/settings";
import type { Theme } from "@/lib/theme";

export function ThemeSelect({ value }: { value: Theme }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Field label="Theme" htmlFor="theme">
      <Select
        id="theme"
        className="w-48"
        defaultValue={value}
        disabled={pending}
        onChange={(e) => {
          const t = e.target.value;
          startTransition(async () => void (await setTheme(t)));
        }}
      >
        <option value="system">Follow system</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>
    </Field>
  );
}

export function GoalsForm({
  weeklyTarget,
  minSessionMinutes,
}: {
  weeklyTarget: number;
  minSessionMinutes: number;
}) {
  const [target, setTarget] = React.useState(String(weeklyTarget));
  const [minMin, setMinMin] = React.useState(String(minSessionMinutes));
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateGoals({
            weeklyTarget: Number(target),
            minSessionMinutes: Number(minMin),
          });
          setMsg(res.ok ? "Saved" : res.error);
        });
      }}
    >
      <div className="flex flex-wrap gap-4">
        <Field label="Weekly session target" htmlFor="weekly-target">
          <Input
            id="weekly-target"
            type="number"
            min={1}
            max={21}
            className="w-32"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <Field label="Minutes for a day to count" htmlFor="min-minutes">
          <Input
            id="min-minutes"
            type="number"
            min={1}
            max={240}
            className="w-32"
            value={minMin}
            onChange={(e) => setMinMin(e.target.value)}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Weeks start on Monday.</p>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        {msg && (
          <span role="status" className="text-xs text-muted-foreground">
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}
