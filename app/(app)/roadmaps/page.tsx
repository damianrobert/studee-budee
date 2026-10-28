import Link from "next/link";
import { Route } from "lucide-react";
import { aiEnabled } from "@/lib/ai/config";
import { webSearchEnabled } from "@/lib/ai/research";
import { db } from "@/lib/db";
import { fmtRelativeDays } from "@/lib/format";
import { progress } from "@/lib/roadmaps";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { NewRoadmapDialog } from "@/components/roadmaps/new-roadmap-dialog";

export const metadata = { title: "Roadmaps" };

export default async function RoadmapsPage() {
  const ai = aiEnabled();
  const webSearch = webSearchEnabled();
  const roadmaps = await db.roadmap.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      stages: {
        orderBy: { position: "asc" },
        select: { steps: { select: { status: true } } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Roadmaps"
        description="Learning paths planned by the AI, with resources for every step. Change them with a prompt whenever you like."
        actions={ai && roadmaps.length > 0 && <NewRoadmapDialog webSearch={webSearch} />}
      />
      {roadmaps.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {roadmaps.map((r) => {
            const p = progress(r.stages.flatMap((s) => s.steps));
            return (
              <li key={r.id}>
                <Link
                  href={`/roadmaps/${r.id}`}
                  className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs transition-colors hover:border-foreground/30"
                >
                  <div className="space-y-1">
                    <h2 className="font-semibold">{r.title}</h2>
                    {r.summary && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{r.summary}</p>
                    )}
                  </div>
                  <div className="mt-auto space-y-1.5">
                    <div
                      role="progressbar"
                      aria-label="Steps done"
                      aria-valuenow={p.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                    >
                      <div className="h-full bg-success" style={{ width: `${p.percent}%` }} />
                    </div>
                    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                      <span>
                        {p.done} of {p.total} steps done
                      </span>
                      <span>
                        {r.stages.length} stage{r.stages.length === 1 ? "" : "s"}
                      </span>
                      <span>updated {fmtRelativeDays(r.updatedAt)}</span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Route />}
          title="No roadmaps yet"
          action={
            ai ? (
              <NewRoadmapDialog webSearch={webSearch}>
                <Button>Plan my first roadmap</Button>
              </NewRoadmapDialog>
            ) : undefined
          }
        >
          {ai
            ? "Describe what you want to learn and where you're starting from. The AI lays out the stages and steps and finds resources for each one."
            : "Roadmaps are planned by the AI, which is turned off. Set GOOGLE_GEMINI_API_KEY in .env and restart to use them."}
        </EmptyState>
      )}
    </div>
  );
}
