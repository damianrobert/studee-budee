"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { passwordMatches } from "@/lib/auth/password";
import { allowAttempt } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, createSessionToken } from "@/lib/auth/session";

const loginSchema = z.object({
  password: z.string().min(1, "Enter your password").max(1000),
  from: z.string().max(2000).optional(),
});

export type LoginState = { error?: string };

// Only allow same-site relative redirects.
function safeRedirect(from: string | undefined): string {
  return from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    password: formData.get("password"),
    from: formData.get("from") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // X-Forwarded-For is client-controlled unless a reverse proxy sets it, so only
  // key by IP behind a trusted proxy; otherwise one shared bucket (single user).
  const h = await headers();
  const key =
    process.env.TRUST_PROXY === "true"
      ? h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
      : "global";
  if (!allowAttempt(key)) return { error: "Too many attempts. Wait a minute and try again." };

  if (!passwordMatches(parsed.data.password)) return { error: "Wrong password." };

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  redirect(safeRedirect(parsed.data.from));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
