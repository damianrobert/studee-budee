import Link from "next/link";
import { ExternalLink, Package, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { ARTIFACT_KIND_LABEL, monthKeyOf, monthLabel, orderMonths } from "@/lib/artifacts";
import { fmtDate } from "@/lib/format";
import { appTz, todayKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ArtifactActions, StatusPills } from "@/components/artifacts/artifact-actions";
import {
  ArtifactFormDialog,
  PromoteDialog,
  type ArtifactSource,
  type ArtifactValues,
} from "@/components/artifacts/artifact-form-dialog";

export const metadata = { title: "Artifacts" };

type SP = { fromNote?: string; fromPostmortem?: string };

async function promoteSource(sp: SP, month: string) {
  const blank = { status: "IDEA", url: "", notes: "", targetMonth: month } as const;
  if (sp.fromPostmortem) {
    const pm = await db.postmortem.findUnique({
      where: { id: sp.fromPostmortem },
      select: { id: true, title: true },
    });
    if (pm)
      return {
        initial: { ...blank, title: `Postmortem: ${pm.title}`, kind: "BLOG_POST" },
        source: { postmortemId: pm.id, label: `postmortem “${pm.title}”` },
      } satisfies { initial: ArtifactValues; source: ArtifactSource };
  }
  if (sp.fromNote) {
    const note = await db.note.findUnique({
      where: { id: sp.fromNote },
      select: { id: true, title: true },
    });
    if (note)
      return {
        initial: { ...blank, title: note.title, kind: "BLOG_POST" },
        source: { noteId: note.id, label: `note “${note.title}”` },
      } satisfies { initial: ArtifactValues; source: ArtifactSource };
  }
  return null;
}

export default async function ArtifactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tz = appTz();
  const current = todayKey(tz).slice(0, 7);
  const [artifacts, promote] = await Promise.all([
    db.artifact.findMany({
      orderBy: [{ targetMonth: "asc" }, { createdAt: "asc" }],
      include: {
        sourceNote: { select: { id: true, title: true } },
        sourcePostmortem: { select: { id: true, title: true } },
      },
    }),
    promoteSource(sp, current),
  ]);

  const byMonth = new Map<string, typeof artifacts>();
  for (const a of artifacts) {
    const m = monthKeyOf(a.targetMonth, tz);
    byMonth.set(m, [...(byMonth.get(m) ?? []), a]);
  }
  const { upcoming, past } = orderMonths(current, byMonth.keys());
  const publishedThisMonth = artifacts.some(
    (a) => a.status === "PUBLISHED" && a.publishedAt && monthKeyOf(a.publishedAt, tz) === current,
  );
  const totalPublished = artifacts.filter((a) => a.status === "PUBLISHED").length;
  const blank = (month: string): ArtifactValues => ({
    title: "",
    kind: "BLOG_POST",
    status: "IDEA",
    url: "",
    notes: "",
    targetMonth: month,
  });

  const row = (month: string) => {
    const items = byMonth.get(month) ?? [];
    const highlight = month === current && !publishedThisMonth;
    return (
      <section
        key={month}
        aria-labelledby={`month-${month}`}
        className={cn("rounded-xl border", highlight && "border-warning/40 bg-warning/5")}
      >
        <header className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
          <h2 id={`month-${month}`} className="font-semibold">
            {monthLabel(month)}
          </h2>
          {month === current && <Badge variant="outline">This month</Badge>}
          {highlight && (
            <span className="text-xs text-warning">Nothing published yet — one is enough.</span>
          )}
          <span className="flex-1" />
          <ArtifactFormDialog initial={blank(month)}>
            <Button variant="ghost" size="sm" aria-label={`Add artifact to ${monthLabel(month)}`}>
              <Plus aria-hidden /> Add
            </Button>
          </ArtifactFormDialog>
        </header>
        {items.length ? (
          <ul className="divide-y border-t">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2">
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                      >
                        {a.title} <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : (
                      <span className="font-medium">{a.title}</span>
                    )}
                    <Badge variant="outline">{ARTIFACT_KIND_LABEL[a.kind]}</Badge>
                  </p>
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    {a.publishedAt && <span>published {fmtDate(a.publishedAt)}</span>}
                    {a.sourcePostmortem && (
                      <Link
                        href={`/postmortems/${a.sourcePostmortem.id}`}
                        className="hover:underline"
                      >
                        from postmortem: {a.sourcePostmortem.title}
                      </Link>
                    )}
                    {a.sourceNote && (
                      <Link href={`/notes/${a.sourceNote.id}`} className="hover:underline">
                        from note: {a.sourceNote.title}
                      </Link>
                    )}
                  </p>
                  {a.notes && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{a.notes}</p>
                  )}
                </div>
                <StatusPills id={a.id} status={a.status} />
                <ArtifactActions
                  artifact={{
                    id: a.id,
                    title: a.title,
                    kind: a.kind,
                    status: a.status,
                    url: a.url ?? "",
                    notes: a.notes ?? "",
                    targetMonth: month,
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            No artifact planned. Promote a postmortem or an explain-it note, or jot down an idea.
          </p>
        )}
      </section>
    );
  };

  return (
    <>
      <PageHeader
        title="Artifacts"
        description={`Proof over knowledge: one public thing a month. ${totalPublished} published so far.`}
        actions={
          <ArtifactFormDialog initial={blank(current)}>
            <Button>
              <Plus aria-hidden /> New artifact
            </Button>
          </ArtifactFormDialog>
        }
      />
      {promote && <PromoteDialog initial={promote.initial} source={promote.source} />}
      <div className="space-y-4">
        {row(current)}
        {upcoming.length > 0 && (
          <>
            <h2 className="pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Upcoming
            </h2>
            {upcoming.map(row)}
          </>
        )}
        {past.length > 0 && (
          <>
            <h2 className="pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Earlier
            </h2>
            {past.map(row)}
          </>
        )}
        {artifacts.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="size-4" aria-hidden />
            Tip: a postmortem or explain-it note has a “Promote to artifact” button.
          </p>
        )}
      </div>
    </>
  );
}
