import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { searchAll } from "@/lib/search";

export const dynamic = "force-dynamic";

const query = z.string().trim().max(200);

/** Global search (Ctrl/Cmd+K). Auth is enforced by the middleware. */
export async function GET(req: NextRequest) {
  const parsed = query.safeParse(req.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.success) return NextResponse.json({ error: "Query too long" }, { status: 400 });
  const hits = await searchAll(parsed.data);
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
