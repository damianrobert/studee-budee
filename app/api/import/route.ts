import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { sameOrigin } from "@/lib/auth/origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { importExport, parseJson, readArchiveData } from "@/lib/backup";
import { UserError } from "@/lib/utils";
import { ZipReader } from "@/lib/zip";

export const dynamic = "force-dynamic";

/** Upper bound for an uploaded archive (it's written to a temp file, not kept in memory). */
const MAX_IMPORT_BYTES = 20 * 1024 ** 3;

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Replaces all data with an export: the zip from /api/export, or its data.json alone.
 * The body is the raw file. This route is left out of the middleware (which would buffer
 * the whole body in memory), so it checks the session itself.
 */
export async function POST(req: NextRequest) {
  if (!(await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)))
    return error("Unauthorized", 401);
  if (!sameOrigin(req)) return error("Forbidden", 403);
  if (!req.body) return error("Choose an export file to import.");
  const declared = Number(req.headers.get("content-length"));
  if (declared > MAX_IMPORT_BYTES) return error("That file is too large.", 413);

  const tmp = path.join(os.tmpdir(), `studee-import-${randomUUID()}`);
  let zip: ZipReader | null = null;
  try {
    let seen = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        seen += chunk.length;
        cb(seen > MAX_IMPORT_BYTES ? new UserError("That file is too large.", 413) : null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(req.body as import("node:stream/web").ReadableStream),
      limit,
      createWriteStream(tmp),
    );
    if (seen === 0) return error("The file is empty.");

    const fh = await fs.open(tmp, "r");
    const head = Buffer.alloc(4);
    await fh.read(head, 0, 4, 0);
    await fh.close();

    let file;
    if (head.readUInt32LE(0) === 0x04034b50) {
      zip = await ZipReader.open(tmp);
      file = await readArchiveData(zip);
    } else {
      file = parseJson(await fs.readFile(tmp, "utf8"));
    }
    const summary = await importExport(file, zip);
    revalidatePath("/", "layout");
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Problems with the file are reported as-is; anything else only goes to the log.
    if (e instanceof UserError) return error(e.message, e.status);
    console.error("Import failed", e);
    return error("Import failed. See the server log for details.", 500);
  } finally {
    await zip?.close();
    await fs.rm(tmp, { force: true });
  }
}
