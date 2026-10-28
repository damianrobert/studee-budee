import { db } from "./db";

/** A topic implies its project; a mismatching pair is rejected (returns null). */
export async function resolveLinks(projectId: string | null, topicId: string | null) {
  if (!topicId) return { projectId, topicId };
  const topic = await db.topic.findUnique({ where: { id: topicId }, select: { projectId: true } });
  if (!topic || (projectId && topic.projectId !== projectId)) return null;
  return { projectId: topic.projectId, topicId };
}
