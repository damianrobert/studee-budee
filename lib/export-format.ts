// The export archive's format: data.json schema, integrity checks and the markdown files.
// Pure (no DB/Node APIs), shared by the export route, the import and the tests.

import { z } from "zod";
import { STORED_NAME } from "./files";
import { noteToMarkdown, slugFileName, slugify } from "./markdown-export";
import { postmortemToMarkdown } from "./postmortems";
import { UserError } from "./utils";

export const EXPORT_FORMAT = "studee-budee-export";
export const EXPORT_VERSION = 1;
export const DATA_FILE = "data.json";
export const FILES_DIR = "files/";

const id = z.string().min(1).max(50);
const date = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));
const text = z.string().max(1_000_000);
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullable().default(null);
const ids = z.array(id).default([]);

const stage = z.enum(["PAIN", "BUILD", "BREAK", "EXPLAIN", "DONE"]);

const project = z.object({
  id,
  name: text,
  description: opt(text),
  goal: opt(text),
  repoUrl: opt(text),
  status: z.enum(["ACTIVE", "PAUSED", "DONE", "ARCHIVED"]),
  mentorMemory: opt(text),
  mentorMemoryAt: opt(date),
  createdAt: date,
  updatedAt: date,
});

const topic = z.object({
  id,
  projectId: id,
  title: text,
  description: opt(text),
  stage,
  position: z.number().int(),
  createdAt: date,
  updatedAt: date,
});

const topicStageChange = z.object({ id, topicId: id, from: stage, to: stage, changedAt: date });

const session = z.object({
  id,
  projectId: opt(id),
  topicId: opt(id),
  startedAt: date,
  endedAt: opt(date),
  durationMin: opt(z.number().int()),
  stage: opt(stage),
  summary: opt(text),
  producedOutput: z.boolean(),
  outputLink: opt(text),
  nextStep: opt(text),
  createdAt: date,
});

const note = z.object({
  id,
  title: text,
  content: text,
  type: z.enum(["NOTE", "EXPLAIN_IT"]),
  projectId: opt(id),
  topicId: opt(id),
  pinned: z.boolean(),
  createdAt: date,
  updatedAt: date,
  tagIds: ids,
  fileIds: ids,
});

const postmortem = z.object({
  id,
  title: text,
  occurredAt: date,
  whatBroke: text,
  symptoms: text,
  investigation: text,
  rootCause: text,
  fix: text,
  lessons: text,
  wasDeliberate: z.boolean(),
  projectId: opt(id),
  topicId: opt(id),
  chaosExperimentId: opt(id),
  createdAt: date,
  updatedAt: date,
  tagIds: ids,
  fileIds: ids,
});

const chaosExperiment = z.object({
  id,
  title: text,
  description: opt(text),
  hypothesis: opt(text),
  difficulty: z.number().int(),
  category: opt(text),
  completedAt: opt(date),
  createdAt: date,
});

const weeklyRetro = z.object({
  id,
  weekStart: date,
  shipped: text,
  slowedDown: text,
  bottleneck: z.enum([
    "TIME",
    "ENERGY",
    "FOCUS",
    "TUTORIAL_HELL",
    "STUCK_ON_CONCEPT",
    "TOOL_FOMO",
    "ENVIRONMENT_ISSUES",
    "OTHER",
  ]),
  nextWeekGoal: text,
  energy: opt(z.number().int()),
  createdAt: date,
});

const readingItem = z.object({
  id,
  url: text,
  title: opt(text),
  source: opt(text),
  status: z.enum(["UNREAD", "READ", "ARCHIVED"]),
  takeaway: opt(text),
  createdAt: date,
  readAt: opt(date),
  tagIds: ids,
});

const artifact = z.object({
  id,
  title: text,
  kind: z.enum(["BLOG_POST", "DIAGRAM", "README", "SOCIAL_POST", "TALK", "OTHER"]),
  status: z.enum(["IDEA", "DRAFT", "PUBLISHED"]),
  url: opt(text),
  notes: opt(text),
  targetMonth: date,
  publishedAt: opt(date),
  sourceNoteId: opt(id),
  sourcePostmortemId: opt(id),
  createdAt: date,
  updatedAt: date,
});

