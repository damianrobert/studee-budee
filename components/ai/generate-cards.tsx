"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateFlashcards } from "@/lib/actions/ai";
import { CardDrafts, type Draft } from "./card-drafts";

/** "Generate flashcards from this note": AI suggests 3–8 cards, you review them before saving. */
export function GenerateCards({ noteId }: { noteId: string }) {
  const [drafts, setDrafts] = React.useState<Draft[] | null>(null);
  const [saved, setSaved] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const suggest = () =>
    startTransition(async () => {
      setError(null);
      setSaved(null);
      const res = await generateFlashcards(noteId);
      if (!res.ok) return setError(res.error);
      setDrafts((res.data ?? []).map((c) => ({ ...c, noteId })));
    });

  return (
    <section className="space-y-3 rounded-lg border border-dashed p-3" aria-label="AI suggestions">
      {drafts ? (
        <>
          <p className="text-sm font-medium">Suggested cards: edit or remove any, then save.</p>
          <CardDrafts
            initial={drafts}
            onSaved={(n) => {
              setDrafts(null);
              setSaved(n);
            }}
          />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={suggest}>
            <Sparkles aria-hidden />
            {pending
              ? "Reading the note…"
              : saved !== null
                ? "Suggest more"
                : "Suggest cards with AI"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {saved !== null ? (
              <span role="status" className="text-success">
                {saved} card{saved === 1 ? "" : "s"} added.
              </span>
            ) : (
              "3–8 cards from this note. You review them before anything is saved."
            )}
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
