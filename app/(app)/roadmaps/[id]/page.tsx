import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Hammer } from "lucide-react";
import { aiEnabled } from "@/lib/ai/config";
import { webSearchEnabled } from "@/lib/ai/research";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtRelativeDays } from "@/lib/format";
import { RESOURCE_KIND_LABEL, progress } from "@/lib/roadmaps";
import { sourceFromUrl } from "@/lib/reading";
import { RoadmapActions } from "@/components/roadmaps/roadmap-actions";
import { KindIcon } from "@/components/roadmaps/kind-icon";
import { RoadmapMap, StageOverview, type MapStage } from "@/components/roadmaps/roadmap-map";
import { RoadmapPrompt } from "@/components/roadmaps/roadmap-prompt";
import {
  AddResourceForm,
  DeleteStepButton,
  ResourceActions,
  StepDrawer,
  StepStatusControl,
} from "@/components/roadmaps/step-drawer";
import { StepPrompt } from "@/components/roadmaps/step-prompt";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const r = await db.roadmap.findUnique({
    where: { id: (await params).id },
    select: { title: true },
  });
  return { title: r?.title ?? "Roadmap" };
}

export default async function RoadmapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const roadmap = await db.roadmap.findUnique({
    where: { id },
    include: {
      stages: {
        orderBy: { position: "asc" },
        include: {
          steps: {
            orderBy: { position: "asc" },
            include: { resources: { orderBy: { position: "asc" }, select: { kind: true } } },
          },
        },
      },
      edits: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!roadmap) notFound();
  const ai = aiEnabled();
  const webSearch = webSearchEnabled();

  const stages: MapStage[] = roadmap.stages.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    steps: s.steps.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      practice: t.practice,
      status: t.status,
      kinds: [...new Set(t.resources.map((r) => r.kind))],
      resourceCount: t.resources.length,
    })),
  }));
  const p = progress(stages.flatMap((s) => s.steps));

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <Link
          href="/roadmaps"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" /> Roadmaps
        </Link>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{roadmap.title}</h1>
            <RoadmapActions roadmap={{ id: roadmap.id, title: roadmap.title }} />
          </div>
          {roadmap.summary && <p className="max-w-prose text-sm">{roadmap.summary}</p>}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span>
              {p.done} of {p.total} steps done ({p.percent}%)
            </span>
            {p.doing > 0 && <span>{p.doing} in progress</span>}
            <span>created {fmtDate(roadmap.createdAt)}</span>
            <span>updated {fmtRelativeDays(roadmap.updatedAt)}</span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Steps done"
          aria-valuenow={p.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 max-w-xl overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-success" style={{ width: `${p.percent}%` }} />
        </div>
        <StageOverview stages={stages} />
      </header>

      {ai && (
        <section className="rounded-xl border p-4">
          <RoadmapPrompt
            roadmapId={roadmap.id}
            stages={stages.map((s) => ({ id: s.id, title: s.title }))}
            webSearch={webSearch}
          />
        </section>
      )}

      <RoadmapMap stages={stages} selectedStepId={sp.step} />

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-sm font-semibold">History</h2>
        <ol className="space-y-3 text-sm">
          {roadmap.edits.map((e) => (
            <li key={e.id} className="space-y-0.5">
              <p>
                <span className="text-muted-foreground">
                  {e.scope ? `On “${e.scope}”: ` : "You asked: "}
                </span>
                {e.instruction}
              </p>
              <p className="text-xs text-muted-foreground">
                {e.summary} · {fmtDateTime(e.createdAt)}
              </p>
            </li>
          ))}
          <li className="space-y-0.5">
            <p>
              <span className="text-muted-foreground">Created from: </span>
              {roadmap.prompt}
            </p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(roadmap.createdAt)}</p>
          </li>
        </ol>
      </section>

      {sp.step && (
        <StepDetail stepId={sp.step} roadmapId={roadmap.id} ai={ai} webSearch={webSearch} />
      )}
    </div>
  );
}

async function StepDetail({
  stepId,
  roadmapId,
  ai,
  webSearch,
}: {
  stepId: string;
  roadmapId: string;
  ai: boolean;
  webSearch: boolean;
}) {
  const step = await db.roadmapStep.findFirst({
    where: { id: stepId, stage: { roadmapId } },
    include: {
      stage: { select: { title: true, position: true } },
      resources: { orderBy: { position: "asc" } },
    },
  });
  if (!step) return null;
  const stageNo =
    (await db.roadmapStage.count({
      where: { roadmapId, position: { lt: step.stage.position } },
    })) + 1;

  return (
    <StepDrawer title={step.title}>
      <div className="space-y-6">
        <div className="space-y-2 pr-6">
          <p className="text-xs text-muted-foreground">
            Stage {stageNo} · {step.stage.title}
          </p>
          <h2 className="text-xl leading-snug font-semibold">{step.title}</h2>
          <StepStatusControl key={step.id} stepId={step.id} status={step.status} />
        </div>

        {step.description && <p className="text-sm">{step.description}</p>}

        {step.practice && (
          <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Hammer aria-hidden className="size-4" /> Practice
            </h3>
            <p className="text-sm">{step.practice}</p>
          </div>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            Resources{" "}
            <span className="font-normal text-muted-foreground tabular-nums">
              {step.resources.length}
            </span>
          </h3>
          {step.resources.length ? (
            <ul className="divide-y rounded-lg border">
              {step.resources.map((r) => (
                <li key={r.id} className="flex gap-3 p-3">
                  <KindIcon
                    kind={r.kind}
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-sm font-medium break-words hover:underline"
                    >
                      {r.title}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {RESOURCE_KIND_LABEL[r.kind]} · {sourceFromUrl(r.url) ?? r.url}
                      {r.origin === "AI" && " · suggested by AI, not checked"}
                    </p>
                    {r.note && <p className="text-sm text-muted-foreground">{r.note}</p>}
                  </div>
                  <ResourceActions resource={{ id: r.id, url: r.url }} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No resources yet{ai ? " — ask the AI below to find some." : "."}
            </p>
          )}
          <AddResourceForm key={step.id} stepId={step.id} />
        </section>

        {ai && (
          <section className="border-t pt-4">
            <StepPrompt key={step.id} stepId={step.id} webSearch={webSearch} />
          </section>
        )}

        <div className="border-t pt-4">
          <DeleteStepButton stepId={step.id} title={step.title} />
        </div>
      </div>
    </StepDrawer>
  );
}
