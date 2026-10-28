// Server-only: finds resources for roadmap steps. With a Brave key, every step's queries are
// searched and the model picks from the real results (so links are never made up); without
// one, the model suggests well-known resources itself.

import { urlKey } from "@/lib/roadmaps";
import { searchAll, type SearchResult } from "./brave";
import { braveSearchKey } from "./config";
import { generateJson } from "./gemini";
import { PICK_SCHEMA, SUGGEST_SCHEMA, parsePicks, type NewResource } from "./roadmap";
import { PICK_SYSTEM, SUGGEST_SYSTEM, pickPrompt, type StepForResearch } from "./prompts";

export type ResearchStep = {
  key: string;
  title: string;
  description: string | null;
  stage: string;
  queries: string[];
  existing: { title: string; url: string }[];
};

/** Steps per model call; the calls run in parallel. */
const BATCH = 10;
const RESULTS_PER_STEP = 10;

export function webSearchEnabled(): boolean {
  return braveSearchKey() !== null;
}

/** New resources per step key (steps where nothing good was found are missing or empty). */
export async function findResources(
  steps: ResearchStep[],
  request: string | null = null,
): Promise<Map<string, NewResource[]>> {
  if (!steps.length) return new Map();
  const search = webSearchEnabled();
  const prepared: StepForResearch[] = search
    ? await withResults(steps)
    : steps.map((s) => ({ ...s, results: [] }));
  const batches: (typeof prepared)[] = [];
  for (let i = 0; i < prepared.length; i += BATCH) batches.push(prepared.slice(i, i + BATCH));

  const maps = await Promise.all(
    batches.map(async (batch) => {
      // Steps whose searches all failed have nothing to pick from.
      const usable = search ? batch.filter((s) => s.results.length) : batch;
      if (!usable.length) return new Map<string, NewResource[]>();
      const byId = new Map<string, SearchResult>();
      for (const s of usable) for (const r of s.results) byId.set(r.id, r);
      const data = await generateJson({
        system: search ? PICK_SYSTEM : SUGGEST_SYSTEM,
        prompt: pickPrompt(usable, request),
        schema: search ? PICK_SCHEMA : SUGGEST_SCHEMA,
        maxOutputTokens: 16_384,
      });
      const existing = new Map(
        usable.map((s) => [s.key, new Set(s.existing.map((e) => urlKey(e.url)))]),
      );
      return parsePicks(data, new Set(usable.map((s) => s.key)), search ? byId : null, existing);
    }),
  );
  return new Map(maps.flatMap((m) => [...m]));
}

/** Searches every query once and gives each step its own deduplicated, numbered results. */
async function withResults(steps: ResearchStep[]): Promise<StepForResearch[]> {
  const queries = [...new Set(steps.flatMap((s) => s.queries))];
  const results = await searchAll(queries);
  const byQuery = new Map(queries.map((q, i) => [q, results[i] ?? []]));
  let n = 0;
  return steps.map((s) => {
    const seen = new Set(s.existing.map((e) => urlKey(e.url)));
    const list: StepForResearch["results"] = [];
    // Interleave the queries' results so each query is represented.
    const lists = s.queries.map((q) => byQuery.get(q) ?? []);
    for (let i = 0; list.length < RESULTS_PER_STEP && lists.some((l) => i < l.length); i++) {
      for (const l of lists) {
        const r = l[i];
        if (!r || list.length >= RESULTS_PER_STEP) continue;
        const key = urlKey(r.url);
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ ...r, id: `r${++n}` });
      }
    }
    return { ...s, results: list };
  });
}
