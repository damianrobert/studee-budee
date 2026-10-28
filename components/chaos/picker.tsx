"use client";

import * as React from "react";
import Link from "next/link";
import { Dices, Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Markdown } from "@/components/markdown/markdown";
import { QuickStartButton } from "@/components/sessions/quick-start-button";
import { DIFFICULTY_LABEL, pickExperiment } from "@/lib/chaos";
import { DifficultyDots } from "./difficulty-dots";
import { MarkDoneButton, type Experiment } from "./experiment-actions";

/** "Pick one for me": a random open experiment, optionally by category and difficulty. */
export function ChaosPicker({
  experiments,
  categories,
}: {
  experiments: Experiment[];
  categories: string[];
}) {
  const [category, setCategory] = React.useState("");
  const [difficulty, setDifficulty] = React.useState(0);
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const [empty, setEmpty] = React.useState(false);
  // Reads the live list, so the card reflects "done" once the page refreshes.
  const picked = experiments.find((e) => e.id === pickedId) ?? null;
  const open = experiments.filter((e) => !e.completedAt).length;

  function pick() {
    const e = pickExperiment(experiments, { category, difficulty }, pickedId);
    setPickedId(e?.id ?? null);
    setEmpty(!e);
  }

  return (
    <section
      aria-label="Pick an experiment"
      className="mb-6 space-y-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={pick} disabled={!open}>
          <Dices aria-hidden /> {picked ? "Pick another" : "Pick one for me"}
        </Button>
        <Select
          aria-label="Pick from category"
          className="w-auto"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Pick by difficulty"
          className="w-auto"
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
        >
          <option value={0}>Any difficulty</option>
          {([1, 2, 3] as const).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">{open} not done yet</span>
      </div>

      {empty && (
        <p role="status" className="text-sm text-muted-foreground">
          Nothing left to break with these filters. Try another category or add your own experiment.
        </p>
      )}

      {picked && (
        <article
          aria-label="Picked experiment"
          className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{picked.title}</h2>
            {picked.category && <Badge variant="outline">{picked.category}</Badge>}
            <DifficultyDots value={picked.difficulty} />
            {picked.completedAt && <Badge variant="success">Done</Badge>}
          </div>
          {picked.description && (
            <div className="text-sm">
              <Markdown>{picked.description}</Markdown>
            </div>
          )}
          {picked.hypothesis && (
            <p className="text-sm">
              <span className="font-medium">Hypothesis:</span>{" "}
              <span className="text-muted-foreground">{picked.hypothesis}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <QuickStartButton size="sm">Start session</QuickStartButton>
            <Button asChild variant="outline" size="sm">
              <Link href={`/postmortems/new?chaosId=${picked.id}`}>
                <Siren aria-hidden /> Write postmortem
              </Link>
            </Button>
            {!picked.completedAt && (
              <MarkDoneButton variant="ghost" size="sm" experiment={picked} />
            )}
          </div>
        </article>
      )}
    </section>
  );
}
