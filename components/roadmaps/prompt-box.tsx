"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AiWorking } from "./ai-working";

/** A prompt for the AI with suggestion chips; shows what it did (or the error) afterwards. */
export function PromptBox({
  id,
  label,
  placeholder,
  suggestions,
  working,
  onSubmit,
  extra,
  className,
}: {
  id: string;
  label: string;
  placeholder: string;
  suggestions: string[];
  /** What the AI is doing while it runs. */
  working: string;
  /** Returns the summary to show, or an error. */
  onSubmit: (
    prompt: string,
  ) => Promise<{ ok: true; summary: string } | { ok: false; error: string }>;
  /** Controls next to the submit button (e.g. a scope select). */
  extra?: React.ReactNode;
  className?: string;
}) {
  const [prompt, setPrompt] = React.useState("");
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = (text: string) => {
    if (!text.trim()) return;
    setResult(null);
    startTransition(async () => {
      const res = await onSubmit(text);
      if (res.ok) {
        setPrompt("");
        setResult({ ok: true, text: res.summary });
      } else setResult({ ok: false, text: res.error });
    });
  };

  return (
    <form
      className={cn("space-y-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit(prompt);
      }}
    >
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles aria-hidden className="size-4" /> {label}
      </label>
      <Textarea
        id={id}
        rows={2}
        value={prompt}
        disabled={pending}
        placeholder={placeholder}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit(prompt);
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            onClick={() => submit(s)}
            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {extra}
          <Button type="submit" size="sm" disabled={pending || !prompt.trim()}>
            Apply
          </Button>
        </div>
      </div>
      {pending && <AiWorking>{working}</AiWorking>}
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={cn(
            "rounded-lg border p-3 text-sm",
            result.ok
              ? "border-success/40 bg-success/10"
              : "border-destructive/40 text-destructive",
          )}
        >
          {result.text}
        </p>
      )}
    </form>
  );
}
