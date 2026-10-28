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
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { stopSession } from "@/lib/actions/sessions";
import type { SessionStage } from "@/lib/stages";
import { StagePicker } from "./stage-picker";

export type ClientSession = {
  id: string;
  startedAt: string;
  project: { id: string; name: string } | null;
  topic: { id: string; title: string } | null;
};

export function StopSessionDialog({
  session,
  open,
  onOpenChange,
  endedAt,
}: {
  session: ClientSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Corrected end time for a forgotten session; defaults to now. */
  endedAt?: Date;
}) {
  const [summary, setSummary] = React.useState("");
  const [stage, setStage] = React.useState<SessionStage | null>(null);
  const [produced, setProduced] = React.useState(false);
  const [link, setLink] = React.useState("");
  const [nextStep, setNextStep] = React.useState("");
  const [duration, setDuration] = React.useState("0");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Recompute the duration each time the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    const end = endedAt ?? new Date();
    const min = Math.max(0, Math.round((end.getTime() - Date.parse(session.startedAt)) / 60_000));
    setDuration(String(min));
    setError(null);
  }, [open, endedAt, session.startedAt]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nextStep.trim()) {
      setError("Write one concrete next step before you stop.");
      return;
    }
    startTransition(async () => {
      const res = await stopSession({
        id: session.id,
        summary,
        stage,
        producedOutput: produced,
        outputLink: produced ? link : null,
        nextStep,
        durationMin: Number(duration) || 0,
        endedAt: endedAt?.toISOString() ?? null,
      });
      if (!res.ok) return setError(res.error);
      setSummary("");
      setStage(null);
      setProduced(false);
      setLink("");
      setNextStep("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop session</DialogTitle>
          <DialogDescription>
            {session.project?.name ?? "No project"}
            {session.topic && ` · ${session.topic.title}`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="What did I do?" htmlFor="stop-summary">
            <Textarea
              id="stop-summary"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Optional, a line or two."
            />
          </Field>
          <StagePicker name="stop-stage" value={stage} onChange={setStage} />
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-current"
                checked={produced}
                onChange={(e) => setProduced(e.target.checked)}
              />
              I produced something visible
            </label>
            {produced && (
              <Input
                aria-label="Link to the output"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Commit, note or post URL (optional)"
              />
            )}
          </div>
          <Field label="What's next?" htmlFor="stop-next">
            <Textarea
              id="stop-next"
              rows={2}
              required
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="One concrete action to start with next time."
              aria-invalid={!!error && !nextStep.trim()}
            />
          </Field>
          <Field
            label="Duration (minutes)"
            htmlFor="stop-duration"
            hint="Adjust it if you forgot to stop the timer."
          >
            <Input
              id="stop-duration"
              type="number"
              min={0}
              max={1440}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-32"
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Keep going
            </Button>
            <Button type="submit" disabled={pending || !nextStep.trim()}>
              {pending ? "Saving…" : "Save & stop"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
