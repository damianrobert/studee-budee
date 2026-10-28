// Export (all tables → data.json + markdown + uploads, as a zip) and import (replace all).

import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  ARCHIVE_README,
  DATA_FILE,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  FILES_DIR,
  TABLE_LABELS,
  markdownFiles,
  parseExport,
  type ExportData,
  type ExportFile,
  type ExportTable,
} from "./export-format";
import { STORED_NAME } from "./files";
import { storedPath, uploadDir } from "./uploads";
import { UserError } from "./utils";
import type { ZipInput, ZipReader } from "./zip";

const byCreated = { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] };
const idOnly = { select: { id: true } };
const pluckIds = (rows: { id: string }[]) => rows.map((r) => r.id);

export async function loadExportData(): Promise<ExportData> {
  const [
    projects,
    topics,
    topicStageChanges,
    sessions,
    notes,
    postmortems,
    chaosExperiments,
    weeklyRetros,
    readingItems,
    artifacts,
    workObservations,
    files,
    tags,
    flashcards,
    roadmaps,
    roadmapStages,
    roadmapSteps,
    roadmapResources,
    roadmapEdits,
    courses,
    courseModules,
    courseItems,
    coursePractice,
    courseCheckpoints,
    mentorMessages,
    settings,
  ] = await db.$transaction([
    db.project.findMany(byCreated),
    db.topic.findMany(byCreated),
    db.topicStageChange.findMany({ orderBy: [{ changedAt: "asc" }, { id: "asc" }] }),
    db.session.findMany({ orderBy: [{ startedAt: "asc" }, { id: "asc" }] }),
    db.note.findMany({ ...byCreated, include: { tags: idOnly, files: idOnly } }),
    db.postmortem.findMany({ ...byCreated, include: { tags: idOnly, files: idOnly } }),
    db.chaosExperiment.findMany(byCreated),
    db.weeklyRetro.findMany({ orderBy: { weekStart: "asc" } }),
    db.readingItem.findMany({ ...byCreated, include: { tags: idOnly } }),
    db.artifact.findMany(byCreated),
    db.workObservation.findMany({ ...byCreated, include: { tags: idOnly } }),
    db.fileAsset.findMany(byCreated),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.flashcard.findMany(byCreated),
    db.roadmap.findMany(byCreated),
    db.roadmapStage.findMany({
      orderBy: [{ roadmapId: "asc" }, { position: "asc" }, { id: "asc" }],
    }),
    db.roadmapStep.findMany({ orderBy: [{ stageId: "asc" }, { position: "asc" }, { id: "asc" }] }),
    db.roadmapResource.findMany({
      orderBy: [{ stepId: "asc" }, { position: "asc" }, { id: "asc" }],
    }),
    db.roadmapEdit.findMany(byCreated),
    db.course.findMany(byCreated),
    db.courseModule.findMany({
      orderBy: [{ courseId: "asc" }, { position: "asc" }, { id: "asc" }],
    }),
    db.courseItem.findMany({ orderBy: [{ moduleId: "asc" }, { position: "asc" }, { id: "asc" }] }),
    db.coursePractice.findMany({
      orderBy: [{ moduleId: "asc" }, { position: "asc" }, { id: "asc" }],
    }),
    db.courseCheckpoint.findMany({
      orderBy: [{ moduleId: "asc" }, { position: "asc" }, { id: "asc" }],
    }),
    db.mentorMessage.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.setting.findMany({ orderBy: { key: "asc" } }),
  ]);
  return {
    projects,
    topics,
    topicStageChanges,
    sessions,
    notes: notes.map(({ tags, files, ...n }) => ({
      ...n,
      tagIds: pluckIds(tags),
      fileIds: pluckIds(files),
    })),
    postmortems: postmortems.map(({ tags, files, ...p }) => ({
      ...p,
      tagIds: pluckIds(tags),
      fileIds: pluckIds(files),
    })),
    chaosExperiments,
    weeklyRetros,
    readingItems: readingItems.map(({ tags, ...r }) => ({ ...r, tagIds: pluckIds(tags) })),
    artifacts,
    workObservations: workObservations.map(({ tags, ...o }) => ({ ...o, tagIds: pluckIds(tags) })),
    files,
    tags,
    flashcards,
    roadmaps,
    roadmapStages,
    roadmapSteps,
    roadmapResources,
    roadmapEdits,
    courses,
    courseModules,
    courseItems,
    coursePractice,
    courseCheckpoints,
    mentorMessages,
    settings,
  };
}

