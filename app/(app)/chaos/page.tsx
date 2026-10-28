import Link from "next/link";
import { CheckCircle2, Circle, FlaskConical, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { CHAOS_CATEGORIES } from "@/lib/chaos";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Markdown } from "@/components/markdown/markdown";
import { ChaosFilters } from "@/components/chaos/chaos-filters";
import { ChaosPicker } from "@/components/chaos/picker";
import { DifficultyDots } from "@/components/chaos/difficulty-dots";
import {
  DonePrompt,
  ExperimentActions,
  type Experiment,
} from "@/components/chaos/experiment-actions";
import { ExperimentFormDialog } from "@/components/chaos/experiment-form-dialog";

export const metadata = { title: "Chaos Lab" };

type SP = {
  category?: string;
  difficulty?: string;
  status?: string;
  show?: string;
  done?: string;
};

export default async function ChaosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rows = await db.chaosExperiment.findMany({
    orderBy: [{ difficulty: "asc" }, { category: "asc" }, { title: "asc" }],
    include: {
      _count: { select: { postmortems: true } },
      postmortems: {
        orderBy: { occurredAt: "desc" },
        take: 3,
        select: { id: true, title: true },
      },
    },
  });
  const experiments: (Experiment & { recent: { id: string; title: string }[] })[] = rows.map(
    (r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      hypothesis: r.hypothesis,
      category: r.category,
      difficulty: r.difficulty,
      completedAt: r.completedAt,
      postmortems: r._count.postmortems,
      recent: r.postmortems,
    }),
  );
  const categories = [
    ...new Set([...CHAOS_CATEGORIES, ...rows.map((r) => r.category).filter((c) => c !== null)]),
  ].filter((c) => rows.some((r) => r.category === c));
  const allCategories = [...new Set([...CHAOS_CATEGORIES, ...categories])];

  const difficulty = Number(sp.difficulty) || 0;
  const shown = experiments.filter(
    (e) =>
      e.id === sp.show ||
      ((!sp.category || e.category === sp.category) &&
        (!difficulty || e.difficulty === difficulty) &&
        (sp.status === "done" ? !!e.completedAt : sp.status === "all" || !e.completedAt)),
  );
  const doneCount = experiments.filter((e) => e.completedAt).length;
  const justDone = sp.done ? experiments.find((e) => e.id === sp.done) : undefined;

  return (
    <>
      <PageHeader
        title="Chaos Lab"
        description={`Break things on purpose, then debug them. ${doneCount} of ${experiments.length} done.`}
        actions={
          <ExperimentFormDialog categories={allCategories}>
            <Button variant="outline">
              <Plus aria-hidden /> New experiment
            </Button>
          </ExperimentFormDialog>
        }
      />
      {justDone && <DonePrompt experiment={justDone} />}
      {experiments.length > 0 && <ChaosPicker experiments={experiments} categories={categories} />}
      {experiments.length > 0 && <ChaosFilters categories={categories} />}
      {shown.length ? (
        <ul className="divide-y rounded-xl border">
          {shown.map((e) => (
            <li key={e.id} id={`exp-${e.id}`}>
              <details className="group" open={sp.show === e.id}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-4 hover:bg-accent/40 [&::-webkit-details-marker]:hidden">
                  {e.completedAt ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Done" />
                  ) : (
                    <Circle
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-label="Not done"
                    />
                  )}
                  <span className={cn("font-medium", e.completedAt && "text-muted-foreground")}>
                    {e.title}
                  </span>
                  {e.category && <Badge variant="outline">{e.category}</Badge>}
                  <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                    {e.postmortems > 0 && (
                      <span>
                        {e.postmortems} postmortem{e.postmortems === 1 ? "" : "s"}
                      </span>
                    )}
                    {e.completedAt && <span>done {fmtDate(e.completedAt)}</span>}
                    <DifficultyDots value={e.difficulty} />
                  </span>
                </summary>
                <div className="space-y-3 px-4 pb-4 pl-11 text-sm">
                  {e.description ? (
                    <Markdown>{e.description}</Markdown>
                  ) : (
                    <p className="text-muted-foreground">No instructions written.</p>
                  )}
                  {e.hypothesis && (
                    <p>
                      <span className="font-medium">Hypothesis:</span>{" "}
                      <span className="text-muted-foreground">{e.hypothesis}</span>
                    </p>
                  )}
                  {e.recent.length > 0 && (
                    <ul className="space-y-1">
                      {e.recent.map((p) => (
                        <li key={p.id}>
                          <Link href={`/postmortems/${p.id}`} className="hover:underline">
                            Postmortem: {p.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <ExperimentActions experiment={e} categories={allCategories} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : experiments.length ? (
        <EmptyState icon={<FlaskConical />} title="Nothing here">
          {sp.status === "done"
            ? "No experiments done with these filters yet."
            : "Every experiment matching these filters is done. Show all, or add a new one."}
        </EmptyState>
      ) : (
        <EmptyState
          icon={<FlaskConical />}
          title="No experiments"
          action={
            <ExperimentFormDialog categories={allCategories}>
              <Button>Add an experiment</Button>
            </ExperimentFormDialog>
          }
        >
          Chaos experiments are things you break on purpose to learn how systems fail.
        </EmptyState>
      )}
    </>
  );
}
