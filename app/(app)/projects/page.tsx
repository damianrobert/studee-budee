import Link from "next/link";
import type { LoopStage } from "@prisma/client";
import { Plus, SquareKanban } from "lucide-react";
import { aiEnabled } from "@/lib/ai/config";
import { db } from "@/lib/db";
import { fmtRelativeDays } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { StageBar } from "@/components/projects/stage-bar";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { WIP_LINE } from "@/components/projects/project-status-actions";

export const metadata = { title: "Projects" };

const ORDER = { ACTIVE: 0, PAUSED: 1, DONE: 2, ARCHIVED: 3 } as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const showArchived = (await searchParams).archived === "1";
  const projects = await db.project.findMany({
    where: showArchived ? {} : { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: {
      topics: { select: { stage: true } },
      sessions: { orderBy: { startedAt: "desc" }, take: 1, select: { startedAt: true } },
    },
  });
  projects.sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const ai = aiEnabled();

  return (
    <>
      <PageHeader
        title="Projects"
        description={WIP_LINE}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={showArchived ? "/projects" : "/projects?archived=1"}>
                {showArchived ? "Hide archived" : "Show archived"}
              </Link>
            </Button>
            <ProjectFormDialog ai={ai}>
              <Button>
                <Plus aria-hidden /> New project
              </Button>
            </ProjectFormDialog>
          </>
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          icon={<SquareKanban />}
          title="No projects yet"
          action={
            <ProjectFormDialog ai={ai}>
              <Button>
                <Plus aria-hidden /> Create your first project
              </Button>
            </ProjectFormDialog>
          }
        >
          Projects are what you actually build. Each one holds topics you move through Pain → Build
          → Break → Explain.{ai && " Bring your own idea or let the mentor suggest one."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const counts: Partial<Record<LoopStage, number>> = {};
            for (const t of p.topics) counts[t.stage] = (counts[t.stage] ?? 0) + 1;
            const last = p.sessions[0]?.startedAt;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Card
                  className={
                    p.status === "ACTIVE"
                      ? "h-full border-success/50"
                      : "h-full transition-colors hover:bg-accent/40"
                  }
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold">{p.name}</h2>
                      <ProjectStatusBadge status={p.status} />
                    </div>
                    {p.goal && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{p.goal}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <StageBar counts={counts} />
                    <p className="text-xs text-muted-foreground">
                      {last ? `Last session ${fmtRelativeDays(last)}` : "No sessions yet"}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
