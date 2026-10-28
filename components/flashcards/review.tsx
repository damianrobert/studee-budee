"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown/markdown";
import { reviewFlashcard } from "@/lib/actions/flashcards";
import { RATINGS, RATING_LABEL, intervalLabel, sm2, type Rating } from "@/lib/flashcards";
import { cn } from "@/lib/utils";

export type ReviewCard = {
  id: string;
  front: string;
  back: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  note: { id: string; title: string } | null;
};

const RATING_STYLE: Record<Rating, string> = {
  AGAIN: "border-destructive/40 text-destructive hover:bg-destructive/10",
  HARD: "border-warning/40 text-warning hover:bg-warning/10",
  GOOD: "border-success/40 text-success hover:bg-success/10",
  EASY: "border-primary/40 hover:bg-primary/10",
};

function typing(t: EventTarget | null) {
  return (
    t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
  );
}

/**
 * One review session over the cards that were due when the page loaded. A card rated
 * Again goes to the back of the queue (SM-2 repeats lapses until they're remembered).
 * Each rating is saved right away, so leaving half-way loses nothing.
 */
export function Review({ cards, empty }: { cards: ReviewCard[]; empty: React.ReactNode }) {
  // Initialised once: the page re-renders after each rating (revalidation), but the
  // session keeps its own queue.
  const [queue, setQueue] = React.useState(cards);
  const [total] = React.useState(cards.length);
  const [revealed, setRevealed] = React.useState(false);
  const [reviewed, setReviewed] = React.useState(0);
  const [lapses, setLapses] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();
  const showRef = React.useRef<HTMLButtonElement>(null);
  const goodRef = React.useRef<HTMLButtonElement>(null);

  const card = queue[0];
  const done = total - new Set(queue.map((c) => c.id)).size;

  const rate = React.useCallback(
    (rating: Rating) => {
      if (!card || !revealed) return;
      const next = { ...card, ...sm2(card, rating) };
      setQueue((q) => (rating === "AGAIN" ? [...q.slice(1), next] : q.slice(1)));
      setRevealed(false);
      setReviewed((n) => n + 1);
      if (rating === "AGAIN") setLapses((n) => n + 1);
      startTransition(async () => {
        const res = await reviewFlashcard(card.id, rating);
        if (!res.ok) setError(res.error);
      });
    },
    [card, revealed],
  );

  React.useEffect(() => {
    (revealed ? goodRef : showRef).current?.focus();
  }, [revealed, card?.id]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (revealed && i >= 0) {
        e.preventDefault();
        rate(RATINGS[i]!);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, rate]);

  if (total === 0) return empty;
  if (!card)
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
        <CheckCircle2 className="size-8 text-success" aria-hidden />
        <h2 className="text-lg font-semibold">All done</h2>
        <p role="status" className="text-sm text-muted-foreground">
          {reviewed} review{reviewed === 1 ? "" : "s"} of {total} card{total === 1 ? "" : "s"}
          {lapses > 0 && <>, {lapses} forgotten and repeated</>}.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/flashcards">All cards</Link>
          </Button>
          <Button asChild>
            <Link href="/">Back to Today</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {done} of {total} done
          </span>
          <span className="tabular-nums">{queue.length} left</span>
        </div>
        <div
          role="progressbar"
          aria-label="Review progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-1.5 overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>

      <article aria-label="Flashcard" className="rounded-xl border p-5 sm:p-8">
        <h2 className="sr-only">Question</h2>
        <Markdown className="text-base">{card.front}</Markdown>
        {revealed && (
          <>
            <hr className="my-5" />
            <h2 className="sr-only">Answer</h2>
            <div aria-live="polite">
              <Markdown className="text-base">{card.back}</Markdown>
            </div>
          </>
        )}
        {card.note && (
          <p className="mt-5 text-xs text-muted-foreground">
            <Link
              href={`/notes/${card.note.id}`}
              className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
            >
              <FileText className="size-3.5" aria-hidden /> {card.note.title}
            </Link>
          </p>
        )}
      </article>

      {revealed ? (
        <div
          role="group"
          aria-label="How well did you remember?"
          className="grid grid-cols-4 gap-2"
        >
          {RATINGS.map((r, i) => (
            <Button
              key={r}
              ref={r === "GOOD" ? goodRef : undefined}
              variant="outline"
              className={cn("h-auto flex-col gap-0.5 py-2", RATING_STYLE[r])}
              onClick={() => rate(r)}
            >
              <span>{RATING_LABEL[r]}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {intervalLabel(sm2(card, r).interval)}
                <span className="sr-only">, key {i + 1}</span>
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <Button ref={showRef} size="lg" className="w-full" onClick={() => setRevealed(true)}>
          Show answer
        </Button>
      )}
      <p className="hidden text-center text-xs text-muted-foreground sm:block">
        Space shows the answer · 1–4 rates it
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
