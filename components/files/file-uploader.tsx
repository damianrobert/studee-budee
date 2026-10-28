"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useUpload } from "./use-upload";

export function FileUploader({
  projects,
  defaultProjectId,
  maxMb,
}: {
  projects: { id: string; name: string }[];
  defaultProjectId: string | null;
  maxMb: number;
}) {
  const router = useRouter();
  const { upload, uploading, error } = useUpload();
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? "");
  const [dragging, setDragging] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function send(files: File[]) {
    setDone(null);
    const res = await upload(files, projectId || null);
    if (res.length) {
      setDone(`Uploaded ${res.length} file${res.length === 1 ? "" : "s"}.`);
      router.refresh();
    }
  }

  return (
    <div
      className={cn(
        "mb-6 flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors",
        dragging && "border-ring bg-accent/50",
      )}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void send([...e.dataTransfer.files]);
      }}
    >
      <Upload className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">
        Drop screenshots, logs or diagrams here — up to {maxMb} MB each.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Select
          aria-label="Project for uploaded files"
          className="w-auto"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Uploading…" : "Choose files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          aria-label="Choose files to upload"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void send(files);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      )}
    </div>
  );
}
