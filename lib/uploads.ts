import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { STORED_NAME, fileExt, mimeFor, sanitizeFileName } from "./files";

// Uploaded files live on disk as <uuid>.<ext>; metadata is in FileAsset.

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || path.resolve("data/uploads");
}

export function maxUploadMb(): number {
  const n = Number(process.env.MAX_UPLOAD_MB);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

/** Absolute path for a stored name; rejects anything that isn't a generated name. */
export function storedPath(storedName: string): string {
  if (!STORED_NAME.test(storedName)) throw new Error("Invalid stored file name");
  return path.join(uploadDir(), storedName);
}

export async function saveUpload(file: File, projectId: string | null) {
  const originalName = sanitizeFileName(file.name);
  const ext = fileExt(originalName);
  const storedName = `${randomUUID()}${ext && /^[a-z0-9]+$/.test(ext) ? `.${ext}` : ""}`;
  await fs.mkdir(uploadDir(), { recursive: true });
  const target = storedPath(storedName);
  await fs.writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  try {
    return await db.fileAsset.create({
      data: {
        originalName,
        storedName,
        mimeType: mimeFor(originalName, file.type),
        sizeBytes: file.size,
        projectId,
      },
    });
  } catch (e) {
    await fs.rm(target, { force: true });
    throw e;
  }
}

export async function removeStoredFile(storedName: string) {
  await fs.rm(storedPath(storedName), { force: true });
}
