/** Tag names are lower-case kebab words: "AI Infra " → "ai-infra". */
export function normalizeTag(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_.+-]/gu, "")
    .slice(0, 40);
}

export function normalizeTags(names: string[]): string[] {
  return [...new Set(names.map(normalizeTag).filter(Boolean))].slice(0, 20);
}

/** Prisma `tags` relation update that replaces the set, creating tags on the fly. */
export function setTags(names: string[]) {
  return {
    set: [],
    connectOrCreate: normalizeTags(names).map((name) => ({ where: { name }, create: { name } })),
  };
}
