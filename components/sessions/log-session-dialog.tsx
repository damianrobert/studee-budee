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
import { Field, Input, Textarea } from "@/components/ui/input";
import { logPastSession } from "@/lib/actions/sessions";
import { fromLocalInput, toLocalInput } from "@/lib/client-time";
import type { ProjectOption } from "@/lib/sessions";
import { ProjectTopicPicker, type ProjectTopic } from "./project-topic-picker";
import type { SessionStage } from "@/lib/stages";
import { StagePicker } from "./stage-picker";

export function LogSessionDialog({
  projects,
  defaults,
  children,
}: {
  projects: ProjectOption[];
  defaults: ProjectTopic;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [pt, setPt] = React.useState(defaults);
  const [start, setStart] = React.useState("");
  const [duration, setDuration] = React.useState("30");
  const [stage, setStage] = React.useState<SessionStage | null>(null);
  const [summary, setSummary] = React.useState("");
  const [produced, setProduced] = React.useState(false);
  const [link, setLink] = React.useState("");
  const [nextStep, setNextStep] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setPt(defaults);
    setStart(toLocalInput(new Date(Date.now() - 60 * 60_000)));
    setDuration("30");
    setStage(null);
    setSummary("");
    setProduced(false);
    setLink("");
    setNextStep("");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const startedAt = fromLocalInput(start);
    if (!startedAt) return setError("Pick when the session started.");
    startTransition(async () => {
      const res = await logPastSession({
        ...pt,
        startedAt: startedAt.toISOString(),
        durationMin: Number(duration) || 0,
        stage,
        summary,
        producedOutput: produced,
        outputLink: produced ? link : null,
        nextStep,
      });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a past session</DialogTitle>
          <DialogDescription>For sessions you did away from the app.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <ProjectTopicPicker idPrefix="log" projects={projects} value={pt} onChange={setPt} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Started at" htmlFor="log-start">
              <Input
                id="log-start"
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Duration (minutes)" htmlFor="log-duration">
              <Input
                id="log-duration"
                type="number"
                min={1}
                max={1440}
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
          </div>
          <StagePicker name="log-stage" value={stage} onChange={setStage} />
          <Field label="What did I do?" htmlFor="log-summary">
            <Textarea
              id="log-summary"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4"
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
                placeholder="Link (optional)"
              />
            )}
          </div>
          <Field label="What's next?" htmlFor="log-next" hint="Optional for past sessions.">
            <Textarea
              id="log-next"
              rows={2}
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="One concrete action to start with next time."
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
