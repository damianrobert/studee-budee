export const EXPLAIN_IT_PROMPT =
  "Explain this concept in ~5 sentences as if teaching a colleague who has never seen it. What problem does it solve? How does it work? When would you not use it?";

export const NOTE_TYPE_LABEL = { NOTE: "Note", EXPLAIN_IT: "Explain-it" } as const;

/** Rough plain-text preview of markdown for list rows. */
export function plainPreview(md: string, max = 160): string {
  return md
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