/** Archive entries; uploads that are missing on disk are skipped (and listed in README). */
export async function* exportEntries(
  data: ExportData,
  { includeFiles }: { includeFiles: boolean },
): AsyncGenerator<ZipInput> {
  const now = new Date();
  const file: Omit<ExportFile, "exportedAt"> & { exportedAt: string } = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
  yield { name: DATA_FILE, data: JSON.stringify(file, null, 2), mtime: now };
  for (const m of markdownFiles(data, process.env.TZ))
    yield { name: m.name, data: m.content, mtime: now };
  const missing: string[] = [];
  if (includeFiles) {
    for (const f of data.files) {
      const p = storedPath(f.storedName);
      const exists = await fs.stat(p).then(
        (s) => s.isFile(),
        () => false,
      );
      if (exists) yield { name: `${FILES_DIR}${f.storedName}`, path: p, mtime: f.createdAt };
      else missing.push(`${f.storedName} (${f.originalName})`);
    }
  }
  const notes = [
    !includeFiles && "\nUploaded files are not included in this archive.\n",
    missing.length && `\nMissing on disk at export time:\n${missing.join("\n")}\n`,
  ].filter(Boolean);
  yield { name: "README.txt", data: ARCHIVE_README + notes.join(""), mtime: now };
}

// --- import -------------------------------------------------------------------------

/** Max size of data.json read into memory from a zip. */
const MAX_DATA_BYTES = 512 * 1024 * 1024;

export async function readArchiveData(zip: ZipReader): Promise<ExportFile> {
  const entry = zip.find(DATA_FILE);
  if (!entry) throw new UserError(`The archive has no ${DATA_FILE}`);
  const raw = await zip.readBuffer(entry, MAX_DATA_BYTES);
  return parseJson(raw.toString("utf8"));
}

export function parseJson(raw: string): ExportFile {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new UserError("Invalid export: data.json isn't valid JSON");
  }
  return parseExport(json);
}

export type ImportSummary = {
  counts: { label: string; count: number }[];
  filesRestored: number;
  filesMissing: number;
};

