"use client";

import Link from "next/link";
import { Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DoneGateDialog({
  topic,
  projectId,
  onClose,
}: {
  topic: { id: string; title: string } | null;
  projectId: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!topic} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Explain it before it&apos;s done</DialogTitle>
          <DialogDescription>
            A topic only counts as done once you can explain it. “{topic?.title}” has no explain-it
            note yet.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Write ~5 sentences as if teaching a colleague: what problem it solves, how it works, and
          when you wouldn&apos;t use it.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Not now
          </Button>
          {topic && (
            <Button asChild>
              <Link href={`/notes/new?type=EXPLAIN_IT&projectId=${projectId}&topicId=${topic.id}`}>
                Write explain-it note
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BreakFirstHint({
  topic,
  projectId,
  onDismiss,
}: {
  topic: { id: string; title: string };
  projectId: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="flex-1">
        <strong>Did you break it first?</strong> “{topic.title}” has no postmortem. Breaking and
        debugging it is where the real learning happens.{" "}
        <Link
          className="underline underline-offset-2"
          href={`/postmortems/new?projectId=${projectId}&topicId=${topic.id}`}
        >
          Write a postmortem
        </Link>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-sm opacity-70 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
