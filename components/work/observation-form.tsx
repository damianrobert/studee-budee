"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { TagInput } from "@/components/notes/tag-input";
import { createObservation, updateObservation } from "@/lib/actions/work";

type Values = { content: string; question: string; answer: string; tags: string[] };
const EMPTY: Values = { content: "", question: "", answer: "", tags: [] };

function Fields({
  idPrefix,
  v,
  setV,
  tagSuggestions,
  withAnswer,
  autoFocus,
}: {
  idPrefix: string;
  v: Values;
  setV: (v: Values) => void;
  tagSuggestions: string[];
  withAnswer?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Field label="What did you notice?" htmlFor={`${idPrefix}-content`}>
        <Textarea
          id={`${idPrefix}-content`}
          rows={2}
          required
          value={v.content}
          onChange={(e) => setV({ ...v, content: e.target.value })}
          placeholder="e.g. The deploy pipeline waits 10 min on a manual approval step"
          autoFocus={autoFocus}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Question for a colleague (optional)" htmlFor={`${idPrefix}-question`}>
          <Input
            id={`${idPrefix}-question`}
            maxLength={2000}
            value={v.question}
            onChange={(e) => setV({ ...v, question: e.target.value })}
            placeholder="Why is it manual?"
          />
        </Field>
        <Field label="Tags" htmlFor={`${idPrefix}-tags`}>
          <TagInput
            id={`${idPrefix}-tags`}
            value={v.tags}
            onChange={(tags) => setV({ ...v, tags })}
            suggestions={tagSuggestions}
          />
        </Field>
      </div>
      {withAnswer && (
        <Field label="Answer" htmlFor={`${idPrefix}-answer`}>
          <Textarea
            id={`${idPrefix}-answer`}
            rows={2}
            value={v.answer}
            onChange={(e) => setV({ ...v, answer: e.target.value })}
          />
        </Field>
      )}
    </>
  );
}

export function AddObservationForm({ tagSuggestions }: { tagSuggestions: string[] }) {
  const [v, setV] = React.useState(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createObservation(v);
      if (!res.ok) return setError(res.error);
      setError(null);
      setV(EMPTY);
    });
  }
  return (
    <form
      onSubmit={submit}
      aria-label="Log an observation"
      className="mb-6 space-y-3 rounded-xl border p-4"
    >
      <Fields idPrefix="obs-new" v={v} setV={setV} tagSuggestions={tagSuggestions} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || !v.content.trim()}>
        <Plus aria-hidden /> {pending ? "Saving…" : "Log it"}
      </Button>
    </form>
  );
}

export function EditObservationDialog({
  observation,
  tagSuggestions,
  children,
}: {
  observation: {
    id: string;
    content: string;
    question: string | null;
    answer: string | null;
    tags: string[];
  };
  tagSuggestions: string[];
  children: React.ReactNode;
}) {
  const initial: Values = {
    content: observation.content,
    question: observation.question ?? "",
    answer: observation.answer ?? "",
    tags: observation.tags,
  };
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateObservation(observation.id, v);
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
          <DialogTitle>Edit observation</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Fields
            idPrefix={`obs-${observation.id}`}
            v={v}
            setV={setV}
            tagSuggestions={tagSuggestions}
            withAnswer
            autoFocus
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
