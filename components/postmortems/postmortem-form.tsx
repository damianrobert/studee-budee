"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FlaskConical, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { MarkdownField } from "@/components/markdown/markdown-field";
import { ProjectTopicPicker } from "@/components/sessions/project-topic-picker";
import { TagInput } from "@/components/notes/tag-input";
import type { UploadedFile } from "@/components/files/use-upload";
import {
  createPostmortem,
  updatePostmortem,
  type PostmortemInput,
} from "@/lib/actions/postmortems";
import { fromLocalInput, toLocalInput } from "@/lib/client-time";
import { formatBytes, referencedFileIds } from "@/lib/files";
import { POSTMORTEM_FIELDS, postmortemText } from "@/lib/postmortems";
import type { ProjectOption } from "@/lib/sessions";

type Values = Omit<PostmortemInput, "occurredAt"> & {
  occurredAt: Date;
  projectId: string | null;
  topicId: string | null;
  chaosExperimentId: string | null;
};
type Attachment = Omit<UploadedFile, "url">;
export type ExperimentOption = { id: string; title: string };

export function PostmortemForm({
  postmortem,
  initial,
  projects,
  experiments,
  tagSuggestions,
}: {
  postmortem: (Values & { id: string; files: Attachment[] }) | null;
  initial?: Partial<Pick<Values, "projectId" | "topicId" | "chaosExperimentId" | "title">>;
  projects: ProjectOption[];
  experiments: ExperimentOption[];
  tagSuggestions: string[];
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<Values>(
    () =>
      postmortem ?? {
        title: initial?.title ?? "",
        occurredAt: new Date(),
        whatBroke: "",
        symptoms: "",
        investigation: "",
        rootCause: "",
        fix: "",
        lessons: "",
        wasDeliberate: !!initial?.chaosExperimentId,
        projectId: initial?.projectId ?? null,
        topicId: initial?.topicId ?? null,
        chaosExperimentId: initial?.chaosExperimentId ?? null,
        tags: [],
      },
  );
  const [savedKey, setSavedKey] = React.useState(() => JSON.stringify(values));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [uploaded, setUploaded] = React.useState<Attachment[]>([]);
  const dirty = JSON.stringify(values) !== savedKey;

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Values>(k: K, v: Values[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    startTransition(async () => {
      const input = { ...values, occurredAt: values.occurredAt.toISOString() };
      const res = postmortem
        ? await updatePostmortem(postmortem.id, input)
        : await createPostmortem(input);
      if (!res.ok) return setError(res.error);
      setError(null);
      setSavedKey(JSON.stringify(values));
      router.push(`/postmortems/${postmortem?.id ?? res.data}`);
    });
  }

  const referenced = new Set(referencedFileIds(postmortemText(values)));
  const attachments = [...(postmortem?.files ?? []), ...uploaded].filter(
    (f, i, all) => referenced.has(f.id) && all.findIndex((x) => x.id === f.id) === i,
  );
  const fromChaos = !!values.chaosExperimentId;

  return (
    <form
      className="space-y-6"
      onSubmit={submit}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={postmortem ? `/postmortems/${postmortem.id}` : "/postmortems"}>
            <ArrowLeft aria-hidden /> {postmortem ? "Back" : "Postmortems"}
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          {postmortem ? "Editing postmortem" : "New postmortem"}
          {dirty && " · unsaved changes"}
        </span>
      </div>

      <Input
        aria-label="Title"
        placeholder="Short and specific, e.g. “App lost DB connection after password rotation”"
        value={values.title}
        onChange={(e) => set("title", e.target.value)}
        autoFocus={!postmortem}
        required
        maxLength={300}
        className="h-11 text-lg font-semibold"
      />

      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <Field label="When" htmlFor="pm-when">
          <Input
            id="pm-when"
            type="datetime-local"
            value={toLocalInput(values.occurredAt)}
            onChange={(e) => {
              const d = fromLocalInput(e.target.value);
              if (d) set("occurredAt", d);
            }}
          />
        </Field>
        <ProjectTopicPicker
          idPrefix="pm"
          projects={projects}
          value={{ projectId: values.projectId, topicId: values.topicId }}
          onChange={(v) => setValues((prev) => ({ ...prev, ...v }))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Kind</span>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-current"
              checked={values.wasDeliberate || fromChaos}
              disabled={fromChaos}
              onChange={(e) => set("wasDeliberate", e.target.checked)}
            />
            I broke it on purpose
          </label>
        </div>
        <Field
          label="Chaos experiment"
          htmlFor="pm-chaos"
          hint={fromChaos ? "Saving marks the experiment done." : undefined}
        >
          <Select
            id="pm-chaos"
            value={values.chaosExperimentId ?? ""}
            onChange={(e) => set("chaosExperimentId", e.target.value || null)}
          >
            <option value="">None</option>
            {experiments.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Tags" htmlFor="pm-tags">
        <TagInput
          id="pm-tags"
          value={values.tags}
          onChange={(t) => set("tags", t)}
          suggestions={tagSuggestions}
        />
      </Field>

      {fromChaos && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            <strong>Deliberate failure.</strong> Write down what you expected before you look back
            at the hypothesis — the gap between the two is the lesson.
          </span>
        </p>
      )}

      {POSTMORTEM_FIELDS.map((f) => (
        <MarkdownField
          key={f.key}
          id={`pm-${f.key}`}
          label={f.label}
          placeholder={f.placeholder}
          value={values[f.key]}
          onChange={(v) => set(f.key, v)}
          projectId={values.projectId}
          onUploaded={(done) => setUploaded((u) => [...u, ...done])}
        />
      ))}

      {attachments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Attachments</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {attachments.map((f) => (
              <li
                key={f.id}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1"
              >
                <Paperclip className="size-3.5" aria-hidden />
                {f.originalName}
                <span className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-b-xl md:px-0">
        {error && (
          <p role="alert" className="mr-auto text-sm text-destructive">
            {error}
          </p>
        )}
        <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl+S saves</span>
        <Button type="submit" disabled={pending || !values.title.trim()}>
          {pending ? "Saving…" : postmortem ? "Save changes" : "Save postmortem"}
        </Button>
      </div>
    </form>
  );
}
