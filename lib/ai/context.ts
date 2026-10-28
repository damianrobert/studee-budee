import { db } from "@/lib/db";
import { appTz, dayKey } from "@/lib/time";
import { UserError } from "@/lib/utils";
import { HISTORY_MESSAGES, trimHistory, type MentorFacts } from "./mentor";
import type { NoteForPrompt, PromptContext } from "./prompts";
import { STUCK_TAG } from "./stuck";

export type QuizScope = { topicId: string } | { projectId: string };

/**
 * The notes a quiz is built from: a topic's notes, or everything linked to a project and its
 * topics. Explain-it notes are put first by the prompt; newest first otherwise.
 */
export async function quizMaterial(
  scope: QuizScope,
): Promise<{ notes: NoteForPrompt[]; ctx: PromptContext }> {
  let ctx: PromptContext;
  let where;
  if ("topicId" in scope) {
    const topic = await db.topic.findUnique({
      where: { id: scope.topicId },
      select: { title: true, description: true, project: { select: { name: true } } },
    });
    if (!topic) throw new UserError("This topic was deleted.", 404);
    ctx = { project: topic.project.name, topic: topic.title, topicDescription: topic.description };
    where = { topicId: scope.topicId };
  } else {
    const project = await db.project.findUnique({
      where: { id: scope.projectId },
      select: { name: true },
    });
    if (!project) throw new UserError("This project was deleted.", 404);
    ctx = { project: project.name };
    where = { OR: [{ projectId: scope.projectId }, { topic: { projectId: scope.projectId } }] };
  }
  const notes = (
    await db.note.findMany({
      where: { ...where, NOT: { tags: { some: { name: STUCK_TAG } } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, type: true, content: true },
    })
  ).filter((n) => n.content.trim().length >= 40);
  if (!notes.length)
    throw new UserError(
      "There's nothing to quiz you on yet. The quiz is built from your own notes: write a note or an explain-it note for this first.",
    );
  return { notes, ctx };
}

/** Project and topic of a note, for the prompt. */
export async function noteContext(note: {
  projectId: string | null;
  topicId: string | null;
}): Promise<PromptContext> {
  const [project, topic] = await Promise.all([
    note.projectId
      ? db.project.findUnique({ where: { id: note.projectId }, select: { name: true } })
      : null,
    note.topicId
      ? db.topic.findUnique({
          where: { id: note.topicId },
          select: { title: true, description: true },
        })
      : null,
  ]);
  return { project: project?.name, topic: topic?.title, topicDescription: topic?.description };
}

/** What the mentor knows about a project; null when it was deleted. */
export async function mentorFacts(projectId: string): Promise<MentorFacts | null> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      status: true,
      goal: true,
      description: true,
      repoUrl: true,
      mentorMemory: true,
      mentorMemoryAt: true,
      topics: {
        orderBy: [{ stage: "asc" }, { position: "asc" }],
        select: {
          title: true,
          description: true,
          stage: true,
          _count: { select: { notes: true, postmortems: true } },
        },
      },
    },
  });
  if (!p) return null;
  const linked = { OR: [{ projectId }, { topic: { projectId } }] };
  const [sessions, notes, postmortems] = await Promise.all([
    db.session.findMany({
      where: { projectId, endedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        startedAt: true,
        durationMin: true,
        stage: true,
        summary: true,
        nextStep: true,
        producedOutput: true,
        topic: { select: { title: true } },
      },
    }),
    db.note.findMany({
      where: linked,
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { title: true, type: true, content: true, topic: { select: { title: true } } },
    }),
    db.postmortem.findMany({
      where: linked,
      orderBy: { occurredAt: "desc" },
      take: 10,
      select: {
        title: true,
        wasDeliberate: true,
        rootCause: true,
        lessons: true,
        topic: { select: { title: true } },
      },
    }),
  ]);
  const tz = appTz();
  return {
    name: p.name,
    status: p.status,
    goal: p.goal,
    description: p.description,
    repoUrl: p.repoUrl,
    memory: p.mentorMemory,
    memoryAt: p.mentorMemoryAt,
    topics: p.topics.map((t) => ({
      title: t.title,
      description: t.description,
      stage: t.stage,
      notes: t._count.notes,
      postmortems: t._count.postmortems,
    })),
    sessions: sessions.map((s) => ({
      day: dayKey(s.startedAt, tz),
      durationMin: s.durationMin,
      stage: s.stage,
      topic: s.topic?.title ?? null,
      summary: s.summary,
      nextStep: s.nextStep,
      producedOutput: s.producedOutput,
    })),
    notes: notes.map((n) => ({
      title: n.title,
      explainIt: n.type === "EXPLAIN_IT",
      topic: n.topic?.title ?? null,
      excerpt: n.content.slice(0, 400),
    })),
    postmortems: postmortems.map((pm) => ({
      title: pm.title,
      deliberate: pm.wasDeliberate,
      topic: pm.topic?.title ?? null,
      rootCause: pm.rootCause,
      lessons: pm.lessons,
    })),
  };
}

/** The latest messages of a project's conversation that fit the prompt, oldest first. */
export async function mentorHistory(projectId: string) {
  const newestFirst = await db.mentorMessage.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_MESSAGES,
    select: { role: true, content: true, solution: true },
  });
  return trimHistory(newestFirst);
}
