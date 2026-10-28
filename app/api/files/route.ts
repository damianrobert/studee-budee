import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { fileUrl } from "@/lib/files";
import { maxUploadMb, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** Multipart upload: one or more `file` fields, optional `projectId`. */
export async function POST(req: NextRequest) {
  const maxBytes = maxUploadMb() * 1024 * 1024;
  const tooLarge = () =>
    NextResponse.json({ error: `Files can be at most ${maxUploadMb()} MB.` }, { status: 413 });
  // Allow a little multipart overhead on top of the file size limit.
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes + 1024 * 1024) return tooLarge();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (files.length > 20)
    return NextResponse.json({ error: "Upload at most 20 files at once." }, { status: 400 });
  if (files.some((f) => f.size > maxBytes)) return tooLarge();

  const rawProject = form.get("projectId");
  let projectId: string | null = null;
  if (typeof rawProject === "string" && rawProject) {
    const p = await db.project.findUnique({ where: { id: rawProject }, select: { id: true } });
    if (!p) return NextResponse.json({ error: "Unknown project." }, { status: 400 });
    projectId = p.id;
  }

  const saved = [];
  for (const f of files) saved.push(await saveUpload(f, projectId));
  revalidatePath("/files");
  if (projectId) revalidatePath(`/projects/${projectId}`);

  return NextResponse.json({
    files: saved.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      url: fileUrl(f.id),
    })),
  });
}
