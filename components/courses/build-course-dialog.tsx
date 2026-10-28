"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
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
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { AiWorking } from "@/components/roadmaps/ai-working";
import { createCourse, rebuildCourse } from "@/lib/actions/courses";
import { librarySummary, parseResourcesFile } from "@/lib/courses";
import { cn } from "@/lib/utils";

const WEEKLY = [
  { value: 120, label: "2 hours a week" },
  { value: 180, label: "3 hours a week" },
  { value: 300, label: "5 hours a week" },
  { value: 420, label: "7 hours a week" },
  { value: 600, label: "10 hours a week" },
];

type Build = "AI" | "TOPICS";

/**
 * "New course" (or "Rebuild" for an existing one): load the resources file your LLM
 * gathered, check it right here, then let Gemini arrange it or group it by topic for free.
 */
export function BuildCourseDialog({
  ai,
  course,
  children,
}: {
  ai: boolean;
  /** Given when rebuilding: the last build's file and options. */
  course?: {
    id: string;
    source: string;
    build: Build;
    weeklyMinutes: number | null;
    focus: string | null;
  };
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [source, setSource] = React.useState(course?.source ?? "");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [paste, setPaste] = React.useState(false);
  const [build, setBuild] = React.useState<Build>(ai ? (course?.build ?? "AI") : "TOPICS");
  const [weekly, setWeekly] = React.useState(course?.weeklyMinutes ?? 300);
  const [focus, setFocus] = React.useState(course?.focus ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const parsed = React.useMemo(() => (source.trim() ? parseResourcesFile(source) : null), [source]);

  const reset = () => {
    setSource(course?.source ?? "");
    setFileName(null);
    setPaste(false);
    setError(null);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const input = { source, build, weeklyMinutes: weekly, focus };
      const res = course ? await rebuildCourse(course.id, input) : await createCourse(input);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      if (!course) {
        reset();
        router.push(`/courses/${res.data}`);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (o) reset();
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        {children ?? (
          <Button>
            <Plus aria-hidden /> New course
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{course ? "Rebuild the course" : "New course"}</DialogTitle>
          <DialogDescription>
            {course
              ? "Build it again from an updated resources file or with other options. What you've marked done stays done."
              : "Load the resources file your LLM gathered (YAML or JSON). The course is built from its links only."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".yaml,.yml,.json,.txt,application/json,text/yaml,text/plain"
                className="sr-only"
                aria-label="Resources file"
                disabled={pending}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setSource(await f.text());
                  setFileName(f.name);
                  setPaste(false);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => fileRef.current?.click()}
              >
                <Upload aria-hidden /> {course ? "Choose a new file" : "Choose file"}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setPaste((p) => !p)}
                disabled={pending}
              >
                {paste ? "Hide" : course ? "Edit the file" : "or paste it"}
              </button>
            </div>
            {paste && (
              <Textarea
                aria-label="Resources file contents"
                rows={10}
                className="font-mono text-xs"
                value={source}
                disabled={pending}
                onChange={(e) => {
                  setSource(e.target.value);
                  setFileName(null);
                }}
                placeholder={'version: 1\nsubject: "…"\ntopics: [...]\nresources:\n  videos: [...]'}
              />
            )}
            <SourceStatus
              parsed={parsed}
              label={
                fileName ??
                (course && source === course.source ? "The file from the last build" : null)
              }
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium">How to build it</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice
                checked={build === "AI"}
                disabled={!ai || pending}
                onChange={() => setBuild("AI")}
                title="Arrange with AI"
                text={
                  ai
                    ? "Gemini orders the resources into modules and adds practice tasks and checkpoint questions. One request."
                    : "Needs GOOGLE_GEMINI_API_KEY."
                }
              />
              <Choice
                checked={build === "TOPICS"}
                disabled={pending}
                onChange={() => setBuild("TOPICS")}
                title="Group by topic"
                text="One module per topic, in the file's order. No AI, no cost."
              />
            </div>
          </fieldset>

          {build === "AI" && (
            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <Field label="Time you have" htmlFor="course-weekly">
                <Select
                  id="course-weekly"
                  value={weekly}
                  disabled={pending}
                  onChange={(e) => setWeekly(Number(e.target.value))}
                >
                  {[
                    ...WEEKLY,
                    ...(WEEKLY.some((w) => w.value === weekly)
                      ? []
                      : [{ value: weekly, label: `${weekly} min a week` }]),
                  ].map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Focus (optional)" htmlFor="course-focus">
                <Input
                  id="course-focus"
                  value={focus}
                  disabled={pending}
                  maxLength={1000}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="e.g. more hands-on, fewer long videos"
                />
              </Field>
            </div>
          )}

          {pending && build === "AI" && (
            <AiWorking>
              Arranging the resources into modules and writing practice tasks and checkpoint
              questions. This usually takes under a minute.
            </AiWorking>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending || !parsed?.ok}>
              {pending ? "Building…" : course ? "Rebuild course" : "Build course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SourceStatus({
  parsed,
  label,
}: {
  parsed: ReturnType<typeof parseResourcesFile> | null;
  label: string | null;
}) {
  if (!parsed) return null;
  if (!parsed.ok)
    return (
      <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 p-3 text-sm">
        <p className="font-medium text-destructive">The file has problems:</p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs">
          {parsed.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm" data-testid="source-ok">
      <p>
        {label && <span className="text-muted-foreground">{label}: </span>}
        <span className="font-medium">{parsed.library.subject}</span>
      </p>
      <p className="text-xs text-muted-foreground">{librarySummary(parsed.library)}</p>
      {parsed.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-warning">
          {parsed.warnings.slice(0, 5).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Choice({
  checked,
  disabled,
  onChange,
  title,
  text,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  title: string;
  text: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-2.5 rounded-lg border p-3 text-sm",
        checked && "border-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name="course-build"
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="space-y-0.5">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </label>
  );
}
