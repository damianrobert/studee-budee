"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createExperiment, updateExperiment } from "@/lib/actions/chaos";
import { DIFFICULTY_LABEL } from "@/lib/chaos";

type Fields = {
  title: string;
  description: string;
  hypothesis: string;
  category: string;
  difficulty: number;
};

export function ExperimentFormDialog({
  experiment,
  categories,
  children,
}: {
  experiment?: {
    id: string;
    title: string;
    description: string | null;
    hypothesis: string | null;
    category: string | null;
    difficulty: number;
  };
  categories: string[];
  children: React.ReactNode;
}) {
  const initial: Fields = {
    title: experiment?.title ?? "",
    description: experiment?.description ?? "",
    hypothesis: experiment?.hypothesis ?? "",
    category: experiment?.category ?? "",
    difficulty: experiment?.difficulty ?? 1,
  };
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set =
    (k: "title" | "description" | "hypothesis" | "category") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = experiment ? await updateExperiment(experiment.id, v) : await createExperiment(v);
      if (!res.ok) return setError(res.error);
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(initial);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{experiment ? "Edit experiment" : "New experiment"}</DialogTitle>
          <DialogDescription>
            Something to break on purpose, and what you expect to happen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title" htmlFor="exp-title">
            <Input
              id="exp-title"
              required
              maxLength={300}
              value={v.title}
              onChange={set("title")}
              placeholder="e.g. Kill the DB container mid-write"
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="exp-category">
              <Input
                id="exp-category"
                list="exp-categories"
                value={v.category}
                onChange={set("category")}
                placeholder="containers, networking…"
              />
              <datalist id="exp-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Difficulty" htmlFor="exp-difficulty">
              <Select
                id="exp-difficulty"
                value={v.difficulty}
                onChange={(e) => setV((prev) => ({ ...prev, difficulty: Number(e.target.value) }))}
              >
                {([1, 2, 3] as const).map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABEL[d]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="How to do it" htmlFor="exp-description" hint="Markdown supported.">
            <Textarea
              id="exp-description"
              rows={4}
              value={v.description}
              onChange={set("description")}
            />
          </Field>
          <Field label="Hypothesis" htmlFor="exp-hypothesis" hint="What do you expect to happen?">
            <Textarea
              id="exp-hypothesis"
              rows={2}
              value={v.hypothesis}
              onChange={set("hypothesis")}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : experiment ? "Save" : "Add experiment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
