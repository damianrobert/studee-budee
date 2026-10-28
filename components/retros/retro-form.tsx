"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Bottleneck } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useQueryParams } from "@/components/use-query-params";
import { createRetro, updateRetro, type RetroInput } from "@/lib/actions/retros";
import { BOTTLENECKS, BOTTLENECK_LABEL } from "@/lib/retros";
import { cn } from "@/lib/utils";

type Values = {
  shipped: string;
  slowedDown: string;
  bottleneck: Bottleneck | "";
  nextWeekGoal: string;
  energy: number | null;
};

const ENERGY_LABEL = ["", "Drained", "Low", "Okay", "Good", "Great"];

/** Pill-style radio group (keyboard: arrow keys move between options, like any radio group). */
function Pills<T extends string | number>({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: { value: T; label: string }[];
  value: T | null | "";
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-accent",
              value === o.value &&
                "border-foreground bg-foreground text-background hover:bg-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function RetroForm({
  retro,
  week,
  weekOptions,
}: {
  retro?: { id: string } & Values;
  /** The week (Monday key) the retro is for. */
  week: string;
  /** New retros only: weeks without a retro, as [key, label]. */
  weekOptions?: [string, string][];
}) {
  const router = useRouter();
  const { update } = useQueryParams();
  const [v, setV] = React.useState<Values>(
    retro ?? { shipped: "", slowedDown: "", bottleneck: "", nextWeekGoal: "", energy: null },
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set =
    (k: "shipped" | "slowedDown" | "nextWeekGoal") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.bottleneck) return setError("Pick the main bottleneck.");
    const input: RetroInput = { ...v, bottleneck: v.bottleneck };
    startTransition(async () => {
      const res = retro ? await updateRetro(retro.id, input) : await createRetro(week, input);
      if (!res.ok) {
        if (res.code?.startsWith("exists:"))
          return router.push(`/retros/${res.code.slice("exists:".length)}/edit`);
        return setError(res.error);
      }
      router.push("/retros");
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
      }}
    >
      {weekOptions && weekOptions.length > 1 && (
        <Field label="Week" htmlFor="retro-week">
          <Select
            id="retro-week"
            className="block w-auto"
            value={week}
            onChange={(e) => update({ week: e.target.value })}
          >
            {weekOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="What did I ship?" htmlFor="retro-shipped" hint="Outputs, not hours.">
        <Textarea
          id="retro-shipped"
          rows={4}
          required
          value={v.shipped}
          onChange={set("shipped")}
          placeholder="Commits, notes, postmortems, a topic that reached Done…"
          autoFocus
        />
      </Field>
      <Field label="What slowed me down?" htmlFor="retro-slowed">
        <Textarea
          id="retro-slowed"
          rows={3}
          required
          value={v.slowedDown}
          onChange={set("slowedDown")}
        />
      </Field>
      <Pills
        name="bottleneck"
        label="Main bottleneck"
        options={BOTTLENECKS.map((b) => ({ value: b, label: BOTTLENECK_LABEL[b] }))}
        value={v.bottleneck}
        onChange={(bottleneck) => setV((prev) => ({ ...prev, bottleneck }))}
      />
      <Field
        label="One goal for next week"
        htmlFor="retro-goal"
        hint="Shown on Today all week. Make it small and concrete."
      >
        <Input
          id="retro-goal"
          required
          maxLength={500}
          value={v.nextWeekGoal}
          onChange={set("nextWeekGoal")}
          placeholder="e.g. Get the Helm chart deploying to kind"
        />
      </Field>
      <Pills
        name="energy"
        label="Energy (optional)"
        options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} · ${ENERGY_LABEL[n]}` }))}
        value={v.energy}
        onChange={(energy) => setV((prev) => ({ ...prev, energy }))}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save retro"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/retros")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
