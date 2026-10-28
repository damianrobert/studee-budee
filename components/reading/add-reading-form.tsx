"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/notes/tag-input";
import { addReadingItem } from "@/lib/actions/reading";

/** Paste a link, optionally tag it, done. The title is fetched on the server. */
export function AddReadingForm({ tagSuggestions }: { tagSuggestions: string[] }) {
  const [url, setUrl] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    startTransition(async () => {
      const res = await addReadingItem({ url, tags });
      if (!res.ok) return setMessage({ error: true, text: res.error });
      setMessage({ error: false, text: `Added: ${res.data?.title ?? url.trim()}` });
      setUrl("");
      setTags([]);
      inputRef.current?.focus();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mb-6 space-y-2 rounded-xl border p-3"
      aria-label="Add to reading inbox"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          aria-label="Link"
          placeholder="Paste a link…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-10 sm:flex-1"
        />
        <TagInput
          id="reading-tags"
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
          className="sm:w-64"
        />
        <Button type="submit" disabled={pending || !url.trim()} className="h-10">
          <Plus aria-hidden /> {pending ? "Fetching title…" : "Add"}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={
          message?.error ? "text-sm text-destructive" : "truncate text-sm text-muted-foreground"
        }
      >
        {message?.text}
      </p>
    </form>
  );
}
