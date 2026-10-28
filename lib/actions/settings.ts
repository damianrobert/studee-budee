"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSettings } from "@/lib/settings";
import { THEME_COOKIE, THEMES } from "@/lib/theme";
import type { ActionResult } from "@/lib/utils";

export async function setTheme(theme: string): Promise<ActionResult> {
  const t = z.enum(THEMES).safeParse(theme);
  if (!t.success) return { ok: false, error: "Invalid theme" };
  (await cookies()).set(THEME_COOKIE, t.data, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

const goalsSchema = z.object({
  weeklyTarget: z.number().int().min(1, "At least 1 session").max(21),
  minSessionMinutes: z.number().int().min(1, "At least 1 minute").max(240),
});

export async function updateGoals(input: z.input<typeof goalsSchema>): Promise<ActionResult> {
  const parsed = goalsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await saveSettings(parsed.data);
  revalidatePath("/", "layout");
  return { ok: true };
}
