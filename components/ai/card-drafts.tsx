"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { createFlashcards } from "@/lib/actions/flashcards";

export type Draft = { front: string; back: string; noteId?: string | null };

/**
 * Suggested cards to review before saving: edit either side, drop the ones you don't want,
 * then save the rest in one go.
 */
export function CardDrafts({
  initial,
  onSaved,
}: {
  initial: Draft[];
  onSaved: (count: number) => void;
}) {
  const [drafts, setDrafts] = React.useState(() => initial.map((d, i) => ({ ...d, key: i })));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set = (key: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {drafts.map((d, i) => (
          <li key={d.key} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Card {i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                aria-label={`Remove card ${i + 1}`}
                onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
              >
                <Trash2 />
              </Button>
            </div>
            <Textarea
              aria-label={`Card ${i + 1} front`}
              rows={2}
              value={d.front}
              onChange={(e) => set(d.key, { front: e.target.value })}
            />
            <Textarea
              aria-label={`Card ${i + 1} back`}
              rows={2}
              value={d.back}
              onChange={(e) => set(d.key, { back: e.target.value })}
              className="bg-muted/40"
            />
          </li>
        ))}
      </ul>
      {!drafts.length && <p className="text-sm text-muted-foreground">All suggestions removed.</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={pending || !drafts.length}
          onClick={() =>
            startTransition(async () => {
              const res = await createFlashcards(
                drafts.map(({ front, back, noteId }) => ({ front, back, noteId })),
              );
              if (!res.ok) return setError(res.error);
              onSaved(res.data ?? drafts.length);
            })
          }
        >
          {pending ? "Saving…" : `Save ${drafts.length} card${drafts.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
