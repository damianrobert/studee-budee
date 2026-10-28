// Chaos Lab helpers shared by the page, the picker and the actions. No server APIs here.

export const CHAOS_CATEGORIES = [
  "containers",
  "networking",
  "storage",
  "config",
  "kubernetes",
  "ci",
  "backups",
  "security",
] as const;

export const DIFFICULTY_LABEL = { 1: "Easy", 2: "Medium", 3: "Hard" } as const;

/** Category names are lower-case words, like tags: "Config / Secrets" → "config-secrets". */
export function normalizeCategory(name: string | null | undefined): string | null {
  const c = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return c || null;
}

export type PickFilter = { category?: string | null; difficulty?: number | null };

/** A random incomplete experiment matching the filter, avoiding `exclude` when possible. */
export function pickExperiment<
  T extends { id: string; category: string | null; difficulty: number; completedAt: Date | null },
>(all: T[], filter: PickFilter = {}, exclude?: string | null, random = Math.random): T | null {
  const pool = all.filter(
    (e) =>
      !e.completedAt &&
      (!filter.category || e.category === filter.category) &&
      (!filter.difficulty || e.difficulty === filter.difficulty),
  );
  const fresh = pool.length > 1 ? pool.filter((e) => e.id !== exclude) : pool;
  if (!fresh.length) return null;
  return fresh[Math.floor(random() * fresh.length)] ?? null;
}
