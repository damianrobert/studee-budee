import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { inlineContentType } from "@/lib/files";
import { storedPath } from "@/lib/uploads";

export const dynamic = "force-dynamic";

function contentDisposition(type: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Serves an uploaded file. Auth is enforced by the middleware. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = /^[a-z0-9]{1,50}$/.test(id)
    ? await db.fileAsset.findUnique({ where: { id } })
    : null;
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let filePath: string;
  let size: number;
  try {
    filePath = storedPath(file.storedName);
    size = (await fs.stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: "File is missing on disk" }, { status: 404 });
  }

  const inlineType = inlineContentType(file.mimeType, file.originalName);
  const download = req.nextUrl.searchParams.has("download") || !inlineType;
  const headers = new Headers({
    "Content-Type": download ? file.mimeType : inlineType!,
    "Content-Length": String(size),
    "Content-Disposition": contentDisposition(
      download ? "attachment" : "inline",
      file.originalName,
    ),
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  });
  // Sandboxing breaks browsers' built-in PDF viewers; every other type gets it.
  if (file.mimeType !== "application/pdf") headers.set("Content-Security-Policy", "sandbox");

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, { headers });
}
