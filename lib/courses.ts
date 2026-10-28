// Courses: the resources file (gathered with an LLM outside the app, see templates/), the
// course plan both builders return, progress, and video embeds. Pure, so the new-course
// dialog can preview a file in the browser and the tests can cover it.

import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { CourseItemType, LoopStage } from "@prisma/client";
import { normalizeUrl } from "./reading";
import { urlKey } from "./roadmaps";

/** Characters; server actions take bodies up to 1 MB. */
export const SOURCE_MAX = 500_000;
export const RESOURCES_MAX = 500;
export const TOPICS_MAX = 100;
export const MODULES_MAX = 30;
export const ITEMS_PER_MODULE_MAX = 25;
export const PRACTICE_MAX = 6;
export const CHECKPOINTS_MAX = 8;

export const ITEM_TYPES: CourseItemType[] = [
  "VIDEO",
  "PLAYLIST",
  "ARTICLE",
  "DOCS",
  "GUIDE",
  "TUTORIAL",
  "TOOL",
  "BOOK",
  "OTHER",
];

export const ITEM_TYPE_LABEL: Record<CourseItemType, string> = {
  VIDEO: "Video",
  PLAYLIST: "Playlist",
  ARTICLE: "Article",
  DOCS: "Docs",
  GUIDE: "Guide",
  TUTORIAL: "Tutorial",
  TOOL: "Tool",
  BOOK: "Book",
  OTHER: "Link",
};

export const PRACTICE_STAGES = ["PAIN", "BUILD", "BREAK"] as const satisfies LoopStage[];

// --- The resources file

export type LibraryResource = {
  key: string;
  type: CourseItemType;
  title: string;
  url: string;
  author: string | null;
  minutes: number | null;
  level: string | null;
  topics: string[];
  why: string | null;
  startSec: number | null;
  endSec: number | null;
};

export type Library = {
  subject: string;
  learner: string | null;
  goal: string | null;
  environment: string | null;
  topics: { key: string; title: string; level: string | null }[];
  resources: LibraryResource[];
  /** Topics the file says it found nothing good for. */
  gaps: string[];
};

export type ParsedSource =
  { ok: true; library: Library; warnings: string[] } | { ok: false; errors: string[] };

/** "videos", "Video", "docs", "documentation" → the item type; anything unknown is OTHER. */
export function typeFromName(name: string): CourseItemType {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  if (n.startsWith("video")) return "VIDEO";
  if (n.startsWith("playlist")) return "PLAYLIST";
  if (n.startsWith("article") || n.startsWith("blog") || n.startsWith("post")) return "ARTICLE";
  if (n.startsWith("doc")) return "DOCS";
  if (n.startsWith("guide")) return "GUIDE";
  if (n.startsWith("tutorial") || n.startsWith("lab") || n.startsWith("exercise"))
    return "TUTORIAL";
  if (n.startsWith("tool") || n.startsWith("playground") || n.startsWith("cheatsheet"))
    return "TOOL";
  if (n.startsWith("book")) return "BOOK";
  return "OTHER";
}

/** "2:10" → 130, "1:02:03" → 3723, 90 → 90; anything else → null. */
export function parseTimestamp(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [, h, min, sec] = m;
  if (Number(sec) >= 60) return null;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(sec);
}

/** 130 → "2:10", 3723 → "1:02:03" */
export function fmtTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const key = z.union([z.string(), z.number()]).transform((v) => String(v).trim());
const optText = (max: number) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v == null ? null : String(v).trim().slice(0, max) || null));
const optNumber = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    const n = typeof v === "string" ? Number(v.trim()) : v;
    return n != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  });
const stringList = z
  .union([z.array(z.union([z.string(), z.number()])), z.string()])
  .nullish()
  .transform((v) =>
    (v == null ? [] : Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean),
  );

const resourceIn = z.object({
  id: key,
  type: z.string().nullish(),
  title: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  url: z.string(),
  author: optText(200),
  minutes: optNumber,
  level: optText(30),
  topics: stringList,
  topic: optText(100),
  why: optText(1000),
  start: z.union([z.string(), z.number()]).nullish(),
  end: z.union([z.string(), z.number()]).nullish(),
});

