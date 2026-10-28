import Link from "next/link";
import { notFound } from "next/navigation";
import type { LoopStage } from "@prisma/client";
import { ExternalLink, Pencil, Sparkles } from "lucide-react";
import { aiEnabled } from "@/lib/ai/config";
import { mentorFacts } from "@/lib/ai/context";
import { mentorContextBlock } from "@/lib/ai/prompts";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtRelativeDays } from "@/lib/format";
import { STAGE_INFO } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { Mentor } from "@/components/ai/mentor";
import { QuizButton } from "@/components/ai/quiz";
import { Badge } from "@/components/ui/badge";
import { ParamDrawer } from "@/components/ui/param-drawer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Board, type BoardTopic } from "@/components/projects/board";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectStatusActions } from "@/components/projects/project-status-actions";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { ExplainItBadge } from "@/components/notes/note-type-badge";
import { StageBar } from "@/components/projects/stage-bar";
import { TopicDrawer, TopicEditor } from "@/components/projects/topic-drawer";
import { QuickStartButton } from "@/components/sessions/quick-start-button";
import { SessionList } from "@/components/sessions/session-list";

const TABS = [
  { id: "notes", label: "Notes" },
  { id: "postmortems", label: "Postmortems" },
  { id: "files", label: "Files" },
  { id: "sessions", label: "Sessions" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const sessionSelect = {
  id: true,
  startedAt: true,
  endedAt: true,
  durationMin: true,
  stage: true,
  summary: true,
  producedOutput: true,
  outputLink: true,
  nextStep: true,
  project: { select: { id: true, name: true } },
  topic: { select: { id: true, title: true } },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await db.project.findUnique({
    where: { id: (await params).id },
    select: { name: true },
  });
  return { title: p?.name ?? "Project" };
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ topic?: string; tab?: string; mentor?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "notes";

  const [project, currentActive, sessionStats] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        topics: {
          orderBy: [{ stage: "asc" }, { position: "asc" }],
          include: {
            _count: { select: { notes: true, postmortems: true } },
            notes: { where: { type: "EXPLAIN_IT" }, select: { id: true } },
          },
        },
      },
    }),
    db.project.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    db.session.aggregate({ where: { projectId: id }, _count: true, _max: { startedAt: true } }),
  ]);
  if (!project) notFound();
  const ai = aiEnabled();

  const topics: BoardTopic[] = project.topics.map((t) => ({
    id: t.id,
    title: t.title,
    stage: t.stage,
    notes: t._count.notes,
    postmortems: t._count.postmortems,
    explainNotes: t.notes.length,
  }));
  const counts: Partial<Record<LoopStage, number>> = {};
  for (const t of topics) counts[t.stage] = (counts[t.stage] ?? 0) + 1;
  const lastActivity = sessionStats._max.startedAt;

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
              <ProjectFormDialog project={project}>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Edit project">
                  <Pencil />
                </Button>
              </ProjectFormDialog>
            </div>
            {project.goal && (
              <p className="text-sm">
                <span className="text-muted-foreground">Goal:</span> {project.goal}
              </p>
            )}
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {sessionStats._count} session{sessionStats._count === 1 ? "" : "s"}
              </span>
              <span>Last activity {lastActivity ? fmtRelativeDays(lastActivity) : "—"}</span>
              {project.repoUrl && (
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="size-3" aria-hidden /> Repository
                </a>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QuickStartButton size="sm" projectId={project.id} topicId={null} />
            {ai && (
              <Button asChild variant="outline" size="sm">
                <Link href={`?${mentorQuery(sp)}`} scroll={false}>
                  <Sparkles aria-hidden /> Mentor
                </Link>
              </Button>
            )}
            {ai && <QuizButton scope={{ projectId: project.id }} title={project.name} />}
            <ProjectStatusActions project={project} currentActive={currentActive} />
          </div>
        </div>
        {project.description && (
          <p className="max-w-3xl text-sm whitespace-pre-wrap text-muted-foreground">
            {project.description}
          </p>
        )}
        <div className="max-w-xl">
          <StageBar counts={counts} showLegend={false} />
        </div>
      </header>

      <Board projectId={project.id} topics={topics} tab={sp.tab} />

      <section>
        <nav aria-label="Project content" className="mb-4 flex gap-1 border-b">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`?tab=${t.id}`}
              scroll={false}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                tab === t.id
                  ? "border-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <ProjectTab tab={tab} projectId={project.id} />
      </section>

      {sp.topic && <TopicDetail topicId={sp.topic} projectId={project.id} ai={ai} />}
      {ai && sp.mentor && !sp.topic && <MentorDetail projectId={project.id} />}
    </div>
  );
}

