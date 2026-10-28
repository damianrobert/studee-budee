import { Prisma } from "@prisma/client";
import { db } from "./db";
import { firstLine, searchHref, type SearchHit, type SearchKind } from "./search-hits";

// Postgres full-text search. Matches are wrapped in chr(1)…chr(2) in snippets
// so the UI can highlight them without rendering HTML (see SearchSnippet).

export type NoteHit = { id: string; rank: number; snippet: string | null };

/** Notes matching `q` (stemmed full text, or a title substring), best first. */
export async function searchNotes(q: string, limit = 200): Promise<NoteHit[]> {
  const query = q.trim().slice(0, 200);
  if (!query) return [];
  const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db.$queryRaw<NoteHit[]>`
    SELECT id,
           ts_rank("searchVector", q)::float + (CASE WHEN title ILIKE ${like} THEN 1 ELSE 0 END) AS rank,
           ts_headline('english', content, q,
             'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', MaxWords=24, MinWords=10, MaxFragments=1')
             AS snippet
    FROM "Note", websearch_to_tsquery('english', ${query}) q
    WHERE "searchVector" @@ q OR title ILIKE ${like}
    ORDER BY rank DESC
    LIMIT ${limit}`;
}

// ---- Global search (Ctrl/Cmd+K) ----

type Row = {
  id: string;
  title: string | null;
  snippet: string | null;
  meta: string | null;
  // Only some kinds use these to build the link.
  projectId?: string | null;
  status?: string | null;
};

const HEADLINE_OPTS = Prisma.sql`'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', MaxWords=20, MinWords=8, MaxFragments=1'`;

/**
 * Searches notes, postmortems, topics, reading items and work observations (stemmed full
 * text on the generated `searchVector` columns, plus a title substring match), at most
 * `perKind` hits each, best first within a kind.
 */
export async function searchAll(q: string, perKind = 6): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 200);
  if (!query) return [];
  const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const [notes, postmortems, topics, reading, work] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT n.id, n.title, p.name AS meta,
             ts_headline('english', n.content, q, ${HEADLINE_OPTS}) AS snippet
      FROM "Note" n LEFT JOIN "Project" p ON p.id = n."projectId",
           websearch_to_tsquery('english', ${query}) q
      WHERE n."searchVector" @@ q OR n.title ILIKE ${like}
      ORDER BY ts_rank(n."searchVector", q) + (CASE WHEN n.title ILIKE ${like} THEN 1 ELSE 0 END) DESC,
               n."updatedAt" DESC
      LIMIT ${perKind}`,
    db.$queryRaw<Row[]>`
      SELECT m.id, m.title, p.name AS meta,
             ts_headline('english',
               concat_ws(' · ', m."whatBroke", m."rootCause", m.symptoms, m.investigation, m.fix, m.lessons),
               q, ${HEADLINE_OPTS}) AS snippet
      FROM "Postmortem" m LEFT JOIN "Project" p ON p.id = m."projectId",
           websearch_to_tsquery('english', ${query}) q
      WHERE m."searchVector" @@ q OR m.title ILIKE ${like}
      ORDER BY ts_rank(m."searchVector", q) + (CASE WHEN m.title ILIKE ${like} THEN 1 ELSE 0 END) DESC,
               m."occurredAt" DESC
      LIMIT ${perKind}`,
    db.$queryRaw<Row[]>`
      SELECT t.id, t.title, t."projectId", p.name AS meta,
             CASE WHEN t.description IS NULL OR t.description = '' THEN NULL
                  ELSE ts_headline('english', t.description, q, ${HEADLINE_OPTS}) END AS snippet
      FROM "Topic" t JOIN "Project" p ON p.id = t."projectId",
           websearch_to_tsquery('english', ${query}) q
      WHERE t."searchVector" @@ q OR t.title ILIKE ${like}
      ORDER BY ts_rank(t."searchVector", q) + (CASE WHEN t.title ILIKE ${like} THEN 1 ELSE 0 END) DESC,
               t."updatedAt" DESC
      LIMIT ${perKind}`,
    db.$queryRaw<Row[]>`
      SELECT r.id, coalesce(r.title, r.url) AS title, r.status::text AS status, r.source AS meta,
             CASE WHEN r.takeaway IS NULL THEN NULL
                  ELSE ts_headline('english', r.takeaway, q, ${HEADLINE_OPTS}) END AS snippet
      FROM "ReadingItem" r, websearch_to_tsquery('english', ${query}) q
      WHERE r."searchVector" @@ q OR r.title ILIKE ${like} OR r.url ILIKE ${like}
      ORDER BY ts_rank(r."searchVector", q) + (CASE WHEN r.title ILIKE ${like} THEN 1 ELSE 0 END) DESC,
               r."createdAt" DESC
      LIMIT ${perKind}`,
    db.$queryRaw<Row[]>`
      SELECT w.id, w.content AS title,
             CASE WHEN w.question IS NOT NULL AND NOT w.resolved THEN 'Open question' END AS meta,
             CASE WHEN coalesce(w.question, w.answer) IS NULL THEN NULL
                  ELSE ts_headline('english', concat_ws(' · ', w.question, w.answer), q, ${HEADLINE_OPTS})
             END AS snippet
      FROM "WorkObservation" w, websearch_to_tsquery('english', ${query}) q
      WHERE w."searchVector" @@ q OR w.content ILIKE ${like}
      ORDER BY ts_rank(w."searchVector", q) + (CASE WHEN w.content ILIKE ${like} THEN 1 ELSE 0 END) DESC,
               w."createdAt" DESC
      LIMIT ${perKind}`,
  ]);

  const hits = (kind: SearchKind, rows: Row[]): SearchHit[] =>
    rows.map((r) => ({
      kind,
      id: r.id,
      title: firstLine(r.title || "Untitled"),
      snippet: r.snippet,
      meta: r.meta,
      href: searchHref(kind, r),
    }));
  return [
    ...hits("note", notes),
    ...hits("postmortem", postmortems),
    ...hits("topic", topics),
    ...hits("reading", reading),
    ...hits("work", work),
  ];
}