const workObservation = z.object({
  id,
  content: text,
  question: opt(text),
  resolved: z.boolean(),
  answer: opt(text),
  createdAt: date,
  tagIds: ids,
});

const fileAsset = z.object({
  id,
  originalName: z.string().min(1).max(255),
  storedName: z.string().regex(STORED_NAME, "Invalid stored file name"),
  mimeType: z.string().max(255),
  sizeBytes: z.number().int().nonnegative(),
  projectId: opt(id),
  createdAt: date,
});

const tag = z.object({ id, name: z.string().min(1).max(100) });

const flashcard = z.object({
  id,
  front: text,
  back: text,
  noteId: opt(id),
  easeFactor: z.number(),
  interval: z.number().int(),
  repetitions: z.number().int(),
  dueAt: date,
  createdAt: date,
});

const roadmap = z.object({
  id,
  title: text,
  summary: opt(text),
  prompt: text,
  createdAt: date,
  updatedAt: date,
});

const roadmapStage = z.object({
  id,
  roadmapId: id,
  position: z.number().int(),
  title: text,
  description: opt(text),
});

const roadmapStep = z.object({
  id,
  stageId: id,
  position: z.number().int(),
  title: text,
  description: opt(text),
  practice: opt(text),
  status: z.enum(["TODO", "DOING", "DONE"]),
});

const roadmapResource = z.object({
  id,
  stepId: id,
  position: z.number().int(),
  title: text,
  url: text,
  kind: z.enum(["DOCS", "ARTICLE", "VIDEO", "COURSE", "BOOK", "INTERACTIVE", "REPO", "OTHER"]),
  note: opt(text),
  origin: z.enum(["SEARCH", "AI", "MANUAL"]),
  createdAt: date,
});

const roadmapEdit = z.object({
  id,
  roadmapId: id,
  instruction: text,
  scope: opt(text),
  summary: text,
  createdAt: date,
});

const course = z.object({
  id,
  title: text,
  description: opt(text),
  level: opt(text),
  outcomes: z.array(text).default([]),
  subject: text,
  source: text,
  build: z.enum(["AI", "TOPICS"]),
  weeklyMinutes: opt(z.number().int()),
  focus: opt(text),
  gaps: z.array(text).default([]),
  unused: z.array(text).default([]),
  createdAt: date,
  updatedAt: date,
});

const courseModule = z.object({
  id,
  courseId: id,
  position: z.number().int(),
  title: text,
  goal: opt(text),
});

const courseItem = z.object({
  id,
  moduleId: id,
  position: z.number().int(),
  resourceKey: text,
  type: z.enum([
    "VIDEO",
    "PLAYLIST",
    "ARTICLE",
    "DOCS",
    "GUIDE",
    "TUTORIAL",
    "TOOL",
    "BOOK",
    "OTHER",
  ]),
  title: text,
  url: text,
  author: opt(text),
  minutes: opt(z.number().int()),
  required: z.boolean(),
  why: opt(text),
  sections: z.array(text).default([]),
  startSec: opt(z.number().int()),
  endSec: opt(z.number().int()),
  doneAt: opt(date),
});

const coursePractice = z.object({
  id,
  moduleId: id,
  position: z.number().int(),
  stage,
  task: text,
  doneWhen: opt(text),
  doneAt: opt(date),
});

const courseCheckpoint = z.object({
  id,
  moduleId: id,
  position: z.number().int(),
  question: text,
  answer: text,
});

const mentorMessage = z.object({
  id,
  projectId: id,
  role: z.enum(["USER", "MENTOR"]),
  content: text,
  solution: z.boolean().default(false),
  createdAt: date,
});

const setting = z.object({ key: z.string().min(1).max(100), value: z.string().max(10_000) });

