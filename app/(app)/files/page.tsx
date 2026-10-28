import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Folder } from "lucide-react";
import { db } from "@/lib/db";
import { fileUrl, formatBytes, isImage } from "@/lib/files";
import { fmtDate } from "@/lib/format";
import { maxUploadMb } from "@/lib/uploads";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { FileFilters } from "@/components/files/file-filters";
import { FileIcon } from "@/components/files/file-icon";
import { FileUploader } from "@/components/files/file-uploader";

export const metadata = { title: "Files" };

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const where: Prisma.FileAssetWhereInput = {};
  if (sp.project === "none") where.projectId = null;
  else if (sp.project) where.projectId = sp.project;
  if (sp.q?.trim()) where.originalName = { contains: sp.q.trim(), mode: "insensitive" };

  const [files, projects] = await Promise.all([
    db.fileAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { notes: true, postmortems: true } },
      },
    }),
    db.project.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: { id: true, name: true, status: true },
    }),
  ]);
  const active = projects.find((p) => p.status === "ACTIVE");
  const defaultProject = sp.project && sp.project !== "none" ? sp.project : (active?.id ?? null);
  const filtered = !!(sp.q || sp.project);

  return (
    <>
      <PageHeader title="Files" description="Proof lives here: screenshots, logs, diagrams." />
      <FileUploader projects={projects} defaultProjectId={defaultProject} maxMb={maxUploadMb()} />
      <FileFilters projects={projects} />
      {!files.length ? (
        <EmptyState icon={<Folder />} title={filtered ? "No matching files" : "No files yet"}>
          {filtered
            ? "Try another name or clear the project filter."
            : "Upload evidence of what you built and broke. Files dropped into notes land here too."}
        </EmptyState>
      ) : sp.view === "list" ? (
        <ul className="divide-y rounded-xl border">
          {files.map((f) => (
            <li key={f.id}>
              <Link
                href={`/files/${f.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm hover:bg-accent/40"
              >
                <FileIcon
                  mimeType={f.mimeType}
                  name={f.originalName}
                  className="size-4 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate font-medium">{f.originalName}</span>
                {f.project && <span className="text-muted-foreground">{f.project.name}</span>}
                <span className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(f.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {files.map((f) => (
            <li key={f.id}>
              <Link
                href={`/files/${f.id}`}
                className="group block overflow-hidden rounded-xl border hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                  {isImage(f.mimeType) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fileUrl(f.id)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <FileIcon
                      mimeType={f.mimeType}
                      name={f.originalName}
                      className="size-10 text-muted-foreground"
                    />
                  )}
                </div>
                <div className="space-y-0.5 p-2.5">
                  <p className="truncate text-sm font-medium" title={f.originalName}>
                    {f.originalName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBytes(f.sizeBytes)}
                    {f.project && ` · ${f.project.name}`}
                    {f._count.notes + f._count.postmortems > 0 &&
                      ` · ${f._count.notes + f._count.postmortems} link${f._count.notes + f._count.postmortems === 1 ? "" : "s"}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
