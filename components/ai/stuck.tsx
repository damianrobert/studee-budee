"use client";

import * as React from "react";
import Link from "next/link";
import { Hourglass, LifeBuoy, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/markdown/markdown";
import type { ClientSession } from "@/components/sessions/stop-session-dialog";
import { useNow } from "@/components/use-now";
import { discardStuck, finishStuck, getStuck, startStuck, type StuckInfo } from "@/lib/actions/ai";
import { MAX_HINTS, hintWait, type StuckAttempt } from "@/lib/ai/stuck";
import { formatElapsed } from "@/lib/client-time";
import { useAiStream } from "./use-ai-stream";

/** Remembers the open stuck note across reloads, for the session it was started in. */
const STORAGE_KEY = "sb_stuck";

type Stored = { sessionId: string; noteId: string };

function readStored(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Stored | null;
    return v?.sessionId && v.noteId ? v : null;
  } catch {
    return null;
  }
}

function writeStored(v: Stored | null) {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the countdown just won't survive a reload.
  }
}

/** "I'm stuck" (the 15-minute rule), shown next to the session timer. */
export function StuckButton({ session }: { session: ClientSession }) {
  const [open, setOpen] = React.useState(false);
  const [info, setInfo] = React.useState<StuckInfo | null>(null);
  const now = useNow();

  React.useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    if (stored.sessionId !== session.id) return writeStored(null);
    let live = true;
    void getStuck(stored.noteId).then((res) => {
      if (!live) return;
      if (res.ok && res.data && res.data.outcome === null) setInfo(res.data);
      else writeStored(null);
    });
    return () => {
      live = false;
    };
  }, [session.id]);

  const start = (next: StuckInfo) => {
    writeStored({ sessionId: session.id, noteId: next.noteId });
    setInfo(next);
  };
  const close = () => {
    writeStored(null);
    setInfo(null);
    setOpen(false);
  };

  const wait = info ? hintWait(info.createdAt, now) : 0;
  const hintsLeft = info ? MAX_HINTS - info.hints.length : 0;

  return (
    <>
      <Button
        size="sm"
        variant={info && !wait && hintsLeft ? "outline" : "ghost"}
        className="rounded-full px-2 sm:px-3"
        onClick={() => setOpen(true)}
        aria-label={
          info
            ? wait
              ? `I'm stuck: hint in ${formatElapsed(wait)}`
              : "I'm stuck: hint ready"
            : "I'm stuck"
        }
      >
        {info ? (
          wait ? (
            <>
              <Hourglass aria-hidden />
              <span className="hidden font-mono tabular-nums sm:inline" suppressHydrationWarning>
                {formatElapsed(wait)}
              </span>
            </>
          ) : (
            <>
              <Lightbulb aria-hidden className="text-warning" />
              <span className="hidden sm:inline">Hint</span>
            </>
          )
        ) : (
          <>
            <LifeBuoy aria-hidden />
            <span className="hidden md:inline">I&apos;m stuck</span>
          </>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          {info ? (
            <StuckProgress
              info={info}
              wait={wait}
              onChange={setInfo}
              onClose={close}
              onHide={() => setOpen(false)}
            />
          ) : (
            <StuckForm onStarted={start} onCancel={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StuckForm({
  onStarted,
  onCancel,
}: {
  onStarted: (info: StuckInfo) => void;
  onCancel: () => void;
}) {
  const [v, setV] = React.useState<StuckAttempt>({ goal: "", tried: "", happened: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const field = (k: keyof StuckAttempt) => ({
    id: `stuck-${k}`,
    value: v[k],
    required: true,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      setV((x) => ({ ...x, [k]: e.target.value })),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await startStuck(v);
          if (!res.ok || !res.data) return setError(res.ok ? "Try again." : res.error);
          onStarted(res.data);
        });
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>I&apos;m stuck</DialogTitle>
        <DialogDescription>
          Write it down first, then keep going on your own for 15 minutes: problems often crack
          while you explain them. If you&apos;re still stuck after that, you get up to {MAX_HINTS}{" "}
          hints. Hints, never the answer.
        </DialogDescription>
      </DialogHeader>
      <Field label="What are you trying to do?" htmlFor="stuck-goal">
        <Textarea rows={2} autoFocus {...field("goal")} />
      </Field>
      <Field label="What have you tried?" htmlFor="stuck-tried">
        <Textarea rows={3} {...field("tried")} />
      </Field>
      <Field label="What happened? (errors, output, what you expected)" htmlFor="stuck-happened">
        <Textarea rows={4} className="font-mono text-[13px]" {...field("happened")} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Start the 15 minutes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function StuckProgress({
  info,
  wait,
  onChange,
  onClose,
  onHide,
}: {
  info: StuckInfo;
  wait: number;
  onChange: (info: StuckInfo) => void;
  /** Ends the stuck event. */
  onClose: () => void;
  /** Just closes the dialog; the countdown keeps running. */
  onHide: () => void;
}) {
  const hint = useAiStream();
  const [finishing, setFinishing] = React.useState(false);
  const [outcome, setOutcome] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const used = info.hints.length;
  const next = used + 1;

  async function askHint() {
    const text = await hint.run("/api/ai/hint", { noteId: info.noteId });
    if (text === null) return;
    onChange({ ...info, hints: [...info.hints, text.trim()] });
    hint.reset();
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>I&apos;m stuck</DialogTitle>
        <DialogDescription>
          Solving it yourself is the goal. Hints are nudges, not answers.
        </DialogDescription>
      </DialogHeader>

      <details className="rounded-md border text-sm">
        <summary className="cursor-pointer px-3 py-2 font-medium">Your attempt</summary>
        <dl className="space-y-2 border-t p-3">
          <dt className="text-xs text-muted-foreground">Trying to do</dt>
          <dd className="whitespace-pre-wrap">{info.goal}</dd>
          <dt className="text-xs text-muted-foreground">Tried</dt>
          <dd className="whitespace-pre-wrap">{info.tried}</dd>
          <dt className="text-xs text-muted-foreground">What happened</dt>
          <dd className="font-mono text-[13px] whitespace-pre-wrap">{info.happened}</dd>
        </dl>
      </details>

      {wait > 0 && (
        <div className="rounded-lg border bg-muted/40 p-4 text-center">
          <p
            className="font-mono text-3xl font-semibold tabular-nums"
            suppressHydrationWarning
            aria-label={`${Math.ceil(wait / 60_000)} minutes until a hint unlocks`}
          >
            {formatElapsed(wait)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            until a hint unlocks. Keep at it: re-read the error, check your assumptions, look at the
            actual state.
          </p>
        </div>
      )}

      {(used > 0 || hint.text) && (
        <ol className="space-y-3">
          {info.hints.map((h, i) => (
            <HintCard key={i} n={i + 1} text={h} />
          ))}
          {hint.text && <HintCard n={next} text={hint.text} />}
        </ol>
      )}
      {(hint.error || error) && (
        <p role="alert" className="text-sm text-destructive">
          {hint.error || error}
        </p>
      )}

      {finishing ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await finishStuck(info.noteId, outcome);
              if (!res.ok) return setError(res.error);
              onClose();
            });
          }}
        >
          <Field label="What fixed it? (optional, saved in the note)" htmlFor="stuck-outcome">
            <Textarea
              id="stuck-outcome"
              rows={3}
              autoFocus
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            />
          </Field>
          <DialogFooter className="mt-0">
            <Button type="button" variant="ghost" onClick={() => setFinishing(false)}>
              Back
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save & close"}
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <DialogFooter className="items-center sm:justify-between">
          <div className="flex gap-2">
            <Confirm
              title="Discard this?"
              description="The stuck note and its hints are deleted."
              confirmLabel="Discard"
              onConfirm={async () => {
                const res = await discardStuck(info.noteId);
                if (!res.ok) return setError(res.error);
                onClose();
              }}
            >
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                Discard
              </Button>
            </Confirm>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/notes/${info.noteId}`} onClick={onHide}>
                Open note
              </Link>
            </Button>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setFinishing(true)}>
              I figured it out
            </Button>
            {used < MAX_HINTS ? (
              <Button disabled={wait > 0 || hint.streaming} onClick={() => void askHint()}>
                <Lightbulb aria-hidden />
                {hint.streaming ? "Thinking…" : `Get hint ${next} of ${MAX_HINTS}`}
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">No hints left for this one.</span>
            )}
          </div>
        </DialogFooter>
      )}
    </div>
  );
}

function HintCard({ n, text }: { n: number; text: string }) {
  return (
    <li className="rounded-lg border border-warning/30 bg-warning/5 p-3">
      <p className="mb-1 text-xs font-semibold text-warning">Hint {n}</p>
      <Markdown className="text-sm">{text}</Markdown>
    </li>
  );
}
