"use client";

import * as React from "react";
import { CircleCheck, CircleHelp, CircleX, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/markdown/markdown";
import { generateQuiz, gradeQuiz } from "@/lib/actions/ai";
import type { QuizScope } from "@/lib/ai/context";
import type { Grade, QuizQuestion, Verdict } from "@/lib/ai/output";
import { CardDrafts } from "./card-drafts";

const VERDICT: Record<
  Verdict,
  { label: string; variant: "success" | "warning" | "destructive"; icon: React.ReactNode }
> = {
  correct: {
    label: "Correct",
    variant: "success",
    icon: <CircleCheck aria-hidden className="size-3" />,
  },
  partial: {
    label: "Partly",
    variant: "warning",
    icon: <CircleHelp aria-hidden className="size-3" />,
  },
  wrong: {
    label: "Missed",
    variant: "destructive",
    icon: <CircleX aria-hidden className="size-3" />,
  },
};

/** "Quiz me": 5 questions from your own notes on a topic or project, graded by the AI. */
export function QuizButton({
  scope,
  title,
  className,
}: {
  scope: QuizScope;
  /** What's being quizzed, for the dialog title. */
  title: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // A new key per opening starts a fresh quiz.
  const [round, setRound] = React.useState(0);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        <GraduationCap aria-hidden /> Quiz me
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quiz: {title}</DialogTitle>
            <DialogDescription>
              Questions from your own notes. Answer in your own words, then get them graded.
            </DialogDescription>
          </DialogHeader>
          {open && <Quiz key={round} scope={scope} onRestart={() => setRound((r) => r + 1)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Quiz({ scope, onRestart }: { scope: QuizScope; onRestart: () => void }) {
  const [questions, setQuestions] = React.useState<QuizQuestion[] | null>(null);
  const [answers, setAnswers] = React.useState<string[]>([]);
  const [grades, setGrades] = React.useState<Grade[] | null>(null);
  const [cards, setCards] = React.useState<"off" | "editing" | number>("off");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const scopeKey = JSON.stringify(scope);

  React.useEffect(() => {
    let live = true;
    startTransition(async () => {
      const res = await generateQuiz(JSON.parse(scopeKey) as QuizScope);
      if (!live) return;
      if (!res.ok) return setError(res.error);
      setQuestions(res.data ?? []);
      setAnswers((res.data ?? []).map(() => ""));
    });
    return () => {
      live = false;
    };
  }, [scopeKey]);

  if (!questions)
    return error ? (
      <QuizError error={error} onRetry={onRestart} />
    ) : (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Reading your notes and writing questions…
      </p>
    );

  const missed = grades
    ? questions.flatMap((q, i) =>
        grades[i]!.verdict === "correct"
          ? []
          : [{ front: q.question, back: grades[i]!.answer, noteId: q.noteId }],
      )
    : [];
  const score = grades?.filter((g) => g.verdict === "correct").length ?? 0;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await gradeQuiz(
            scope,
            questions.map((q, i) => ({ question: q.question, answer: answers[i] ?? "" })),
          );
          if (!res.ok) return setError(res.error);
          setGrades(res.data ?? null);
        });
      }}
    >
      <ol className="space-y-5">
        {questions.map((q, i) => {
          const g = grades?.[i];
          return (
            <li key={i} className="space-y-2">
              <div className="flex gap-2 text-sm font-medium">
                <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                <Markdown className="min-w-0 flex-1">{q.question}</Markdown>
              </div>
              {g ? (
                <div className="space-y-2 pl-5">
                  <p className="rounded-md bg-muted/50 p-2 text-sm whitespace-pre-wrap">
                    {answers[i]?.trim() || (
                      <span className="text-muted-foreground">(no answer)</span>
                    )}
                  </p>
                  <div className="flex items-start gap-2 text-sm">
                    <Badge variant={VERDICT[g.verdict].variant} className="mt-0.5">
                      {VERDICT[g.verdict].icon}
                      {VERDICT[g.verdict].label}
                    </Badge>
                    <Markdown className="min-w-0 flex-1">{g.feedback}</Markdown>
                  </div>
                </div>
              ) : (
                <Textarea
                  aria-label={`Answer ${i + 1}`}
                  rows={3}
                  className="ml-5 w-[calc(100%-1.25rem)]"
                  value={answers[i] ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {!grades ? (
        <DialogFooter>
          <Button type="submit" disabled={pending || answers.every((a) => !a.trim())}>
            {pending ? "Grading…" : "Grade my answers"}
          </Button>
        </DialogFooter>
      ) : (
        <div className="space-y-4 border-t pt-4">
          <p className="text-sm font-medium" role="status">
            {score} of {questions.length} correct.
            {score === questions.length && " Nice: you know this."}
          </p>
          {cards === "editing" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Cards for what you missed. Edit or remove any, then save.
              </p>
              <CardDrafts initial={missed} onSaved={(n) => setCards(n)} />
            </div>
          ) : typeof cards === "number" ? (
            <p role="status" className="text-sm text-success">
              {cards} card{cards === 1 ? "" : "s"} added to Flashcards.
            </p>
          ) : null}
          <DialogFooter className="mt-0">
            <Button type="button" variant="outline" onClick={onRestart}>
              New quiz
            </Button>
            {missed.length > 0 && cards === "off" && (
              <Button type="button" onClick={() => setCards("editing")}>
                Turn {missed.length} missed into flashcards
              </Button>
            )}
          </DialogFooter>
        </div>
      )}
    </form>
  );
}

function QuizError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="space-y-4 py-4">
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </DialogFooter>
    </div>
  );
}
