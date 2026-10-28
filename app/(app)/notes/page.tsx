import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { NotebookPen, Pin, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { searchNotes } from "@/lib/search";
import { plainPreview } from "@/lib/notes";
import { getProjectOptions } from "@/lib/sessions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { NoteFilters } from "@/components/notes/note-filters";
import { ExplainItBadge } from "@/components/notes/note-type-badge";
import { SearchSnippet } from "@/components/search-snippet";

export const metadata = { title: "Notes" };

type SP = { q?: string; project?: string; topic?: string; tag?: string; type?: string };

export default async function NotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";

  const where: Prisma.NoteWhereInput = {};
  if (sp.project === "none") where.projectId = null;
  else if (sp.project) where.projectId = sp.project;
  if (sp.topic) where.topicId = sp.topic;
  if (sp.type === "NOTE" || sp.type === "EXPLAIN_IT") where.type = sp.type;
  if (sp.tag) where.tags = { some: { name: sp.tag } };

  const hits = q ? await searchNotes(q) : null;
  if (hits) where.id = { in: hits.map((h) => h.id) };

  const [notes, projects, tags] = await Promise.all([
    db.note.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 300,
      select: {
        id: true,
        title: true,
        type: true,
        pinned: true,
        updatedAt: true,
        content: !hits,
        project: { select: { name: true } },
        topic: { select: { title: true } },
        tags: { select: { name: true }, orderBy: { name: "asc" } },
      },
    }),
    getProjectOptions(),
    db.tag.findMany({
      where: { notes: { some: {} } },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  // With a search, keep pinned first and then order by relevance.
  const rank = new Map(hits?.map((h, i) => [h.id, i]));
  const snippets = new Map(hits?.map((h) => [h.id, h.snippet]));
  if (hits)
    notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || rank.get(a.id)! - rank.get(b.id)!);
  const filtered = !!(q || sp.project || sp.topic || sp.tag || sp.type);

  return (
    <>
      <PageHeader
        title="Notes"
        description="Your own words. Explain-it notes are what move a topic to Done."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/notes/new?type=EXPLAIN_IT">Explain-it note</Link>
            </Button>
            <Button asChild>
              <Link href="/notes/new">
                <Plus aria-hidden /> New note
              </Link>
            </Button>
          </>
        }
      />
      <NoteFilters projects={projects} tags={tags.map((t) => t.name)} />
      {notes.length ? (
        <ul className="divide-y rounded-xl border">
          {notes.map((n) => {
            const snippet = snippets.get(n.id);
            const preview = n.content && plainPreview(n.content);
            return (
              <li key={n.id}>
                <Link href={`/notes/${n.id}`} className="block space-y-1 p-4 hover:bg-accent/40">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {n.pinned && (
                      <Pin className="size-3.5 text-muted-foreground" aria-label="Pinned" />
                    )}
                    <span className="font-medium">{n.title}</span>
                    {n.type === "EXPLAIN_IT" && <ExplainItBadge />}
                    {n.project && (
                      <span className="text-muted-foreground">
                        {n.project.name}
                        {n.topic && ` · ${n.topic.title}`}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {fmtDate(n.updatedAt)}
                    </span>
                  </div>
                  {(snippet || preview) && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {snippet ? <SearchSnippet text={snippet} /> : preview}
                    </p>
                  )}
                  {n.tags.length > 0 && (
                    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {n.tags.map((t) => (
                        <span key={t.name}>#{t.name}</span>
                      ))}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : filtered ? (
        <EmptyState icon={<NotebookPen />} title="No matching notes">
          Try fewer words or clear a filter.
        </EmptyState>
      ) : (
        <EmptyState
          icon={<NotebookPen />}
          title="No notes yet"
          action={
            <Button asChild>
              <Link href="/notes/new">Write your first note</Link>
            </Button>
          }
        >
          Notes hold what you learn in your own words. Link them to a project and topic so they show
          up on the board.
        </EmptyState>
      )}
    </>
  );
}
