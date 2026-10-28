// Roadmap display helpers. Pure, so client components can use them.

import type { ResourceKind, RoadmapStepStatus } from "@prisma/client";

export const STEP_STATUSES: RoadmapStepStatus[] = ["TODO", "DOING", "DONE"];

export const STEP_STATUS_INFO: Record<RoadmapStepStatus, { label: string }> = {
  TODO: { label: "To do" },
  DOING: { label: "Learning" },
  DONE: { label: "Done" },
};

export const RESOURCE_KINDS: ResourceKind[] = [
  "DOCS",
  "ARTICLE",
  "VIDEO",
  "COURSE",
  "BOOK",
  "INTERACTIVE",
  "REPO",
  "OTHER",
];

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  DOCS: "Docs",
  ARTICLE: "Article",
  VIDEO: "Video",
  COURSE: "Course",
  BOOK: "Book",
  INTERACTIVE: "Hands-on lab",
  REPO: "Repo",
  OTHER: "Link",
};

export type Progress = { done: number; doing: number; total: number; percent: number };

export function progress(steps: { status: RoadmapStepStatus }[]): Progress {
  const done = steps.filter((s) => s.status === "DONE").length;
  const doing = steps.filter((s) => s.status === "DOING").length;
  const total = steps.length;
  return { done, doing, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

/** Compares links ignoring the scheme, `www.`, a trailing slash and the fragment. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}
