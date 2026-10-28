"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CourseBuild, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { COURSE_SCHEMA, parseCoursePlan } from "@/lib/ai/course";
import { generateJson } from "@/lib/ai/gemini";
import { COURSE_SYSTEM, coursePrompt } from "@/lib/ai/prompts";
import { runAi } from "@/lib/ai/run";
import {
  SOURCE_MAX,
  moduleRows,
  parseResourcesFile,
  planByTopic,
  practiceKey,
  unusedKeys,
  type CoursePlan,
  type Library,
  type Progress,
} from "@/lib/courses";
import { UserError, emptyToNull, type ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);

const buildInput = z.object({
  source: z.string().max(SOURCE_MAX, "The file is too big."),
  build: z.enum(["AI", "TOPICS"]),
  weeklyMinutes: z.coerce.number().int().min(30).max(3000).default(300),
  focus: z.string().max(1000).nullish(),
});
export type BuildInput = z.input<typeof buildInput>;

function refresh(courseId?: string) {
  revalidatePath("/courses");
  if (courseId) revalidatePath(`/courses/${courseId}`);
  revalidatePath("/");
}

function parseBuild(input: unknown) {
  const parsed = buildInput.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Invalid input");
  const file = parseResourcesFile(parsed.data.source);
  if (!file.ok) throw new UserError(`The resources file has problems: ${file.errors[0]}`);
  return { ...parsed.data, focus: emptyToNull(parsed.data.focus), library: file.library };
}

/** Arranges the library into a course: by Gemini, or grouped by topic without AI. */
async function plan(
  library: Library,
  build: CourseBuild,
  weeklyMinutes: number,
  focus: string | null,
): Promise<CoursePlan> {
  if (build === "TOPICS") return planByTopic(library);
  const plan = parseCoursePlan(
    await generateJson({
      system: COURSE_SYSTEM,
      prompt: coursePrompt(library, { weeklyMinutes, focus }),
      schema: COURSE_SCHEMA,
      maxOutputTokens: 32_768,
      // Arranging the whole course is worth the extra seconds.
      thinking: "high",
    }),
    library,
  );
  if (!plan) throw new UserError("The course came back garbled. Try again.");
  return plan;
}

function courseFields(
  p: CoursePlan,
  library: Library,
  input: { source: string; build: CourseBuild; weeklyMinutes: number; focus: string | null },
) {
  const titles = new Map(library.resources.map((r) => [r.key, r.title]));
  return {
    title: p.title,
    description: p.description,
    level: p.level,
    outcomes: p.outcomes,
    subject: library.subject,
    source: input.source,
    build: input.build,
    weeklyMinutes: input.build === "AI" ? input.weeklyMinutes : null,
    focus: input.build === "AI" ? input.focus : null,
    gaps: p.gaps,
    unused: unusedKeys(library, p).map((k) => titles.get(k) ?? k),
  };
}

function nestedCreate(rows: ReturnType<typeof moduleRows>) {
  return rows.map(({ items, practice, checkpoints, ...m }) => ({
    ...m,
    items: { create: items },
    practice: { create: practice },
    checkpoints: { create: checkpoints },
  })) satisfies Prisma.CourseModuleCreateWithoutCourseInput[];
}

/** AI builds go through runAi (off without a key, friendly errors); the free build doesn't need it. */
async function run<T>(build: unknown, fn: () => Promise<T>): Promise<ActionResult<T>> {
  if (build === "AI") return runAi(fn);
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("[courses]", e);
    return { ok: false, error: "Something went wrong building the course. Try again." };
  }
}

/** Builds a course from a resources file and saves it. */
export async function createCourse(input: BuildInput) {
  return run<string>(input?.build, async () => {
    const b = parseBuild(input);
    const p = await plan(b.library, b.build, b.weeklyMinutes, b.focus);
    const course = await db.course.create({
      data: {
        ...courseFields(p, b.library, b),
        modules: { create: nestedCreate(moduleRows(p, b.library)) },
      },
    });
    refresh();
    return course.id;
  });
}

/**
 * Builds the course again, from an updated file or with other options. Items keep their
 * "done" by resource id and practice tasks by their text, so progress survives.
 */
export async function rebuildCourse(courseId: string, input: BuildInput) {
  return run<string>(input?.build, async () => {
    if (!id.safeParse(courseId).success) throw new UserError("Invalid input");
    const b = parseBuild(input);
    const before = await db.course.findUnique({
      where: { id: courseId },
      select: {
        modules: {
          select: {
            items: { select: { resourceKey: true, doneAt: true } },
            practice: { select: { task: true, doneAt: true } },
          },
        },
      },
    });
    if (!before) throw new UserError("This course was deleted.");
    const progress: Progress = { items: new Map(), practice: new Map() };
    for (const m of before.modules) {
      for (const i of m.items) if (i.doneAt) progress.items.set(i.resourceKey, i.doneAt);
      for (const t of m.practice)
        if (t.doneAt) progress.practice.set(practiceKey(t.task), t.doneAt);
    }

    const p = await plan(b.library, b.build, b.weeklyMinutes, b.focus);
    // The title stays: it may have been renamed by hand.
    const { title: _title, ...fields } = courseFields(p, b.library, b);
    await db.$transaction(
      async (tx) => {
        await tx.courseModule.deleteMany({ where: { courseId } });
        await tx.course.update({
          where: { id: courseId },
          data: {
            ...fields,
            modules: { create: nestedCreate(moduleRows(p, b.library, progress)) },
          },
        });
      },
      { timeout: 30_000 },
    );
    refresh(courseId);
    return courseId;
  });
}

// --- By hand

export async function setItemDone(itemId: string, done: boolean): Promise<ActionResult> {
  if (!id.safeParse(itemId).success) return { ok: false, error: "Invalid input" };
  const res = await db.courseItem
    .update({
      where: { id: itemId },
      data: { doneAt: done ? new Date() : null },
      select: { module: { select: { courseId: true } } },
    })
    .catch(() => null);
  if (!res) return { ok: false, error: "This item is gone. Reload the page." };
  await db.course.update({ where: { id: res.module.courseId }, data: { updatedAt: new Date() } });
  refresh(res.module.courseId);
  return { ok: true };
}

export async function setPracticeDone(practiceId: string, done: boolean): Promise<ActionResult> {
  if (!id.safeParse(practiceId).success) return { ok: false, error: "Invalid input" };
  const res = await db.coursePractice
    .update({
      where: { id: practiceId },
      data: { doneAt: done ? new Date() : null },
      select: { module: { select: { courseId: true } } },
    })
    .catch(() => null);
  if (!res) return { ok: false, error: "This task is gone. Reload the page." };
  refresh(res.module.courseId);
  return { ok: true };
}

export async function renameCourse(courseId: string, title: string): Promise<ActionResult> {
  const t = z.string().trim().min(1, "Give it a title.").max(300).safeParse(title);
  if (!t.success || !id.safeParse(courseId).success)
    return { ok: false, error: t.error?.issues[0]?.message ?? "Invalid input" };
  const res = await db.course
    .update({ where: { id: courseId }, data: { title: t.data } })
    .catch(() => null);
  if (!res) return { ok: false, error: "This course was deleted." };
  refresh(courseId);
  return { ok: true };
}

export async function deleteCourse(courseId: string): Promise<ActionResult> {
  if (!id.safeParse(courseId).success) return { ok: false, error: "Invalid input" };
  await db.course.deleteMany({ where: { id: courseId } });
  refresh();
  return { ok: true };
}
