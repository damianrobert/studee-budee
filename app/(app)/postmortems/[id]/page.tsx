import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FlaskConical, Package, Paperclip, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/files";
import { fmtDateTime } from "@/lib/format";
import { POSTMORTEM_FIELDS, postmortemToMarkdown } from "@/lib/postmortems";
import { appTz } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown/markdown";
import { PostmortemKindBadge } from "@/components/postmortems/kind-badge";
import {
  CopyMarkdownButton,
  DeletePostmortemButton,
} from "@/components/postmortems/postmortem-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await db.postmortem.findUnique({
    where: { id: (await params).id },
    select: { title: true },
  });
  return { title: p?.title ?? "Postmortem" };
}

export default async function PostmortemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pm = await db.postmortem.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      topic: { select: { id: true, title: true } },
      chaosExperiment: { select: { id: true, title: true, hypothesis: true } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
      files: {
        select: { id: true, originalName: true, sizeBytes: true },
        orderBy: { originalName: "asc" },
      },
    },
  });
  if (!pm) notFound();
  const markdown = postmortemToMarkdown(pm, appTz());
  const filled = POSTMORTEM_FIELDS.filter((f) => pm[f.key].trim());

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/postmortems">
            <ArrowLeft aria-hidden /> Postmortems
          </Link>
        </Button>
        <div className="flex-1" />
        <CopyMarkdownButton markdown={markdown} />
        <Button asChild variant="outline" size="sm">
          <Link href={`/artifacts?fromPostmortem=${pm.id}`}>
            <Package aria-hidden /> Promote to artifact
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/postmortems/${pm.id}/edit`}>
            <Pencil aria-hidden /> Edit
          </Link>
        </Button>
        <DeletePostmortemButton id={pm.id} />
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{pm.title}</h1>
          <PostmortemKindBadge deliberate={pm.wasDeliberate} />
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{fmtDateTime(pm.occurredAt)}</span>
          {pm.project && (
            <Link
              href={`/projects/${pm.project.id}${pm.topic ? `?topic=${pm.topic.id}` : ""}`}
              className="hover:underline"
            >
              {pm.project.name}
              {pm.topic && ` · ${pm.topic.title}`}
            </Link>
          )}
          {pm.tags.map((t) => (
            <span key={t.name}>#{t.name}</span>
          ))}
        </p>
      </header>

      {pm.chaosExperiment && (
        <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <FlaskConical className="size-4 text-warning" aria-hidden />
            <Link href={`/chaos?show=${pm.chaosExperiment.id}`} className="hover:underline">
              {pm.chaosExperiment.title}
            </Link>
          </p>
          {pm.chaosExperiment.hypothesis && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Hypothesis:</span>{" "}
              {pm.chaosExperiment.hypothesis}
            </p>
          )}
        </div>
      )}

      {filled.length ? (
        filled.map((f) => (
          <section key={f.key} className="space-y-2">
            <h2 className="border-b pb-1 text-lg font-semibold">{f.label}</h2>
            <Markdown>{pm[f.key]}</Markdown>
          </section>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing written yet.{" "}
          <Link href={`/postmortems/${pm.id}/edit`} className="underline">
            Fill in the template
          </Link>
          .
        </p>
      )}

      {pm.files.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Attachments</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {pm.files.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/files/${f.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-accent"
                >
                  <Paperclip className="size-3.5" aria-hidden />
                  {f.originalName}
                  <span className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
