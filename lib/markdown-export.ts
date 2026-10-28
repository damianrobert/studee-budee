// Serializes notes to portable markdown files (single-note export, and the zip export later).

function yamlString(s: string): string {
  return JSON.stringify(s);
}

export function noteToMarkdown(note: {
  title: string;
  content: string;
  type: "NOTE" | "EXPLAIN_IT";
  createdAt: Date;
  updatedAt: Date;
  project?: { name: string } | null;
  topic?: { title: string } | null;
  tags?: { name: string }[];
}): string {
  const front = [
    `title: ${yamlString(note.title)}`,
    `type: ${note.type === "EXPLAIN_IT" ? "explain-it" : "note"}`,
    note.project && `project: ${yamlString(note.project.name)}`,
    note.topic && `topic: ${yamlString(note.topic.title)}`,
    note.tags?.length && `tags: [${note.tags.map((t) => yamlString(t.name)).join(", ")}]`,
    `created: ${note.createdAt.toISOString()}`,
    `updated: ${note.updatedAt.toISOString()}`,
  ].filter(Boolean);
  return `---\n${front.join("\n")}\n---\n\n# ${note.title}\n\n${note.content.trim()}\n`;
}

/** Lower-case ASCII words joined by dashes ("" if nothing is left). */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** A safe, readable file name like `how-dns-works.md`. */
export function slugFileName(title: string, ext = "md"): string {
  return `${slugify(title) || "untitled"}.${ext}`;
}
