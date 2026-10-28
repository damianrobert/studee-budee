"use client";

import * as React from "react";
import { CheckCircle2, Pencil, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { deleteObservation, setObservationResolved } from "@/lib/actions/work";
import { EditObservationDialog } from "./observation-form";

type Observation = {
  id: string;
  content: string;
  question: string | null;
  answer: string | null;
  resolved: boolean;
  tags: string[];
};

function ResolveDialog({ observation }: { observation: Observation }) {
  const [open, setOpen] = React.useState(false);
  const [answer, setAnswer] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await setObservationResolved(observation.id, { resolved: true, answer });
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
          setAnswer(observation.answer ?? "");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CheckCircle2 aria-hidden /> Resolve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve</DialogTitle>
          <DialogDescription>{observation.question ?? observation.content}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field
            label="Answer (optional)"
            htmlFor={`answer-${observation.id}`}
            hint="What you found out, in your own words."
          >
            <Textarea
              id={`answer-${observation.id}`}
              rows={3}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoFocus
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Mark resolved"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ObservationActions({
  observation,
  tagSuggestions,
}: {
  observation: Observation;
  tagSuggestions: string[];
}) {
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {observation.resolved ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(
              async () => void (await setObservationResolved(observation.id, { resolved: false })),
            )
          }
        >
          <Undo2 aria-hidden /> Reopen
        </Button>
      ) : (
        <ResolveDialog observation={observation} />
      )}
      <EditObservationDialog observation={observation} tagSuggestions={tagSuggestions}>
        <Button variant="ghost" size="sm">
          <Pencil aria-hidden /> Edit
        </Button>
      </EditObservationDialog>
      <Confirm
        title="Delete this observation?"
        description="It's deleted permanently."
        onConfirm={() => deleteObservation(observation.id).then(() => undefined)}
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label="Delete"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden />
        </Button>
      </Confirm>
    </div>
  );
}
