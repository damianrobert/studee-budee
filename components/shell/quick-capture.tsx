"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "radix-ui";
import { BookOpen, Briefcase, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { TagInput } from "@/components/notes/tag-input";
import { createNote } from "@/lib/actions/notes";
import { addReadingItem } from "@/lib/actions/reading";
import { createObservation } from "@/lib/actions/work";
import { cn } from "@/lib/utils";

type Kind = "note" | "reading" | "work";
type Done = { text: string; href: string; linkLabel: string };

const TABS: { value: Kind; label: string; icon: typeof NotebookPen }[] = [
  { value: "note", label: "Note", icon: NotebookPen },
  { value: "reading", label: "Link", icon: BookOpen },
  { value: "work", label: "Observation", icon: Briefcase },
];
const TAB_KEY = "sb_capture_tab";

function readTab(): Kind {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === "note" || v === "reading" || v === "work") return v;
  } catch {}
  return "note";
}

/**
 * Ctrl/Cmd+J: add a note, a reading link or a work observation without leaving the page.
 * Stays open after saving (with a link to what was saved) so several things can go in.
 */
export function QuickCapture({
  open,
  onOpenChange,
  tagSuggestions,
  mod,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagSuggestions: string[];
  /** "Ctrl" or "⌘", for the shortcut hint. */
  mod: string;
}) {
  const [tab, setTab] = React.useState<Kind>("note");
  const [done, setDone] = React.useState<Done | null>(null);

  React.useEffect(() => {
    if (open) {
      setTab(readTab());
      setDone(null);
    }
  }, [open]);

  function changeTab(v: string) {
    setTab(v as Kind);
    setDone(null);
    try {
      localStorage.setItem(TAB_KEY, v);
    } catch {}
  }

  const formProps = { tagSuggestions, onDone: setDone, mod };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[8dvh] translate-y-0 sm:top-[12dvh]">
        <DialogHeader>
          <DialogTitle>Quick capture</DialogTitle>
          <DialogDescription>Get it out of your head. Tidy it up later.</DialogDescription>
        </DialogHeader>
        <Tabs.Root value={tab} onValueChange={changeTab}>
          <Tabs.List
            aria-label="What to capture"
            className="mb-4 grid grid-cols-3 rounded-md bg-muted p-1"
          >
            {TABS.map((t) => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  "data-[state=active]:bg-background data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                )}
              >
                <t.icon className="hidden size-4 shrink-0 min-[400px]:block" aria-hidden />
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="note" tabIndex={-1}>
            <NoteForm {...formProps} />
          </Tabs.Content>
          <Tabs.Content value="reading" tabIndex={-1}>
            <ReadingForm {...formProps} />
          </Tabs.Content>
          <Tabs.Content value="work" tabIndex={-1}>
            <WorkForm {...formProps} />
          </Tabs.Content>
        </Tabs.Root>
        <p role="status" aria-live="polite" className="mt-3 truncate text-sm text-muted-foreground">
          {done && (
            <>
              {done.text}{" "}
              <Link
                href={done.href}
                className="text-foreground underline"
                onClick={() => onOpenChange(false)}
              >
                {done.linkLabel}
              </Link>
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}

type FormProps = { tagSuggestions: string[]; onDone: (d: Done | null) => void; mod: string };

/** Shared submit handling: pending state, error, Ctrl/Cmd+Enter submits. */
function useCaptureForm(
  save: () => Promise<{ ok: true; done: Done } | { ok: false; error: string }>,
  reset: () => void,
  onDone: (d: Done) => void,
) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const res = await save();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      reset();
      onDone(res.done);
      formRef.current?.querySelector<HTMLElement>("input, textarea")?.focus();
    });
  }
  const formAttrs = {
    ref: formRef,
    onSubmit: submit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    },
    className: "space-y-4",
  };
  return { error, pending, formAttrs };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