const table = <T extends z.ZodTypeAny>(row: T) => z.array(row).default([]);

export const exportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int(),
  exportedAt: z.string().optional(),
  data: z.object({
    projects: table(project),
    topics: table(topic),
    topicStageChanges: table(topicStageChange),
    sessions: table(session),
    notes: table(note),
    postmortems: table(postmortem),
    chaosExperiments: table(chaosExperiment),
    weeklyRetros: table(weeklyRetro),
    readingItems: table(readingItem),
    artifacts: table(artifact),
    workObservations: table(workObservation),
    files: table(fileAsset),
    tags: table(tag),
    flashcards: table(flashcard),
    roadmaps: table(roadmap),
    roadmapStages: table(roadmapStage),
    roadmapSteps: table(roadmapStep),
    roadmapResources: table(roadmapResource),
    roadmapEdits: table(roadmapEdit),
    courses: table(course),
    courseModules: table(courseModule),
    courseItems: table(courseItem),
    coursePractice: table(coursePractice),
    courseCheckpoints: table(courseCheckpoint),
    mentorMessages: table(mentorMessage),
    settings: table(setting),
  }),
});

export type ExportFile = z.output<typeof exportSchema>;
export type ExportData = ExportFile["data"];
export type ExportTable = keyof ExportData;

/** Readable labels for the import summary. */
export const TABLE_LABELS: Record<ExportTable, string> = {
  projects: "projects",
  topics: "topics",
  topicStageChanges: "stage changes",
  sessions: "sessions",
  notes: "notes",
  postmortems: "postmortems",
  chaosExperiments: "chaos experiments",
  weeklyRetros: "retros",
  readingItems: "reading items",
  artifacts: "artifacts",
  workObservations: "work observations",
  files: "files",
  tags: "tags",
  flashcards: "flashcards",
  roadmaps: "roadmaps",
  roadmapStages: "roadmap stages",
  roadmapSteps: "roadmap steps",
  roadmapResources: "roadmap resources",
  roadmapEdits: "roadmap changes",
  courses: "courses",
  courseModules: "course modules",
  courseItems: "course resources",
  coursePractice: "course practice tasks",
  courseCheckpoints: "course checkpoint questions",
  mentorMessages: "mentor messages",
  settings: "settings",
};

/** Parses data.json; throws an Error with a readable message. */
export function parseExport(json: unknown): ExportFile {
  const res = exportSchema.safeParse(json);
  if (!res.success) {
    const issue = res.error.issues[0]!;
    if (issue.path[0] === "format") throw new UserError("This isn't a studee-budee export.");
    const where = issue.path.length ? ` (at ${issue.path.join(".")})` : "";
    throw new UserError(`Invalid export: ${issue.message}${where}`);
  }
  if (res.data.version > EXPORT_VERSION)
    throw new UserError("This export was made by a newer version of studee-budee. Update first.");
  checkReferences(res.data.data);
  return res.data;
}

