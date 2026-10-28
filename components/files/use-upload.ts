"use client";

import * as React from "react";

export type UploadedFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

/** Uploads files to /api/files and tracks progress/errors. */
export function useUpload() {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const upload = React.useCallback(
    async (files: File[], projectId?: string | null): Promise<UploadedFile[]> => {
      if (!files.length) return [];
      setUploading(true);
      setError(null);
      try {
        const fd = new FormData();
        for (const f of files) fd.append("file", f);
        if (projectId) fd.append("projectId", projectId);
        const res = await fetch("/api/files", { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as {
          files?: UploadedFile[];
          error?: string;
        };
        if (!res.ok || !body.files) throw new Error(body.error ?? `Upload failed (${res.status})`);
        return body.files;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        return [];
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  return { upload, uploading, error, clearError: () => setError(null) };
}