function NoteForm({ tagSuggestions, onDone, mod }: FormProps) {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const pathname = usePathname();
  const router = useRouter();
  const f = useCaptureForm(
    async () => {
      const res = await createNote({
        title,
        content,
        type: "NOTE",
        projectId: null,
        topicId: null,
        tags,
        pinned: false,
      });
      if (!res.ok) return res;
      // createNote doesn't revalidate (it's also the autosave path); refresh the list if it's open.
      if (pathname === "/notes") router.refresh();
      return {
        ok: true,
        done: {
          text: `Saved “${title.trim() || "Untitled"}”.`,
          href: `/notes/${res.data}`,
          linkLabel: "Open note",
        },
      };
    },
    () => {
      setTitle("");
      setContent("");
      setTags([]);
    },
    onDone,
  );

  return (
    <form {...f.formAttrs} aria-label="Capture a note">
      <Field label="Title" htmlFor="capture-note-title">
        <Input
          id="capture-note-title"
          autoFocus
          maxLength={300}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // Enter in the title moves on to the body instead of saving.
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              document.getElementById("capture-note-content")?.focus();
            }
          }}
          placeholder="e.g. Why my healthcheck flapped"
        />
      </Field>
      <Field
        label="Note"
        htmlFor="capture-note-content"
        hint={`Markdown works. ${mod}+Enter saves.`}
      >
        <Textarea
          id="capture-note-content"
          rows={5}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="font-mono text-[13px]"
        />
      </Field>
      <Field label="Tags" htmlFor="capture-note-tags">
        <TagInput
          id="capture-note-tags"
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
        />
      </Field>
      <ErrorLine error={f.error} />
      <Button type="submit" disabled={f.pending || !(title.trim() || content.trim())}>
        {f.pending ? "Saving…" : "Save note"}
      </Button>
    </form>
  );
}

function ReadingForm({ tagSuggestions, onDone }: FormProps) {
  const [url, setUrl] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const f = useCaptureForm(
    async () => {
      const res = await addReadingItem({ url, tags });
      if (!res.ok) return res;
      return {
        ok: true,
        done: {
          text: `Added “${res.data?.title ?? url.trim()}”.`,
          href: `/reading?hl=${res.data?.id}`,
          linkLabel: "Open inbox",
        },
      };
    },
    () => {
      setUrl("");
      setTags([]);
    },
    onDone,
  );

  return (
    <form {...f.formAttrs} aria-label="Capture a link">
      <Field label="Link" htmlFor="capture-url" hint="The title is fetched for you.">
        <Input
          id="capture-url"
          autoFocus
          type="text"
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link…"
        />
      </Field>
      <Field label="Tags" htmlFor="capture-url-tags">
        <TagInput
          id="capture-url-tags"
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
        />
      </Field>
      <ErrorLine error={f.error} />
      <Button type="submit" disabled={f.pending || !url.trim()}>
        {f.pending ? "Fetching title…" : "Add to reading"}
      </Button>
    </form>
  );
}

function WorkForm({ tagSuggestions, onDone }: FormProps) {
  const [content, setContent] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const f = useCaptureForm(
    async () => {
      const res = await createObservation({ content, question, tags });
      if (!res.ok) return res;
      return {
        ok: true,
        done: { text: "Logged.", href: `/work?hl=${res.data}`, linkLabel: "Open work log" },
      };
    },
    () => {
      setContent("");
      setQuestion("");
      setTags([]);
    },
    onDone,
  );

  return (
    <form {...f.formAttrs} aria-label="Capture an observation">
      <Field label="What did you notice?" htmlFor="capture-obs">
        <Textarea
          id="capture-obs"
          autoFocus
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="e.g. The deploy pipeline waits 10 min on a manual approval step"
        />
      </Field>
      <Field label="Question for a colleague (optional)" htmlFor="capture-obs-question">
        <Input
          id="capture-obs-question"
          maxLength={2000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Why is it manual?"
        />
      </Field>
      <Field label="Tags" htmlFor="capture-obs-tags">
        <TagInput
          id="capture-obs-tags"
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
        />
      </Field>
      <ErrorLine error={f.error} />
      <Button type="submit" disabled={f.pending || !content.trim()}>
        {f.pending ? "Saving…" : "Log it"}
      </Button>
    </form>
  );
}
