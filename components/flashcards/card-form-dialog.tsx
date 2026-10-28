"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GenerateCards } from "@/components/ai/generate-cards";
import { Markdown } from "@/components/markdown/markdown";
import { MarkdownField } from "@/components/markdown/markdown-field";
import { useQueryParams } from "@/components/use-query-params";
import { createFlashcard, updateFlashcard } from "@/lib/actions/flashcards";

type Values = { front: string; back: string };
const EMPTY: Values = { front: "", back: "" };

export type SourceNote = { id: string; title: string; content: string };

const DESCRIPTION =
  "Ask one thing per card, in your own words. Markdown works on both sides, code blocks too.";

function CardForm({
  cardId,
  initial,
  note,
  onDone,
}: {
  cardId?: string;
  initial: Values;
  note?: SourceNote;
  onDone: () => void;
}) {
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const another = React.useRef(false);
  const frontRef = React.useRef<HTMLDivElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const keepOpen = another.current;
    another.current = false;
    startTransition(async () => {
      const res = cardId
        ? await updateFlashcard(cardId, v)
        : await createFlashcard({ ...v, noteId: note?.id });
      if (!res.ok) return setError(res.error);
      setError(null);
      if (!keepOpen) return onDone();
      setV(EMPTY);
      setAdded((n) => n + 1);
      frontRef.current?.querySelector("textarea")?.focus();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
      }}
    >
      {note && (
        <details className="rounded-md border text-sm">
          <summary className="cursor-pointer px-3 py-2 font-medium">Show the note</summary>
          <div className="max-h-64 overflow-y-auto border-t p-3">
            {note.content.trim() ? (
              <Markdown>{note.content}</Markdown>
            ) : (
              <p className="text-muted-foreground">This note is empty.</p>
            )}
          </div>
        </details>
      )}
      <div ref={frontRef}>
        <MarkdownField
          id={`card-front-${cardId ?? "new"}`}
          label="Front"
          placeholder="e.g. What happens to a container's writable layer when it's removed?"
          value={v.front}
          onChange={(front) => setV((x) => ({ ...x, front }))}
          projectId={null}
          className="min-h-20"
        />
      </div>
      <MarkdownField
        id={`card-back-${cardId ?? "new"}`}
        label="Back"
        placeholder="The answer, short enough to check at a glance."
        value={v.back}
        onChange={(back) => setV((x) => ({ ...x, back }))}
        projectId={null}
        className="min-h-20"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {added > 0 && (
        <p role="status" className="text-sm text-success">
          {added} card{added === 1 ? "" : "s"} added.
        </p>
      )}
      <DialogFooter>
        {!cardId && (
          <Button
            type="submit"
            variant="outline"
            disabled={pending}
            onClick={() => (another.current = true)}
          >
            Save & add another
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : cardId ? "Save" : added ? "Save & close" : "Add card"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CardFormDialog({
  card,
  children,
}: {
  card?: { id: string } & Values;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{card ? "Edit card" : "New card"}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {/* Remounts on every open, so the form starts from the saved values. */}
        {open && (
          <CardForm
            cardId={card?.id}
            initial={card ? { front: card.front, back: card.back } : EMPTY}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Opened by `?fromNote=`; closing it clears the param. */
export function FromNoteDialog({ note, ai }: { note: SourceNote; ai: boolean }) {
  const { update } = useQueryParams();
  const close = () => update({ fromNote: null });
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cards from “{note.title}”</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {ai && (
          <div className="mb-4">
            <GenerateCards noteId={note.id} />
          </div>
        )}
        <CardForm initial={EMPTY} note={note} onDone={close} />
      </DialogContent>
    </Dialog>
  );
}
