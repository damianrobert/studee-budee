// Global search hits: shared by the search API (lib/search.ts) and the Ctrl/Cmd+K dialog.

export type SearchKind = "note" | "postmortem" | "topic" | "reading" | "work";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string | null;
  /** Shown next to the title: project name, reading source, "open question"… */
  meta: string | null;
  href: string;
};

export const SEARCH_KINDS: { kind: SearchKind; label: string }[] = [
  { kind: "note", label: "Notes" },
  { kind: "postmortem", label: "Postmortems" },
  { kind: "topic", label: "Topics" },
  { kind: "reading", label: "Reading" },
  { kind: "work", label: "Work log" },
];

/**
 * Where a hit opens. Reading items and observations have no page of their own: their list
 * highlights and scrolls to `?hl=<id>`.
 */
export function searchHref(
  kind: SearchKind,
  r: { id: string; projectId?: string | null; status?: string | null },
) {
  switch (kind) {
    case "note":
      return `/notes/${r.id}`;
    case "postmortem":
      return `/postmortems/${r.id}`;
    case "topic":
      return `/projects/${r.projectId}?topic=${r.id}`;
    case "reading": {
      const tab = r.status && r.status !== "UNREAD" ? `tab=${r.status.toLowerCase()}&` : "";
      return `/reading?${tab}hl=${r.id}`;
    }
    case "work":
      return `/work?hl=${r.id}`;
  }
}

/** First line of a multi-line text, for titles of things that don't have one. */
export function firstLine(text: string, max = 120): string {
  const line = text.trim().split("\n", 1)[0]!.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
