"use client";

import * as React from "react";
import { Paperclip } from "lucide-react";
import { Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/markdown/markdown";
import { useUpload, type UploadedFile } from "@/components/files/use-upload";
import { markdownForFile } from "@/lib/files";
import { cn } from "@/lib/utils";

type Attachment = Omit<UploadedFile, "url">;

/** A markdown textarea with Write/Preview and file drop/paste/pick, used by forms
 * that save explicitly (postmortems, flashcards). */
export function MarkdownField({
  id,
  label,
  placeholder,
  value,
  onChange,
  projectId,
  onUploaded,
  className,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  projectId: string | null;
  onUploaded?: (files: Attachment[]) => void;
  className?: string;
}) {
  const [preview, setPreview] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const { upload, uploading, error } = useUpload();

  async function attach(files: File[]) {
    const done = await upload(files, projectId);
    if (!done.length) return;
    onUploaded?.(done);
    const snippet = done.map(markdownForFile).join("\n");
    const cur = valueRef.current;
    const start = ref.current?.selectionStart ?? cur.length;
    const end = ref.current?.selectionEnd ?? start;
    const before = cur.slice(0, start);
    const pad = before && !before.endsWith("\n") ? "\n" : "";
    onChange(`${before}${pad}${snippet}\n${cur.slice(end)}`);
    setPreview(false);
  }

  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <div className="ml-auto flex items-center gap-1 text-xs">
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1",
              !preview ? "bg-secondary font-medium" : "text-muted-foreground",
            )}
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
          >
            Write
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1",
              preview ? "bg-secondary font-medium" : "text-muted-foreground",
            )}
            aria-pressed={preview}
            onClick={() => setPreview(true)}
          >
            Preview
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="size-3.5" aria-hidden />
            {uploading ? "Uploading…" : "Attach"}
            <span className="sr-only"> to {label}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              void attach(files);
            }}
          />
        </div>
      </div>
      {preview ? (
        <div className="min-h-24 rounded-md border p-3">
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
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
            ref={ref}
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length) {
                e.preventDefault();
                void attach(files);
              }
            }}
            placeholder={placeholder}
            className={cn("min-h-28 resize-y font-mono text-[13px] leading-relaxed", className)}
          />
          {dragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/80 text-sm font-medium">
              Drop to attach
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
