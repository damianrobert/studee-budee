import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Siren } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { plainPreview } from "@/lib/notes";
import { getProjectOptions } from "@/lib/sessions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PostmortemFilters } from "@/components/postmortems/postmortem-filters";
import { PostmortemKindBadge } from "@/components/postmortems/kind-badge";

export const metadata = { title: "Postmortems" };

type SP = { project?: string; topic?: string; kind?: string };

export default async function PostmortemsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const where: Prisma.PostmortemWhereInput = {};
  if (sp.project === "none") where.projectId = null;
  else if (sp.project) where.projectId = sp.project;
  if (sp.topic) where.topicId = sp.topic;
  if (sp.kind === "real") where.wasDeliberate = false;
  else if (sp.kind === "chaos") where.wasDeliberate = true;

  const [postmortems, projects, totals] = await Promise.all([
    db.postmortem.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: 300,
      select: {
        id: true,
        title: true,
        occurredAt: true,
        wasDeliberate: true,
        whatBroke: true,
        project: { select: { name: true } },
        topic: { select: { title: true } },
        chaosExperiment: { select: { title: true } },
        tags: { select: { name: true }, orderBy: { name: "asc" } },
      },
    }),
    getProjectOptions(),
    db.postmortem.groupBy({ by: ["wasDeliberate"], _count: true }),
  ]);
  const count = (d: boolean) => totals.find((t) => t.wasDeliberate === d)?._count ?? 0;
  const filtered = !!(sp.project || sp.topic || sp.kind);

  return (
    <>
      <PageHeader
        title="Postmortems"
        description={
          count(true) + count(false)
            ? `Failure is the curriculum. ${count(false)} real, ${count(true)} deliberate.`
            : "Failure is the curriculum."
        }
        actions={
          <Button asChild>
            <Link href="/postmortems/new">
              <Plus aria-hidden /> New postmortem
            </Link>
          </Button>
        }
      />
      <PostmortemFilters projects={projects} />
      {postmortems.length ? (
        <ul className="divide-y rounded-xl border">
          {postmortems.map((p) => (
            <li key={p.id}>
              <Link
                href={`/postmortems/${p.id}`}
                className="block space-y-1 p-4 hover:bg-accent/40"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{p.title}</span>
                  <PostmortemKindBadge deliberate={p.wasDeliberate} />
                  {p.project && (
                    <span className="text-muted-foreground">
                      {p.project.name}
                      {p.topic && ` · ${p.topic.title}`}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fmtDate(p.occurredAt)}
                  </span>
                </div>
                {p.whatBroke.trim() && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {plainPreview(p.whatBroke)}
                  </p>
                )}
                {(p.chaosExperiment || p.tags.length > 0) && (
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    {p.chaosExperiment && <span>Experiment: {p.chaosExperiment.title}</span>}
                    {p.tags.map((t) => (
                      <span key={t.name}>#{t.name}</span>
                    ))}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : filtered ? (
        <EmptyState icon={<Siren />} title="No matching postmortems">
          Try clearing a filter.
        </EmptyState>
      ) : (
        <EmptyState
          icon={<Siren />}
          title="No postmortems yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/postmortems/new">Write a postmortem</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/chaos">Break something</Link>
              </Button>
            </div>
          }
        >
          Every outage you debug — real or deliberate — is worth writing down. A good postmortem is
          proof you can run things in production.
        </EmptyState>
      )}
    </>
  );
}