/** Opens the mentor drawer, keeping the tab. */
function mentorQuery(sp: { tab?: string }): string {
  const q = new URLSearchParams({ mentor: "1" });
  if (sp.tab) q.set("tab", sp.tab);
  return q.toString();
}

async function MentorDetail({ projectId }: { projectId: string }) {
  const [facts, messages] = await Promise.all([
    mentorFacts(projectId),
    db.mentorMessage.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, role: true, content: true, solution: true },
    }),
  ]);
  if (!facts) return null;
  return (
    <ParamDrawer param="mentor" title="Mentor" className="max-w-2xl overflow-hidden">
      <Mentor
        projectId={projectId}
        messages={messages}
        memory={facts.memory}
        memoryUpdated={facts.memoryAt ? fmtDateTime(facts.memoryAt) : null}
        context={mentorContextBlock(facts)}
      />
    </ParamDrawer>
  );
}

async function ProjectTab({ tab, projectId }: { tab: Tab; projectId: string }) {
  const linked = { OR: [{ projectId }, { topic: { projectId } }] };
  if (tab === "notes") {
    const notes = await db.note.findMany({
      where: linked,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        type: true,
        updatedAt: true,
        topic: { select: { title: true } },
      },
    });
    if (!notes.length)
      return (
        <EmptyState
          title="No notes yet"
          action={
            <Button asChild size="sm">
              <Link href={`/notes/new?projectId=${projectId}`}>New note</Link>
            </Button>
          }
        >
          Notes linked to this project or its topics show up here.
        </EmptyState>
      );
    return (
      <ul className="divide-y rounded-xl border">
        {notes.map((n) => (
          <li key={n.id}>
            <Link
              href={`/notes/${n.id}`}
              className="flex flex-wrap items-center gap-2 p-3 text-sm hover:bg-accent/40"
            >
              <span className="font-medium">{n.title}</span>
              {n.type === "EXPLAIN_IT" && <ExplainItBadge />}
              {n.topic && <span className="text-muted-foreground">{n.topic.title}</span>}
              <span className="ml-auto text-xs text-muted-foreground">{fmtDate(n.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  if (tab === "postmortems") {
    const pms = await db.postmortem.findMany({
      where: linked,
      orderBy: { occurredAt: "desc" },
      select: { id: true, title: true, occurredAt: true, wasDeliberate: true },
    });
    if (!pms.length)
      return (
        <EmptyState
          title="No postmortems yet"
          action={
            <Button asChild size="sm">
              <Link href={`/postmortems/new?projectId=${projectId}`}>Write a postmortem</Link>
            </Button>
          }
        >
          Failure is the curriculum. Break something in this project and write down what happened.
        </EmptyState>
      );
    return (
      <ul className="divide-y rounded-xl border">
        {pms.map((p) => (
          <li key={p.id}>
            <Link
              href={`/postmortems/${p.id}`}
              className="flex flex-wrap items-center gap-2 p-3 text-sm hover:bg-accent/40"
            >
              <span className="font-medium">{p.title}</span>
              <Badge variant={p.wasDeliberate ? "warning" : "destructive"}>
                {p.wasDeliberate ? "Chaos" : "Real"}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">{fmtDate(p.occurredAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  if (tab === "files") {
    const files = await db.fileAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, originalName: true, sizeBytes: true, createdAt: true },
    });
    if (!files.length)
      return (
        <EmptyState
          title="No files yet"
          action={
            <Button asChild size="sm">
              <Link href={`/files?project=${projectId}`}>Go to Files</Link>
            </Button>
          }
        >
          Screenshots, logs and diagrams for this project.
        </EmptyState>
      );
    return (
      <ul className="divide-y rounded-xl border">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-2 p-3 text-sm">
            <Link href={`/files/${f.id}`} className="font-medium hover:underline">
              {f.originalName}
            </Link>
            <span className="ml-auto text-xs text-muted-foreground">{fmtDate(f.createdAt)}</span>
          </li>
        ))}
      </ul>
    );
  }
  const sessions = await db.session.findMany({
    where: { projectId },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: sessionSelect,
  });
  if (!sessions.length)
    return (
      <EmptyState
        title="No sessions yet"
        action={<QuickStartButton size="sm" projectId={projectId} topicId={null} />}
      >
        Small daily sessions beat long binges. Ten minutes counts.
      </EmptyState>
    );
  return (
    <div className="space-y-2">
      <SessionList sessions={sessions} showProject={false} />
      <Link
        href={`/sessions?project=${projectId}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        All sessions for this project →
      </Link>
    </div>
  );
}

async function TopicDetail({
  topicId,
  projectId,
  ai,
}: {
  topicId: string;
  projectId: string;
  ai: boolean;
}) {
  const topic = await db.topic.findFirst({
    where: { id: topicId, projectId },
    include: {
      stageHistory: { orderBy: { changedAt: "desc" } },
      sessions: { orderBy: { startedAt: "desc" }, take: 20, select: sessionSelect },
      notes: { orderBy: { updatedAt: "desc" }, select: { id: true, title: true, type: true } },
      postmortems: {
        orderBy: { occurredAt: "desc" },
        select: { id: true, title: true, wasDeliberate: true },
      },
    },
  });
  if (!topic) return null;

  return (
    <TopicDrawer title={topic.title}>
      <div className="space-y-6 pt-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full", STAGE_INFO[topic.stage].color)}
          />
          <span className="text-sm font-medium">{STAGE_INFO[topic.stage].label}</span>
          <span className="text-xs text-muted-foreground">
            · created {fmtDate(topic.createdAt)}
          </span>
        </div>
        <div className="flex gap-2">
          <QuickStartButton className="flex-1" projectId={projectId} topicId={topic.id}>
            Start session on this topic
          </QuickStartButton>
          {ai && <QuizButton scope={{ topicId: topic.id }} title={topic.title} className="h-9" />}
          {ai && (
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href="?mentor=1" scroll={false}>
                <Sparkles aria-hidden /> Mentor
              </Link>
            </Button>
          )}
        </div>
        <TopicEditor topic={topic} projectId={projectId} />

        <DrawerSection title="Stage history">
          {topic.stageHistory.length ? (
            <ol className="space-y-2 border-l pl-4 text-sm">
              {topic.stageHistory.map((h) => (
                <li key={h.id} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1.5 -left-[21px] size-2 rounded-full",
                      STAGE_INFO[h.to].color,
                    )}
                  />
                  {STAGE_INFO[h.from].label} →{" "}
                  <span className="font-medium">{STAGE_INFO[h.to].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {fmtDateTime(h.changedAt)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Not moved yet.</p>
          )}
        </DrawerSection>

        <DrawerSection
          title="Notes"
          action={
            <Link
              className="text-xs hover:underline"
              href={`/notes/new?projectId=${projectId}&topicId=${topic.id}`}
            >
              + Note
            </Link>
          }
        >
          {topic.notes.length ? (
            <ul className="space-y-1 text-sm">
              {topic.notes.map((n) => (
                <li key={n.id} className="flex items-center gap-2">
                  <Link href={`/notes/${n.id}`} className="hover:underline">
                    {n.title}
                  </Link>
                  {n.type === "EXPLAIN_IT" && <ExplainItBadge />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No notes linked.</p>
          )}
        </DrawerSection>

        <DrawerSection
          title="Postmortems"
          action={
            <Link
              className="text-xs hover:underline"
              href={`/postmortems/new?projectId=${projectId}&topicId=${topic.id}`}
            >
              + Postmortem
            </Link>
          }
        >
          {topic.postmortems.length ? (
            <ul className="space-y-1 text-sm">
              {topic.postmortems.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <Link href={`/postmortems/${p.id}`} className="hover:underline">
                    {p.title}
                  </Link>
                  <Badge variant={p.wasDeliberate ? "warning" : "destructive"}>
                    {p.wasDeliberate ? "Chaos" : "Real"}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing broken yet.</p>
          )}
        </DrawerSection>

        <DrawerSection title="Sessions">
          {topic.sessions.length ? (
            <SessionList sessions={topic.sessions} showProject={false} />
          ) : (
            <p className="text-sm text-muted-foreground">No sessions on this topic yet.</p>
          )}
        </DrawerSection>
      </div>
    </TopicDrawer>
  );
}

function DrawerSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
