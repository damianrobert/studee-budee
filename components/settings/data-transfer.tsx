"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Label } from "@/components/ui/input";
import { formatBytes } from "@/lib/files";

type Summary = {
  counts: { label: string; count: number }[];
  filesRestored: number;
  filesMissing: number;
};

export function ExportData() {
  const [includeFiles, setIncludeFiles] = React.useState(true);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A .zip with your notes and postmortems as markdown (a folder per project), a JSON copy of
        all data for importing, and your uploaded files.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-current"
          checked={includeFiles}
          onChange={(e) => setIncludeFiles(e.target.checked)}
        />
        Include uploaded files
      </label>
      <Button asChild size="sm">
        <a href={includeFiles ? "/api/export" : "/api/export?files=0"} download>
          <Download aria-hidden /> Download export
        </a>
      </Button>
    </div>
  );
}

/** Posts the raw file with XHR so large archives show upload progress. */
function postImport(file: File, onProgress: (pct: number) => void): Promise<Summary> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/import");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = () => {
      const body = xhr.response as (Summary & { error?: string }) | null;
      if (xhr.status === 200 && body) resolve(body);
      else reject(new Error(body?.error ?? `Import failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Import failed: the connection was lost."));
    xhr.send(file);
  });
}

export function ImportData() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const busy = progress !== null;

  async function run() {
    if (!file) return;
    setError(null);
    setSummary(null);
    setProgress(0);
    try {
      setSummary(await postImport(file, setProgress));
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Restore from an export, e.g. on a new machine: the .zip (with files) or its data.json.{" "}
        <strong className="font-medium text-foreground">
          This replaces everything currently in the app.
        </strong>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="import-file">Export file</Label>
        <input
          ref={inputRef}
          id="import-file"
          type="file"
          accept=".zip,.json,application/zip,application/json"
          disabled={busy}
          className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
            setSummary(null);
          }}
        />
      </div>
      {file && (
        <Confirm
          title="Replace all data?"
          description={
            <>
              Everything in the app now (projects, sessions, notes, postmortems, files and the rest)
              is replaced by the contents of <strong>{file.name}</strong> ({formatBytes(file.size)}
              ). Download an export first if you might need the current data.
            </>
          }
          confirmLabel="Replace everything"
          onConfirm={run}
        >
          <Button size="sm" variant="destructive" disabled={busy}>
            <Upload aria-hidden /> {busy ? "Importing…" : "Import"}
          </Button>
        </Confirm>
      )}
      <div role="status" className="text-sm">
        {busy && (
          <span className="text-muted-foreground">
            {progress! < 100 ? `Uploading… ${Math.floor(progress!)}%` : "Importing…"}
          </span>
        )}
        {summary && (
          <div className="space-y-1">
            <p className="font-medium text-success">Import complete.</p>
            <p className="text-muted-foreground">
              {summary.counts.length
                ? summary.counts.map((c) => `${c.count} ${c.label}`).join(" · ")
                : "The export was empty."}
            </p>
            {summary.filesRestored > 0 && (
              <p className="text-muted-foreground">
                {summary.filesRestored} uploaded file{summary.filesRestored === 1 ? "" : "s"}{" "}
                restored.
              </p>
            )}
            {summary.filesMissing > 0 && (
              <p className="text-warning">
                {summary.filesMissing} file{summary.filesMissing === 1 ? " is" : "s are"} missing on
                disk. Import the .zip (not just data.json) to bring them along.
              </p>
            )}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
