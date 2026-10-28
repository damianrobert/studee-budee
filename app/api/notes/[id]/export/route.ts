import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { noteToMarkdown, slugFileName } from "@/lib/markdown-export";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await db.note.findUnique({
    where: { id },
    include: {
      project: { select: { name: true } },
      topic: { select: { title: true } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(noteToMarkdown(note), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugFileName(note.title)}"`,
      "Cache-Control": "no-store",
    },
  });
}