/** Duplicate ids/unique values and dangling references, checked before touching the DB. */
export function checkReferences(d: ExportData) {
  const idSets = {} as Record<Exclude<ExportTable, "settings">, Set<string>>;
  for (const key of Object.keys(d) as ExportTable[]) {
    if (key === "settings") continue;
    const set = new Set<string>();
    for (const row of d[key] as { id: string }[]) {
      if (set.has(row.id)) throw new UserError(`Invalid export: duplicate id ${row.id} in ${key}`);
      set.add(row.id);
    }
    idSets[key] = set;
  }
  const unique = (table: string, values: string[]) => {
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v)) throw new UserError(`Invalid export: duplicate ${table} "${v}"`);
      seen.add(v);
    }
  };
  unique(
    "tag",
    d.tags.map((t) => t.name),
  );
  unique(
    "retro week",
    d.weeklyRetros.map((r) => r.weekStart.toISOString()),
  );
  unique(
    "stored file",
    d.files.map((f) => f.storedName),
  );
  unique(
    "setting",
    d.settings.map((s) => s.key),
  );

  const ref = (table: string, rowId: string, target: Set<string>, value: string | null) => {
    if (value !== null && !target.has(value))
      throw new UserError(`Invalid export: ${table} ${rowId} points to missing ${value}`);
  };
  for (const t of d.topics) ref("topic", t.id, idSets.projects, t.projectId);
  for (const c of d.topicStageChanges) ref("stage change", c.id, idSets.topics, c.topicId);
  for (const s of d.sessions) {
    ref("session", s.id, idSets.projects, s.projectId);
    ref("session", s.id, idSets.topics, s.topicId);
  }
  for (const n of d.notes) {
    ref("note", n.id, idSets.projects, n.projectId);
    ref("note", n.id, idSets.topics, n.topicId);
    for (const t of n.tagIds) ref("note", n.id, idSets.tags, t);
    for (const f of n.fileIds) ref("note", n.id, idSets.files, f);
  }
  for (const p of d.postmortems) {
    ref("postmortem", p.id, idSets.projects, p.projectId);
    ref("postmortem", p.id, idSets.topics, p.topicId);
    ref("postmortem", p.id, idSets.chaosExperiments, p.chaosExperimentId);
    for (const t of p.tagIds) ref("postmortem", p.id, idSets.tags, t);
    for (const f of p.fileIds) ref("postmortem", p.id, idSets.files, f);
  }
  for (const r of d.readingItems)
    for (const t of r.tagIds) ref("reading item", r.id, idSets.tags, t);
  for (const o of d.workObservations)
    for (const t of o.tagIds) ref("observation", o.id, idSets.tags, t);
  for (const a of d.artifacts) {
    ref("artifact", a.id, idSets.notes, a.sourceNoteId);
    ref("artifact", a.id, idSets.postmortems, a.sourcePostmortemId);
  }
  for (const f of d.files) ref("file", f.id, idSets.projects, f.projectId);
  for (const c of d.flashcards) ref("flashcard", c.id, idSets.notes, c.noteId);
  for (const s of d.roadmapStages) ref("roadmap stage", s.id, idSets.roadmaps, s.roadmapId);
  for (const s of d.roadmapSteps) ref("roadmap step", s.id, idSets.roadmapStages, s.stageId);
  for (const r of d.roadmapResources) ref("roadmap resource", r.id, idSets.roadmapSteps, r.stepId);
  for (const e of d.roadmapEdits) ref("roadmap change", e.id, idSets.roadmaps, e.roadmapId);
  for (const m of d.courseModules) ref("course module", m.id, idSets.courses, m.courseId);
  for (const i of d.courseItems) ref("course resource", i.id, idSets.courseModules, i.moduleId);
  for (const t of d.coursePractice)
    ref("course practice task", t.id, idSets.courseModules, t.moduleId);
  for (const c of d.courseCheckpoints)
    ref("course checkpoint", c.id, idSets.courseModules, c.moduleId);
  for (const m of d.mentorMessages) ref("mentor message", m.id, idSets.projects, m.projectId);
}

/** Points `/api/files/<id>` links at the copies in the archive (or leaves them as they are). */
export function rewriteFileLinks(markdown: string, hrefFor: (id: string) => string | undefined) {
  return markdown.replace(
    /\/api\/files\/([a-z0-9]{20,40})\b(\?download=1)?/g,
    (m, fileId: string) => hrefFor(fileId) ?? m,
  );
}

/** Picks `name`, or `name-2`, `name-3`… so files in one folder never collide. */
function uniqueName(used: Set<string>, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [fileName.slice(0, dot), fileName.slice(dot)] : [fileName, ""];
  let name = fileName;
  for (let i = 2; used.has(name); i++) name = `${base}-${i}${ext}`;
  used.add(name);
  return name;
}

export const NO_PROJECT_DIR = "_no-project";

/**
 * Notes and postmortems as markdown, one folder per project:
 * `markdown/<project>/notes/<title>.md` and `markdown/<project>/postmortems/<title>.md`.
 */
