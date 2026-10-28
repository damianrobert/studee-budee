import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { exportEntries, loadExportData } from "@/lib/backup";
import { todayKey } from "@/lib/time";
import { zipStream } from "@/lib/zip";

export const dynamic = "force-dynamic";

/** Streams everything as a zip. `?files=0` leaves the uploads out. Auth is in the middleware. */
export async function GET(req: NextRequest) {
  const includeFiles = req.nextUrl.searchParams.get("files") !== "0";
  const data = await loadExportData();
  const zip = Readable.from(zipStream(exportEntries(data, { includeFiles })));
  const name = `studee-budee-export-${todayKey()}.zip`;
  return new NextResponse(Readable.toWeb(zip) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
