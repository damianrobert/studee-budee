"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { BOTTLENECKS } from "@/lib/retros";
import { appTz, isoWeekday, todayKey, weekStartKey, zonedDayStart } from "@/lib/time";
import type { ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(50);
const text = z.string().trim().max(20_000);

const retroSchema = z.object({
  shipped: text.min(1, "Write what you shipped — even “nothing” is an answer."),
  slowedDown: text.min(1, "Write what slowed you down."),
  bottleneck: z.enum(BOTTLENECKS as [string, ...string[]]),
  nextWeekGoal: z.string().trim().min(1, "Set one goal for next week.").max(500),
  energy: z.number().int().min(1).max(5).nullish(),
});

export type RetroInput = z.input<typeof retroSchema>;

const weekKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((k) => isoWeekday(k) === 1, "A retro week starts on a Monday.")
  .refine((k) => k <= weekStartKey(todayKey()), "That week hasn't started yet.");

function data(d: z.output<typeof retroSchema>) {
  return {
    shipped: d.shipped,
    slowedDown: d.slowedDown,
    bottleneck: d.bottleneck as (typeof BOTTLENECKS)[number],
    nextWeekGoal: d.nextWeekGoal,
    energy: d.energy ?? null,
  };
}

export async function createRetro(week: string, input: RetroInput): Promise<ActionResult<string>> {
  const parsed = retroSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const w = weekKey.safeParse(week);
  if (!w.success) return { ok: false, error: w.error.issues[0]?.message ?? "Invalid week" };
  const weekStart = zonedDayStart(w.data, appTz());
  const exists = await db.weeklyRetro.findUnique({ where: { weekStart }, select: { id: true } });
  if (exists)
    return { ok: false, error: "That week already has a retro.", code: `exists:${exists.id}` };
  const r = await db.weeklyRetro.create({ data: { weekStart, ...data(parsed.data) } });
  revalidatePath("/", "layout");
  return { ok: true, data: r.id };
}

export async function updateRetro(retroId: string, input: RetroInput): Promise<ActionResult> {
  const parsed = retroSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(retroId).success)
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Invalid input" };
  const res = await db.weeklyRetro
    .update({ where: { id: retroId }, data: data(parsed.data) })
    .catch(() => null);
  if (!res) return { ok: false, error: "This retro was deleted." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteRetro(retroId: string): Promise<ActionResult> {
  if (!id.safeParse(retroId).success) return { ok: false, error: "Invalid input" };
  await db.weeklyRetro.delete({ where: { id: retroId } }).catch(() => null);
  revalidatePath("/", "layout");
  redirect("/retros");
}
