import type { ArtifactKind, ArtifactStatus } from "@prisma/client";
import { appTz, dayKey } from "./time";

export const ARTIFACT_STATUSES: ArtifactStatus[] = ["IDEA", "DRAFT", "PUBLISHED"];

export const ARTIFACT_STATUS_LABEL: Record<ArtifactStatus, string> = {
  IDEA: "Idea",
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

export const ARTIFACT_KINDS: ArtifactKind[] = [
  "BLOG_POST",
  "DIAGRAM",
  "README",
  "SOCIAL_POST",
  "TALK",
  "OTHER",
];

export const ARTIFACT_KIND_LABEL: Record<ArtifactKind, string> = {
  BLOG_POST: "Blog post",
  DIAGRAM: "Diagram",
  README: "README",
  SOCIAL_POST: "Social post",
  TALK: "Talk",
  OTHER: "Other",
};

/** "2026-10" for a target month stored as the first day of the month (00:00 in TZ). */
export function monthKeyOf(d: Date, tz = appTz()): string {
  return dayKey(d, tz).slice(0, 7);
}

export function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}-15T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Rows for the monthly view: the current month first (always, even if empty), then
 * upcoming months soonest first, then past months newest first.
 */
export function orderMonths(
  current: string,
  months: Iterable<string>,
): { current: string; upcoming: string[]; past: string[] } {
  const set = new Set(months);
  set.delete(current);
  const all = [...set];
  return {
    current,
    upcoming: all.filter((m) => m > current).sort(),
    past: all.filter((m) => m < current).sort((a, b) => b.localeCompare(a)),
  };
}

/** Published artifacts keep their date; moving away from Published clears it. */
export function nextPublishedAt(
  status: ArtifactStatus,
  previous: Date | null | undefined,
  now = new Date(),
): Date | null {
  if (status !== "PUBLISHED") return null;
  return previous ?? now;
}
