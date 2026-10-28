"use client";

import * as React from "react";
import Link from "next/link";
import type { LoopStage } from "@prisma/client";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, GripVertical, Siren } from "lucide-react";
import { moveTopic } from "@/lib/actions/projects";
import { checkStageMove } from "@/lib/board";
import { STAGES, STAGE_INFO } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { BreakFirstHint, DoneGateDialog } from "./gate-dialogs";
import { NewTopicForm } from "./new-topic-form";

export type BoardTopic = {
  id: string;
  title: string;
  stage: LoopStage;
  explainNotes: number;
  postmortems: number;
  notes: number;
};

type Columns = Record<LoopStage, BoardTopic[]>;

// Prefer whatever is under the pointer (a card over its column); fall back to
// corners for keyboard dragging, which has no pointer.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length)
    return [hits.find((h) => !(STAGES as string[]).includes(String(h.id))) ?? hits[0]!];
  return closestCorners(args);
};

function group(topics: BoardTopic[]): Columns {
  const cols = Object.fromEntries(STAGES.map((s) => [s, [] as BoardTopic[]])) as Columns;
  for (const t of topics) cols[t.stage].push(t);
  return cols;
}

export function Board({
  projectId,
  topics,
  tab,
}: {
  projectId: string;
  topics: BoardTopic[];
  tab?: string;
}) {
  const [columns, setColumns] = React.useState(() => group(topics));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [gate, setGate] = React.useState<BoardTopic | null>(null);
  const [hint, setHint] = React.useState<BoardTopic | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const snapshot = React.useRef(columns);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => setColumns(group(topics)), [topics]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findStage = (id: string, cols = columns): LoopStage | null =>
    (STAGES as string[]).includes(id)
      ? (id as LoopStage)
      : (STAGES.find((s) => cols[s].some((t) => t.id === id)) ?? null);

  const original = (id: string) =>
    STAGES.flatMap((s) => snapshot.current[s]).find((t) => t.id === id);
  const active = activeId ? STAGES.flatMap((s) => columns[s]).find((t) => t.id === activeId) : null;

  function onDragStart(e: DragStartEvent) {
    snapshot.current = columns;
    setActiveId(String(e.active.id));
    setError(null);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findStage(String(active.id));
    const to = findStage(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const item = cols[from].find((t) => t.id === active.id);
      if (!item) return cols;
      const overIndex = cols[to].findIndex((t) => t.id === over.id);
      const index = overIndex < 0 ? cols[to].length : overIndex;
      const target = [...cols[to]];
      target.splice(index, 0, item);
      return { ...cols, [from]: cols[from].filter((t) => t.id !== active.id), [to]: target };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const id = String(active.id);
    const orig = original(id);
    const stage = findStage(id);
    if (!over || !orig || !stage) return setColumns(snapshot.current);

    let col = columns[stage];
    const oldIndex = col.findIndex((t) => t.id === id);
    const overIndex = col.findIndex((t) => t.id === over.id);
    if (overIndex >= 0 && overIndex !== oldIndex) col = arrayMove(col, oldIndex, overIndex);
    const index = col.findIndex((t) => t.id === id);
    const before = snapshot.current[orig.stage].findIndex((t) => t.id === id);
    if (stage === orig.stage && index === before) return setColumns(snapshot.current);

    const check = checkStageMove(orig.stage, stage, orig);
    if (!check.allowed) {
      setColumns(snapshot.current);
      setGate(orig);
      return;
    }

    const moved = { ...orig, stage };
    const next = { ...columns, [stage]: col.map((t) => (t.id === id ? moved : t)) };
    setColumns(next);
    const rollback = snapshot.current;
    startTransition(async () => {
      const res = await moveTopic(id, stage, index);
      if (!res.ok) {
        setColumns(rollback);
        if (res.code === "NEEDS_EXPLAIN_NOTE") setGate(orig);
        else setError(res.error);
      } else if (res.data?.hint === "BREAK_FIRST") {
        setHint(orig);
      }
    });
  }

  return (
    <div className="space-y-3">
      {hint && (
        <BreakFirstHint topic={hint} projectId={projectId} onDismiss={() => setHint(null)} />
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setColumns(snapshot.current);
        }}
      >
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {STAGES.map((stage) => (
            <Column key={stage} stage={stage} topics={columns[stage]} tab={tab}>
              {stage === "PAIN" && <NewTopicForm projectId={projectId} />}
            </Column>
          ))}
        </div>
        <DragOverlay>{active ? <TopicCardBody topic={active} dragging /> : null}</DragOverlay>
      </DndContext>
      <DoneGateDialog topic={gate} projectId={projectId} onClose={() => setGate(null)} />
    </div>
  );
}

function Column({
  stage,
  topics,
  tab,
  children,
}: {
  stage: LoopStage;
  topics: BoardTopic[];
  tab?: string;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const info = STAGE_INFO[stage];
  return (
    <section
      ref={setNodeRef}
      aria-label={`${info.label} column`}
      className={cn(
        "flex w-64 shrink-0 snap-start flex-col rounded-xl bg-muted/50 p-2 transition-colors lg:w-auto",
        isOver && "bg-accent",
      )}
    >
      <header className="px-2 pt-1 pb-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn("size-2 rounded-full", info.color)} />
          <h3 className="text-sm font-semibold">{info.label}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{topics.length}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{info.description}</p>
      </header>
      <SortableContext items={topics.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-0.5">
          {topics.map((t) => (
            <SortableTopic key={t.id} topic={t} tab={tab} />
          ))}
        </ul>
      </SortableContext>
      {children}
    </section>
  );
}

function SortableTopic({ topic, tab }: { topic: BoardTopic; tab?: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: topic.id,
  });
  const href = `?topic=${topic.id}${tab ? `&tab=${tab}` : ""}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
    >
      <TopicCardBody topic={topic} href={href}>
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Move ${topic.title}`}
          className="-ml-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      </TopicCardBody>
    </li>
  );
}

function TopicCardBody({
  topic,
  href,
  dragging,
  children,
}: {
  topic: BoardTopic;
  href?: string;
  dragging?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-1.5 rounded-lg border bg-card p-2.5 text-sm shadow-xs",
        dragging && "shadow-lg",
      )}
    >
      {children ?? <GripVertical className="-ml-1 size-4 text-muted-foreground" aria-hidden />}
      <div className="min-w-0 flex-1 space-y-1.5">
        {href ? (
          <Link
            href={href}
            scroll={false}
            className="block font-medium break-words hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {topic.title}
          </Link>
        ) : (
          <span className="block font-medium break-words">{topic.title}</span>
        )}
        {(topic.notes > 0 || topic.postmortems > 0) && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            {topic.notes > 0 && (
              <span className="flex items-center gap-1" title="Notes (explain-it)">
                <FileText className="size-3" aria-hidden />
                {topic.notes}
                {topic.explainNotes > 0 && ` (${topic.explainNotes})`}
              </span>
            )}
            {topic.postmortems > 0 && (
              <span className="flex items-center gap-1" title="Postmortems">
                <Siren className="size-3" aria-hidden />
                {topic.postmortems}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