const CHUNK = 1000;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** Inserts implicit many-to-many rows (`"A"` and `"B"` are the two models' ids, A < B by name). */
async function insertJoin(
  tx: Prisma.TransactionClient,
  table: string,
  pairs: [a: string, b: string][],
) {
  for (const part of chunks(pairs)) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "${table}" ("A", "B") SELECT * FROM unnest($1::text[], $2::text[])`,
      part.map((p) => p[0]),
      part.map((p) => p[1]),
    );
  }
}

const ALL_TABLES = [
  "Project",
  "Topic",
  "TopicStageChange",
  "Session",
  "Note",
  "Postmortem",
  "ChaosExperiment",
  "WeeklyRetro",
  "ReadingItem",
  "Artifact",
  "WorkObservation",
  "FileAsset",
  "Tag",
  "Flashcard",
  "Roadmap",
  "RoadmapStage",
  "RoadmapStep",
  "RoadmapResource",
  "RoadmapEdit",
  "Course",
  "CourseModule",
  "CourseItem",
  "CoursePractice",
  "CourseCheckpoint",
  "MentorMessage",
  "Setting",
];

async function replaceAll(d: ExportData) {
  await db.$transaction(
    async (tx) => {
      // CASCADE also empties the implicit many-to-many tables.
      await tx.$executeRawUnsafe(`TRUNCATE ${ALL_TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
      // Parents before children (foreign keys).
      const create = async <T>(rows: T[], fn: (part: T[]) => Promise<unknown>) => {
        for (const part of chunks(rows)) await fn(part);
      };
      await create(d.projects, (data) => tx.project.createMany({ data }));
      await create(d.topics, (data) => tx.topic.createMany({ data }));
      await create(d.topicStageChanges, (data) => tx.topicStageChange.createMany({ data }));
      await create(d.sessions, (data) => tx.session.createMany({ data }));
      await create(d.chaosExperiments, (data) => tx.chaosExperiment.createMany({ data }));
      await create(d.tags, (data) => tx.tag.createMany({ data }));
      await create(d.files, (data) => tx.fileAsset.createMany({ data }));
      await create(
        d.notes.map(({ tagIds: _t, fileIds: _f, ...n }) => n),
        (data) => tx.note.createMany({ data }),
      );
      await create(
        d.postmortems.map(({ tagIds: _t, fileIds: _f, ...p }) => p),
        (data) => tx.postmortem.createMany({ data }),
      );
      await create(d.weeklyRetros, (data) => tx.weeklyRetro.createMany({ data }));
      await create(
        d.readingItems.map(({ tagIds: _t, ...r }) => r),
        (data) => tx.readingItem.createMany({ data }),
      );
      await create(d.artifacts, (data) => tx.artifact.createMany({ data }));
      await create(
        d.workObservations.map(({ tagIds: _t, ...o }) => o),
        (data) => tx.workObservation.createMany({ data }),
      );
      await create(d.flashcards, (data) => tx.flashcard.createMany({ data }));
      await create(d.roadmaps, (data) => tx.roadmap.createMany({ data }));
      await create(d.roadmapStages, (data) => tx.roadmapStage.createMany({ data }));
      await create(d.roadmapSteps, (data) => tx.roadmapStep.createMany({ data }));
      await create(d.roadmapResources, (data) => tx.roadmapResource.createMany({ data }));
      await create(d.roadmapEdits, (data) => tx.roadmapEdit.createMany({ data }));
      await create(d.courses, (data) => tx.course.createMany({ data }));
      await create(d.courseModules, (data) => tx.courseModule.createMany({ data }));
      await create(d.courseItems, (data) => tx.courseItem.createMany({ data }));
      await create(d.coursePractice, (data) => tx.coursePractice.createMany({ data }));
      await create(d.courseCheckpoints, (data) => tx.courseCheckpoint.createMany({ data }));
      await create(d.mentorMessages, (data) => tx.mentorMessage.createMany({ data }));
      await create(d.settings, (data) => tx.setting.createMany({ data }));

      await insertJoin(
        tx,
        "_NoteToTag",
        d.notes.flatMap((n) => n.tagIds.map((t) => [n.id, t] as [string, string])),
      );
      await insertJoin(
        tx,
        "_FileAssetToNote",
        d.notes.flatMap((n) => n.fileIds.map((f) => [f, n.id] as [string, string])),
      );
      await insertJoin(
        tx,
        "_PostmortemToTag",
        d.postmortems.flatMap((p) => p.tagIds.map((t) => [p.id, t] as [string, string])),
      );
      await insertJoin(
        tx,
        "_FileAssetToPostmortem",
        d.postmortems.flatMap((p) => p.fileIds.map((f) => [f, p.id] as [string, string])),
      );
      await insertJoin(
        tx,
        "_ReadingItemToTag",
        d.readingItems.flatMap((r) => r.tagIds.map((t) => [r.id, t] as [string, string])),
      );
      await insertJoin(
        tx,
        "_TagToWorkObservation",
        d.workObservations.flatMap((o) => o.tagIds.map((t) => [t, o.id] as [string, string])),
      );
    },
    { maxWait: 10_000, timeout: 10 * 60_000 },
  );
}

async function exists(p: string) {
  return fs.stat(p).then(
    (s) => s.isFile(),
    () => false,
  );
}

/**
 * Replaces all data with the export. With a zip, its files are unpacked into a staging
 * folder first and moved into place only after the database commit; uploads that no
 * longer belong to any file record are then removed. Nothing changes if anything fails
 * before the commit.
 */
export async function importExport(
  file: ExportFile,
  zip: ZipReader | null,
): Promise<ImportSummary> {
  const d = file.data;
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  const staging = path.join(dir, `.import-${randomUUID()}`);
  const staged: string[] = [];
  try {
    if (zip) {
      await fs.mkdir(staging);
      for (const f of d.files) {
        const entry = zip.find(`${FILES_DIR}${f.storedName}`);
        if (!entry) continue;
        await pipeline(
          await zip.stream(entry),
          createWriteStream(path.join(staging, f.storedName), { flags: "wx" }),
        );
        staged.push(f.storedName);
      }
    }

    await replaceAll(d);
  } catch (e) {
    await fs.rm(staging, { recursive: true, force: true });
    throw e;
  }

  // Committed: move the files in, then drop uploads nothing points to any more.
  for (const name of staged) await fs.rename(path.join(staging, name), storedPath(name));
  await fs.rm(staging, { recursive: true, force: true });
  const keep = new Set(d.files.map((f) => f.storedName));
  for (const name of await fs.readdir(dir)) {
    if (STORED_NAME.test(name) && !keep.has(name))
      await fs.rm(path.join(dir, name), { force: true });
  }
  let missing = 0;
  for (const f of d.files) if (!(await exists(storedPath(f.storedName)))) missing++;

  return {
    counts: (Object.keys(TABLE_LABELS) as ExportTable[])
      .map((k) => ({ label: TABLE_LABELS[k], count: d[k].length }))
      .filter((c) => c.count > 0),
    filesRestored: staged.length,
    filesMissing: missing,
  };
}
