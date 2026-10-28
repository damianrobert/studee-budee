"use client";

import * as React from "react";
import { SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/markdown/markdown";
import { useAiStream } from "./use-ai-stream";

/**
 * "Check my explanation" on an explain-it note: the AI points out errors, gaps and vague
 * parts and asks one follow-up question. It reviews the saved note, so `beforeCheck` saves first.
 */
export function CheckExplanation({
  noteId,
  beforeCheck,
}: {
  noteId: string;
  beforeCheck: () => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const review = useAiStream();

  async function check() {
    setOpen(true);
    review.reset();
    await beforeCheck();
    await review.run("/api/ai/check", { noteId });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Check my explanation"
        onClick={() => void check()}
      >
        <SearchCheck aria-hidden /> <span className="sr-only sm:not-sr-only">Check</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) review.reset();
        }}
      >
        <DialogContent side="right">
          <DialogHeader>
            <DialogTitle>Check my explanation</DialogTitle>
            <DialogDescription>What to fix, not a rewrite. The words stay yours.</DialogDescription>
          </DialogHeader>
          <div aria-live="polite" aria-busy={review.streaming} className="min-h-24">
            {review.text ? (
              <Markdown className="text-sm">{review.text}</Markdown>
            ) : (
              !review.error && (
                <p className="text-sm text-muted-foreground">Reading your explanation…</p>
              )
            )}
          </div>
          {review.error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {review.error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={review.streaming} onClick={() => void check()}>
              Check again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