export function markdownFiles(d: ExportData, tz?: string): { name: string; content: string }[] {
  const usedDirs = new Set<string>([NO_PROJECT_DIR]);
  const projectDir = new Map<string, string>();
  for (const p of d.projects)
    projectDir.set(p.id, uniqueName(usedDirs, slugify(p.name) || "project"));
  const projects = new Map(d.projects.map((p) => [p.id, p]));
  const topics = new Map(d.topics.map((t) => [t.id, t]));
  const tags = new Map(d.tags.map((t) => [t.id, t]));
  const files = new Map(d.files.map((f) => [f.id, f]));
  const chaos = new Map(d.chaosExperiments.map((c) => [c.id, c]));
  // Each file sits at markdown/<project>/<kind>/<name>.md, three levels below the root.
  const hrefFor = (fileId: string) => {
    const f = files.get(fileId);
    return f && `../../../${FILES_DIR}${f.storedName}`;
  };
  const usedNames = new Map<string, Set<string>>();
  const path = (projectId: string | null, kind: string, title: string) => {
    const dir = `markdown/${(projectId && projectDir.get(projectId)) || NO_PROJECT_DIR}/${kind}`;
    if (!usedNames.has(dir)) usedNames.set(dir, new Set());
    return `${dir}/${uniqueName(usedNames.get(dir)!, slugFileName(title))}`;
  };
  const tagList = (tagIds: string[]) =>
    tagIds
      .map((t) => tags.get(t))
      .filter((t) => !!t)
      .sort((a, b) => a.name.localeCompare(b.name));

  const out: { name: string; content: string }[] = [];
  for (const n of d.notes) {
    out.push({
      name: path(n.projectId, "notes", n.title),
      content: noteToMarkdown({
        ...n,
        content: rewriteFileLinks(n.content, hrefFor),
        project: n.projectId ? projects.get(n.projectId) : null,
        topic: n.topicId ? topics.get(n.topicId) : null,
        tags: tagList(n.tagIds),
      }),
    });
  }
  for (const p of d.postmortems) {
    const project = p.projectId ? projects.get(p.projectId) : null;
    const topic = p.topicId ? topics.get(p.topicId) : null;
    const pTags = tagList(p.tagIds);
    const front = [
      `title: ${JSON.stringify(p.title)}`,
      `type: postmortem`,
      `kind: ${p.wasDeliberate ? "deliberate" : "real"}`,
      project && `project: ${JSON.stringify(project.name)}`,
      topic && `topic: ${JSON.stringify(topic.title)}`,
      pTags.length && `tags: [${pTags.map((t) => JSON.stringify(t.name)).join(", ")}]`,
      `occurred: ${p.occurredAt.toISOString()}`,
    ].filter(Boolean);
    const body = postmortemToMarkdown(
      {
        ...p,
        whatBroke: rewriteFileLinks(p.whatBroke, hrefFor),
        symptoms: rewriteFileLinks(p.symptoms, hrefFor),
        investigation: rewriteFileLinks(p.investigation, hrefFor),
        rootCause: rewriteFileLinks(p.rootCause, hrefFor),
        fix: rewriteFileLinks(p.fix, hrefFor),
        lessons: rewriteFileLinks(p.lessons, hrefFor),
        chaosExperiment: p.chaosExperimentId ? chaos.get(p.chaosExperimentId) : null,
      },
      tz,
    );
    out.push({
      name: path(p.projectId, "postmortems", p.title),
      content: `---\n${front.join("\n")}\n---\n\n${body}`,
    });
  }
  return out;
}

export const ARCHIVE_README = `studee-budee export
===================

data.json     Everything in the database (all tables). Import it in Settings → Data.
markdown/     Notes and postmortems as markdown, one folder per project
              (_no-project for those without one). File links point into files/.
files/        Uploaded files, named as stored. data.json maps them to their original names.

Importing replaces all data in the app with the contents of this archive.
`;
