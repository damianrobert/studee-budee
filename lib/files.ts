// File helpers shared by the upload route, the file route and the UI. No Node APIs here.

/** Names of stored uploads on disk: `<uuid>.<ext>`. */
export const STORED_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,10})?$/;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tgz: "application/gzip",
  tar: "application/x-tar",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  html: "text/html",
  htm: "text/html",
  csv: "text/csv",
};

/** Extensions shown as highlighted text, mapped to a highlight.js language ("" = plain). */
export const TEXT_LANG: Record<string, string> = {
  txt: "",
  log: "",
  md: "markdown",
  markdown: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  tf: "hcl",
  hcl: "hcl",
  tfvars: "hcl",
  py: "python",
  go: "go",
  sql: "sql",
  js: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  toml: "ini",
  ini: "ini",
  conf: "ini",
  cfg: "ini",
  env: "bash",
  xml: "xml",
  css: "css",
  csv: "",
  diff: "diff",
  patch: "diff",
  rs: "rust",
  java: "java",
  rb: "ruby",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

/** Lower-case extension without the dot ("" if none). Files like `Dockerfile` map to their name. */
export function fileExt(name: string): string {
  const base = name.toLowerCase();
  if (base === "dockerfile" || base === "makefile") return base;
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  const ext = base.slice(i + 1);
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "";
}

/** Keeps a readable name but drops paths, control characters and reserved characters. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (!clean) return "file";
  if (clean.length <= 200) return clean;
  const ext = fileExt(clean);
  return ext ? `${clean.slice(0, 199 - ext.length)}.${ext}` : clean.slice(0, 200);
}

export function mimeFor(name: string, browserType?: string | null): string {
  const ext = fileExt(name);
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  if (ext in TEXT_LANG) return "text/plain";
  if (browserType && /^[\w.+-]+\/[\w.+-]+$/.test(browserType)) return browserType;
  return "application/octet-stream";
}

export type PreviewKind = "image" | "pdf" | "text" | "video" | "audio" | "none";

export function previewKind(mimeType: string, name: string): PreviewKind {
  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (fileExt(name) in TEXT_LANG || mimeType === "text/plain") return "text";
  return "none";
}

/**
 * What the file route may serve inline. Everything else (HTML, SVG, unknown types)
 * is served as an attachment so it can never run in the app's origin.
 */
export function inlineContentType(mimeType: string, name: string): string | null {
  const kind = previewKind(mimeType, name);
  if (kind === "text") return "text/plain; charset=utf-8";
  if (kind === "none") return null;
  return mimeType;
}

export function isImage(mimeType: string): boolean {
  return previewKind(mimeType, "") === "image";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fileUrl(id: string, download = false): string {
  return `/api/files/${id}${download ? "?download=1" : ""}`;
}

/** File ids referenced as `/api/files/<id>` links in markdown. */
export function referencedFileIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const m of markdown.matchAll(/\/api\/files\/([a-z0-9]{20,40})\b/g)) ids.add(m[1]!);
  return [...ids];
}

/** Markdown that embeds (images) or links (everything else) an uploaded file. */
export function markdownForFile(f: { id: string; originalName: string; mimeType: string }) {
  const label = f.originalName.replace(/([[\]\\])/g, "\\$1");
  return `${isImage(f.mimeType) ? "!" : ""}[${label}](${fileUrl(f.id)})`;
}
