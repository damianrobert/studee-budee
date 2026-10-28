import fs from "node:fs/promises";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { db } from "@/lib/db";
import { TEXT_LANG, fileExt, fileUrl, formatBytes, previewKind } from "@/lib/files";
import { fmtDateTime } from "@/lib/format";
import { storedPath } from "@/lib/uploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown, codeBlock } from "@/components/markdown/markdown";
import { DeleteFileButton, FileProjectSelect } from "@/components/files/file-actions";
import { FileIcon } from "@/components/files/file-icon";
import { ExplainItBadge } from "@/components/notes/note-type-badge";

const TEXT_PREVIEW_BYTES = 256 * 1024;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const f = await db.fileAsset.findUnique({
    where: { id: (await params).id },
    select: { originalName: true },
  });
  return { title: f?.originalName ?? "File" };
}

/** First 256 KB as text, or null if missing on disk or binary. */
async function readTextPreview(storedName: string) {
  try {
    const fh = await fs.open(storedPath(storedName), "r");
    try {
      const buf = Buffer.alloc(TEXT_PREVIEW_BYTES);
      const { bytesRead } = await fh.read(buf, 0, TEXT_PREVIEW_BYTES, 0);
      const chunk = buf.subarray(0, bytesRead);
      if (chunk.includes(0)) return null;
      return chunk.toString("utf8");
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [file, projects] = await Promise.all([
    db.fileAsset.findUnique({
      where: { id },
      include: {
        notes: { select: { id: true, title: true, type: true }, orderBy: { updatedAt: "desc" } },
        postmortems: { select: { id: true, title: true }, orderBy: { occurredAt: "desc" } },
      },
    }),
    db.project.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: { id: true, name: true },
    }),
  ]);
  if (!file) notFound();
  if (file.projectId && !projects.some((p) => p.id === file.projectId)) {
    const p = await db.project.findUnique({
      where: { id: file.projectId },
      select: { id: true, name: true },
    });
    if (p) projects.push(p);
  }

  const kind = previewKind(file.mimeType, file.originalName);
  const text = kind === "text" ? await readTextPreview(file.storedName) : null;
  const truncated = file.sizeBytes > TEXT_PREVIEW_BYTES;
  const src = fileUrl(file.id);
  const used = file.notes.length + file.postmortems.length;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/files">
          <ArrowLeft aria-hidden /> Files
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold break-all">
            <FileIcon
              mimeType={file.mimeType}
              name={file.originalName}
              className="size-5 shrink-0 text-muted-foreground"
            />
            {file.originalName}
          </h1>
          <p className="text-xs text-muted-foreground">
            {formatBytes(file.sizeBytes)} · {file.mimeType} · uploaded {fmtDateTime(file.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FileProjectSelect id={file.id} projectId={file.projectId} projects={projects} />
          <Button asChild variant="outline" size="sm">
            <a href={fileUrl(file.id, true)}>
              <Download aria-hidden /> Download
            </a>
          </Button>
          <DeleteFileButton id={file.id} name={file.originalName} used={used} />
        </div>
      </div>

      <section aria-label="Preview">
        {kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={file.originalName}
            className="max-h-[75dvh] max-w-full rounded-lg border"
          />
        )}
        {kind === "pdf" && (
          <object
            data={src}
            type="application/pdf"
            className="h-[75dvh] w-full rounded-lg border"
            aria-label={file.originalName}
          >
            <p className="p-4 text-sm">
              Your browser can&apos;t show PDFs inline.{" "}
              <a className="underline" href={src}>
                Open it
              </a>
              .
            </p>
          </object>
        )}
        {kind === "video" && (
          <video src={src} controls className="max-h-[75dvh] max-w-full rounded-lg border" />
        )}
        {kind === "audio" && <audio src={src} controls className="w-full" />}
        {kind === "text" &&
          (text !== null ? (
            <div className="space-y-2">
              <Markdown>{codeBlock(text, TEXT_LANG[fileExt(file.originalName)] ?? "")}</Markdown>
              {truncated && (
                <p className="text-xs text-muted-foreground">
                  Showing the first 256 KB. Download the file to see all of it.
                </p>
              )}
            </div>
          ) : (
            <NoPreview />
          ))}
        {kind === "none" && <NoPreview />}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Attached to</h2>
        {used ? (
          <ul className="space-y-1 text-sm">
            {file.notes.map((n) => (
              <li key={n.id} className="flex items-center gap-2">
                <Badge variant="outline">Note</Badge>
                <Link href={`/notes/${n.id}`} className="hover:underline">
                  {n.title}
                </Link>
                {n.type === "EXPLAIN_IT" && <ExplainItBadge />}
              </li>
            ))}
            {file.postmortems.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Badge variant="outline">Postmortem</Badge>
                <Link href={`/postmortems/${p.id}`} className="hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not attached anywhere. Link it from a note with{" "}
            <code className="rounded bg-muted px-1">{`[${file.originalName}](${src})`}</code>.
          </p>
        )}
      </section>
    </div>
  );
}

function NoPreview() {
  return (
    <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      No preview for this file type. Download it to open it.
    </p>
  );
}
