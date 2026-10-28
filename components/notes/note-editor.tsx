"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Download,
  Layers,
  Package,
  Paperclip,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { CheckExplanation } from "@/components/ai/check-explanation";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/markdown/markdown";
import { ProjectTopicPicker } from "@/components/sessions/project-topic-picker";
import { useUpload, type UploadedFile } from "@/components/files/use-upload";
import { createNote, deleteNote, updateNote, type NoteInput } from "@/lib/actions/notes";
import { formatBytes, markdownForFile, referencedFileIds } from "@/lib/files";
import { EXPLAIN_IT_PROMPT } from "@/lib/notes";
import type { ProjectOption } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { TagInput } from "./tag-input";

type Values = NoteInput & { projectId: string | null; topicId: string | null };
type Status = "saved" | "dirty" | "saving" | { error: string };
type Attachment = Omit<UploadedFile, "url">;

const AUTOSAVE_MS = 800;

export function NoteEditor({
  note,
  initial,
  projects,
  tagSuggestions,
  ai = false,
}: {
  note: (Values & { id: string; files: Attachment[] }) | null;
  initial?: Partial<Pick<Values, "type" | "projectId" | "topicId">>;
  projects: ProjectOption[];
  tagSuggestions: string[];
  /** Show "Check my explanation" (a Gemini key is set). */
  ai?: boolean;
}) {
  const [values, setValues] = React.useState<Values>(
    () =>
      note ?? {
        title: "",
        content: "",
        type: initial?.type ?? "NOTE",
        projectId: initial?.projectId ?? null,
        topicId: initial?.topicId ?? null,
        tags: [],
        pinned: false,
      },
  );
  const [noteId, setNoteId] = React.useState(note?.id ?? null);
  const [view, setView] = React.useState<"write" | "preview">(note?.content ? "preview" : "write");
  const [uploaded, setUploaded] = React.useState<Attachment[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { upload, uploading, error: uploadError } = useUpload();

  // --- Autosave: debounced, one request in flight, always saves the latest values.
  // "Dirty" is derived from the values on every render, so the indicator is never stale.
  const [savedKey, setSavedKey] = React.useState(() => JSON.stringify(values));
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const latest = React.useRef(values);
  latest.current = values;
  const idRef = React.useRef(noteId);
  const savedKeyRef = React.useRef(savedKey);
  const inflight = React.useRef<Promise<void> | null>(null);

  const markSaved = (key: string) => {
    savedKeyRef.current = key;
    setSavedKey(key);
  };

  const flush = React.useCallback(async (): Promise<void> => {
    while (inflight.current) await inflight.current;
    const snap = latest.current;
    const key = JSON.stringify(snap);
    if (key === savedKeyRef.current) return;
    if (!idRef.current && !snap.title.trim() && !snap.content.trim()) return;
    setSaving(true);
    const run = (async () => {
      const res = idRef.current ? await updateNote(idRef.current, snap) : await createNote(snap);
      if (!res.ok) return setSaveError(res.error);
      setSaveError(null);
      if (!idRef.current && res.data) {
        idRef.current = res.data;
        setNoteId(res.data);
        // Swap the URL without remounting the editor (keeps focus and cursor).
        window.history.replaceState(null, "", `/notes/${res.data}`);
      }
      markSaved(key);
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
      setSaving(false);
    }
  }, []);

  const key = JSON.stringify(values);
  // A new note isn't created until it has a title or some content.
  const blank = !noteId && !values.title.trim() && !values.content.trim();
  const dirty = !blank && key !== savedKey;
  const status: Status = saveError
    ? { error: saveError }
    : saving
      ? "saving"
      : dirty
        ? "dirty"
        : "saved";

  React.useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [key, dirty, flush]);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Values>(k: K, v: Values[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  // --- Attachments
  async function attach(files: File[]) {
    const done = await upload(files, values.projectId);
    if (!done.length) return;
    setUploaded((u) => [...u, ...done]);
    const snippet = done.map(markdownForFile).join("\n");
    const ta = textareaRef.current;
    setValues((prev) => {
      const start = ta?.selectionStart ?? prev.content.length;
      const end = ta?.selectionEnd ?? start;
      const before = prev.content.slice(0, start);
      const pad = before && !before.endsWith("\n") ? "\n" : "";
      return {
        ...prev,
        content: `${before}${pad}${snippet}\n${prev.content.slice(end)}`,
      };
    });
  }

  const referenced = new Set(referencedFileIds(values.content));
  const attachments = [...(note?.files ?? []), ...uploaded].filter(
    (f, i, all) => referenced.has(f.id) && all.findIndex((x) => x.id === f.id) === i,
  );

  const explain = values.type === "EXPLAIN_IT";

  return (
    <div
      className="space-y-4"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void flush();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/notes">
            <ArrowLeft aria-hidden /> Notes
          </Link>
        </Button>
        <SaveStatus status={status} isNew={!noteId} />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={values.pinned}
          onClick={() => set("pinned", !values.pinned)}
        >
          {values.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
          <span className="sr-only sm:not-sr-only">{values.pinned ? "Unpin" : "Pin"}</span>
        </Button>
        {noteId && (
          <>
            {explain && ai && <CheckExplanation noteId={noteId} beforeCheck={flush} />}
            {explain && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/artifacts?fromNote=${noteId}`}>
                  <Package aria-hidden /> <span className="sr-only sm:not-sr-only">Promote</span>
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href={`/flashcards?fromNote=${noteId}`}>
                <Layers aria-hidden /> <span className="sr-only sm:not-sr-only">Flashcards</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/notes/${noteId}/export`} download>
                <Download aria-hidden /> <span className="sr-only sm:not-sr-only">Export </span>.md
              </a>
            </Button>
            <Confirm
              title="Delete this note?"
              description="The note is deleted permanently. Attached files stay in Files."
              onConfirm={async () => {
                markSaved(JSON.stringify(latest.current));
                await deleteNote(noteId);
              }}
            >
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 aria-hidden /> <span className="sr-only sm:not-sr-only">Delete</span>
              </Button>
            </Confirm>
          </>
        )}
      </div>

      <Input
        aria-label="Title"
        placeholder={explain ? "Concept you're explaining, e.g. “Docker volumes”" : "Title"}
        value={values.title}
        onChange={(e) => set("title", e.target.value)}
        autoFocus={!note}
        className="h-11 text-lg font-semibold"
      />

      <div className="grid gap-4 md:grid-cols-[10rem_1fr]">
        <Field label="Type" htmlFor="note-type">
          <Select
            id="note-type"
            value={values.type}
            onChange={(e) => set("type", e.target.value as Values["type"])}
          >
            <option value="NOTE">Note</option>
            <option value="EXPLAIN_IT">Explain-it</option>
          </Select>
        </Field>
        <ProjectTopicPicker
          idPrefix="note"
          projects={projects}
          value={{ projectId: values.projectId, topicId: values.topicId }}
          onChange={(v) => setValues((prev) => ({ ...prev, ...v }))}
        />
      </div>
      <Field label="Tags" htmlFor="note-tags">
        <TagInput
          id="note-tags"
          value={values.tags}
          onChange={(t) => set("tags", t)}
          suggestions={tagSuggestions}
        />
      </Field>

      {explain && (
        <p className="rounded-lg border border-stage-explain/30 bg-stage-explain/10 p-3 text-sm">
          <strong className="text-stage-explain">Explain-it.</strong> {EXPLAIN_IT_PROMPT}
        </p>
      )}

      <div className="flex items-center gap-1 lg:hidden" role="tablist" aria-label="Editor view">
        {(["write", "preview"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm capitalize",
              view === v ? "bg-secondary font-medium" : "text-muted-foreground",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn("space-y-2", view === "preview" && "hidden lg:block")}>
          <div
            className={cn("relative rounded-md", dragging && "ring-2 ring-ring ring-offset-2")}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              setDragging(false);
              void attach([...e.dataTransfer.files]);
            }}
          >
            <Textarea
              ref={textareaRef}
              aria-label="Content (markdown)"
              value={values.content}
              onChange={(e) => set("content", e.target.value)}
              onPaste={(e) => {
                const files = [...e.clipboardData.files];
                if (files.length) {
                  e.preventDefault();
                  void attach(files);
                }
              }}
              placeholder={
                explain
                  ? EXPLAIN_IT_PROMPT
                  : "Write in markdown. Drop or paste files here to attach them."
              }
              className="min-h-[50dvh] resize-y font-mono text-[13px] leading-relaxed lg:min-h-[60dvh]"
            />
            {dragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/80 text-sm font-medium">
                Drop to attach
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip aria-hidden /> {uploading ? "Uploading…" : "Attach file"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void attach(files);
              }}
            />
            <span>Markdown · Ctrl+S saves now</span>
            {uploadError && (
              <span role="alert" className="text-destructive">
                {uploadError}
              </span>
            )}
          </div>
        </div>
        <div
          className={cn(
            "min-h-40 rounded-md border p-4 lg:min-h-[60dvh]",
            view === "write" && "hidden lg:block",
          )}
          aria-label="Preview"
        >
          {values.content.trim() ? (
            <Markdown>{values.content}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      </div>

      {attachments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Attachments</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {attachments.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/files/${f.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-accent"
                >
                  <Paperclip className="size-3.5" aria-hidden />
                  {f.originalName}
                  <span className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SaveStatus({ status, isNew }: { status: Status; isNew: boolean }) {
  let text: React.ReactNode;
  if (typeof status === "object")
    text = <span className="text-destructive">Not saved: {status.error}</span>;
  else if (status === "saving") text = "Saving…";
  else if (status === "dirty") text = "Unsaved changes";
  else if (isNew) text = "Starts saving once you type";
  else
    text = (
      <span className="inline-flex items-center gap-1">
        <Check className="size-3.5" aria-hidden /> Saved
      </span>
    );
  return (
    <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
      {text}
    </span>
  );
}
