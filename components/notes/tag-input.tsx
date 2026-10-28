"use client";

import * as React from "react";
import { X } from "lucide-react";
import { normalizeTag } from "@/lib/tags";
import { cn } from "@/lib/utils";

/** Chips + free text. Enter or comma adds a tag (created on save if new). */
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
  className,
}: {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  className?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const add = (raw: string) => {
    const t = normalizeTag(raw);
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  const listId = `${id}-suggestions`;

  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {value.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
        >
          #{t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            className="rounded-full opacity-60 hover:opacity-100"
            onClick={() => onChange(value.filter((x) => x !== t))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={listId}
        value={draft}
        placeholder={value.length ? "" : "Add tags…"}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v.slice(0, -1));
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