const fileIn = z.object({
  version: z.number().optional(),
  subject: optText(300),
  title: optText(300),
  learner: optText(1000),
  goal: optText(1000),
  environment: optText(500),
  topics: z
    .array(
      z.union([
        z.object({ id: key, title: optText(300), level: optText(30) }),
        z.string().transform((s) => ({ id: s.trim(), title: s.trim(), level: null })),
      ]),
    )
    .default([]),
  // Grouped by type (`videos: [...]`), or one list where each resource has a `type`.
  resources: z.union([z.record(z.array(z.unknown()).nullish()), z.array(z.unknown())]),
  gaps: z
    .array(
      z.union([z.string(), z.object({ topic: optText(100), note: optText(500) }).passthrough()]),
    )
    .nullish(),
});

function issuePath(path: (string | number)[]): string {
  return path
    .map((p, i) => (typeof p === "number" ? `#${p + 1}` : i ? ` › ${p}` : p))
    .join("")
    .replace(/(#\d+)/g, " $1");
}

function issues(e: z.ZodError, prefix: (string | number)[] = []): string[] {
  return e.issues.map((i) => {
    const path = issuePath([...prefix, ...i.path]);
    const msg = i.message === "Required" ? "is missing" : i.message;
    return path ? `${path}: ${msg}` : msg;
  });
}

/** Parses and checks a resources file (YAML or JSON). Errors say where the problem is. */
export function parseResourcesFile(text: string): ParsedSource {
  if (!text.trim()) return { ok: false, errors: ["The file is empty."] };
  if (text.length > SOURCE_MAX)
    return { ok: false, errors: [`The file is too big (over ${SOURCE_MAX / 1000}k characters).`] };

  let raw: unknown;
  try {
    // JSON is valid YAML, but JSON.parse gives clearer errors for JSON files.
    raw = /^\s*[{[]/.test(text) ? JSON.parse(text) : parseYaml(text, { maxAliasCount: 100 });
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return { ok: false, errors: [`This isn't valid YAML or JSON: ${msg}`] };
  }
  const file = fileIn.safeParse(raw);
  if (!file.success) return { ok: false, errors: issues(file.error) };
  const f = file.data;

  const errors: string[] = [];
  const warnings: string[] = [];

  const topics: Library["topics"] = [];
  const topicKeys = new Set<string>();
  for (const t of f.topics) {
    if (!t.id) continue;
    if (topicKeys.has(t.id)) errors.push(`topics: the id “${t.id}” is used twice.`);
    topicKeys.add(t.id);
    topics.push({ key: t.id, title: t.title ?? t.id, level: t.level });
  }
  if (topics.length > TOPICS_MAX) errors.push(`topics: keep it to ${TOPICS_MAX} at most.`);

  const groups: [string | null, unknown[], (string | number)[]][] = Array.isArray(f.resources)
    ? [[null, f.resources, ["resources"]]]
    : Object.entries(f.resources).map(([name, list]) => [name, list ?? [], ["resources", name]]);

  const resources: LibraryResource[] = [];
  const keys = new Set<string>();
  const urls = new Map<string, string>();
  const unknownTopics = new Set<string>();
  for (const [group, list, at] of groups) {
    list.forEach((item, i) => {
      const r = resourceIn.safeParse(item);
      if (!r.success) return errors.push(...issues(r.error, [...at, i]));
      const d = r.data;
      const where = `${issuePath([...at, i])} (“${d.id}”)`;
      if (!d.id) return errors.push(`${issuePath([...at, i])}: the id is empty.`);
      if (keys.has(d.id)) return errors.push(`${where}: the id is used twice.`);
      keys.add(d.id);
      const url = normalizeUrl(d.url);
      if (!url) return errors.push(`${where}: “${d.url}” isn't a web link.`);
      const dup = urls.get(urlKey(url));
      if (dup) warnings.push(`“${d.id}” has the same link as “${dup}”.`);
      else urls.set(urlKey(url), d.id);

      const refs = [...new Set([...d.topics, ...(d.topic ? [d.topic] : [])])];
      // Without a topics list, the resources' own topic names make one.
      if (!f.topics.length)
        for (const t of refs)
          if (!topicKeys.has(t)) {
            topicKeys.add(t);
            topics.push({ key: t, title: t, level: null });
          }
      for (const t of refs) if (!topicKeys.has(t)) unknownTopics.add(t);

      resources.push({
        key: d.id,
        type: typeFromName(d.type ?? group ?? ""),
        title: d.title || url,
        url,
        author: d.author,
        minutes: d.minutes,
        level: d.level,
        topics: refs.filter((t) => topicKeys.has(t)),
        why: d.why,
        startSec: parseTimestamp(d.start),
        endSec: parseTimestamp(d.end),
      });
    });
  }
  if (unknownTopics.size)
    warnings.push(
      `Resources mention topics that aren't in the topics list, so they were ignored: ${[...unknownTopics].join(", ")}.`,
    );
  if (!resources.length && !errors.length) errors.push("resources: there are no resources.");
  if (resources.length > RESOURCES_MAX)
    errors.push(`resources: keep it to ${RESOURCES_MAX} at most (there are ${resources.length}).`);
  for (const r of resources)
    if (r.startSec != null && r.endSec != null && r.endSec <= r.startSec) {
      warnings.push(`“${r.key}”: end is before start, so both were ignored.`);
      r.startSec = r.endSec = null;
    }
  if (errors.length) return { ok: false, errors: errors.slice(0, 30) };

  const subject = f.subject ?? f.title ?? topics[0]?.title ?? "Untitled course";
  const gaps = (f.gaps ?? [])
    .map((g) => (typeof g === "string" ? g : [g.topic, g.note].filter(Boolean).join(": ")))
    .map((g) => g.trim())
    .filter(Boolean);
  return {
    ok: true,
    library: {
      subject,
      learner: f.learner,
      goal: f.goal,
      environment: f.environment,
      topics,
      resources,
      gaps,
    },
    warnings,
  };
}

/** "17 resources in 7 topics: 1 video, 11 docs, …" for the import preview. */
export function librarySummary(lib: Library): string {
  const counts = ITEM_TYPES.map(
    (t) => [t, lib.resources.filter((r) => r.type === t).length] as const,
  )
    .filter(([, n]) => n)
    .map(
      ([t, n]) => `${n} ${ITEM_TYPE_LABEL[t].toLowerCase()}${n === 1 || t === "DOCS" ? "" : "s"}`,
    );
  const topics = lib.topics.length
    ? ` in ${lib.topics.length} topic${lib.topics.length === 1 ? "" : "s"}`
    : "";
  return `${lib.resources.length} resource${lib.resources.length === 1 ? "" : "s"}${topics}: ${counts.join(", ")}`;
}

// --- The plan both builders return

export type PlanItem = {
  resourceKey: string;
  required: boolean;
  why: string | null;
  sections: string[];
};
export type PlanPractice = {
  stage: (typeof PRACTICE_STAGES)[number];
  task: string;
  doneWhen: string | null;
};
export type PlanModule = {
  title: string;
  goal: string | null;
  items: PlanItem[];
  practice: PlanPractice[];
  checkpoints: { question: string; answer: string }[];
};
export type CoursePlan = {
  title: string;
  description: string | null;
  level: string | null;
  outcomes: string[];
  modules: PlanModule[];
  gaps: string[];
};

/** Order inside a module when there's no AI: overview reading and videos, then reference, then hands-on. */
const TYPE_ORDER: CourseItemType[] = [
  "ARTICLE",
  "VIDEO",
  "PLAYLIST",
  "DOCS",
  "GUIDE",
  "TUTORIAL",
  "TOOL",
  "BOOK",
  "OTHER",
];

/**
 * The free build: one module per topic in the file's order, each resource in the first
 * topic it lists. Tools and books are extras. Resources without a topic go in a last module.
 */
export function planByTopic(lib: Library): CoursePlan {
  const placed = new Set<string>();
  const byType = (a: LibraryResource, b: LibraryResource) =>
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
  const item = (r: LibraryResource, required: boolean): PlanItem => ({
    resourceKey: r.key,
    required: required && r.type !== "TOOL" && r.type !== "BOOK",
    why: null,
    sections: [],
  });

  const modules: PlanModule[] = [];
  const empty: string[] = [];
  for (const t of lib.topics) {
    const list = lib.resources
      .filter((r) => !placed.has(r.key) && r.topics[0] === t.key)
      .sort(byType);
    // A resource whose first topic is covered elsewhere still lands in a later topic it lists.
    if (!list.length) {
      const late = lib.resources.filter((r) => !placed.has(r.key) && r.topics.includes(t.key));
      list.push(...late.sort(byType));
    }
    if (!list.length) {
      empty.push(t.title);
      continue;
    }
    for (const r of list) placed.add(r.key);
    modules.push({
      title: t.title,
      goal: null,
      items: list.map((r) => item(r, true)),
      practice: [],
      checkpoints: [],
    });
  }
  const rest = lib.resources.filter((r) => !placed.has(r.key)).sort(byType);
  if (rest.length)
    modules.push({
      title: modules.length ? "More resources" : lib.subject,
      goal: null,
      items: rest.map((r) => item(r, !modules.length)),
      practice: [],
      checkpoints: [],
    });

  return {
    title: lib.subject,
    description: lib.goal,
    level: null,
    outcomes: [],
    modules: modules.slice(0, MODULES_MAX),
    gaps: [...lib.gaps, ...empty.map((t) => `${t}: no resources in the file`)],
  };
}

/** Keys of resources the plan doesn't use. */
export function unusedKeys(lib: Library, plan: CoursePlan): string[] {
  const used = new Set(plan.modules.flatMap((m) => m.items.map((i) => i.resourceKey)));
  return lib.resources.filter((r) => !used.has(r.key)).map((r) => r.key);
}

// --- Saving a plan, keeping progress across rebuilds

export type Progress = {
  items: Map<string, Date>; // resourceKey → doneAt
  practice: Map<string, Date>; // normalized task → doneAt
};

export const practiceKey = (task: string) => task.toLowerCase().replace(/\s+/g, " ").trim();

/** The rows to create for a plan's modules, with progress carried over from a previous build. */
export function moduleRows(plan: CoursePlan, lib: Library, progress?: Progress) {
  const byKey = new Map(lib.resources.map((r) => [r.key, r]));
  return plan.modules.map((m, mi) => ({
    position: mi,
    title: m.title,
    goal: m.goal,
    items: m.items.flatMap((it, i) => {
      const r = byKey.get(it.resourceKey);
      if (!r) return [];
      return [
        {
          position: i,
          resourceKey: r.key,
          type: r.type,
          title: r.title,
          url: r.url,
          author: r.author,
          minutes: r.minutes,
          required: it.required,
          why: it.why ?? r.why,
          sections: it.sections,
          startSec: r.startSec,
          endSec: r.endSec,
          doneAt: progress?.items.get(r.key) ?? null,
        },
      ];
    }),
    practice: m.practice.map((p, i) => ({
      position: i,
      stage: p.stage,
      task: p.task,
      doneWhen: p.doneWhen,
      doneAt: progress?.practice.get(practiceKey(p.task)) ?? null,
    })),
    checkpoints: m.checkpoints.map((c, i) => ({
      position: i,
      question: c.question,
      answer: c.answer,
    })),
  }));
}

// --- Progress

export type CourseProgress = {
  done: number;
  total: number;
  percent: number;
  extraDone: number;
  /** Estimated minutes of required items not done yet. */
  minutesLeft: number;
};

export function courseProgress(
  items: { required: boolean; doneAt: Date | null; minutes: number | null }[],
): CourseProgress {
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.doneAt).length;
  return {
    done,
    total: required.length,
    percent: required.length ? Math.round((done / required.length) * 100) : 0,
    extraDone: items.filter((i) => !i.required && i.doneAt).length,
    minutesLeft: required.filter((i) => !i.doneAt).reduce((n, i) => n + (i.minutes ?? 0), 0),
  };
}

/** The first required item not done yet, in course order. */
export function nextItem<T extends { required: boolean; doneAt: Date | null }>(
  modules: { items: T[] }[],
): T | null {
  for (const m of modules) for (const i of m.items) if (i.required && !i.doneAt) return i;
  return null;
}

// --- Video embeds

/** A privacy-friendly embed URL for YouTube and Vimeo links; null for anything else. */
export function embedUrl(
  url: string,
  startSec?: number | null,
  endSec?: number | null,
): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const yt = (path: string, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(extra);
    const start = startSec ?? parseTimestamp(u.searchParams.get("t")?.replace(/s$/, "") ?? null);
    if (start) q.set("start", String(start));
    if (endSec) q.set("end", String(endSec));
    q.set("rel", "0");
    return `https://www.youtube-nocookie.com/embed/${path}?${q}`;
  };
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? yt(id) : null;
  }
  if (host === "youtube.com" || host === "music.youtube.com") {
    const list = u.searchParams.get("list");
    const v = u.searchParams.get("v");
    if (u.pathname === "/watch" && v) return yt(v);
    if (u.pathname === "/playlist" && list) return yt("videoseries", { list });
    const m = /^\/(?:embed|shorts|live)\/([\w-]+)/.exec(u.pathname);
    if (m) return yt(m[1]!);
    return null;
  }
  if (host === "vimeo.com") {
    const m = /^\/(\d+)/.exec(u.pathname);
    if (!m) return null;
    return `https://player.vimeo.com/video/${m[1]}${startSec ? `#t=${startSec}s` : ""}`;
  }
  return null;
}
