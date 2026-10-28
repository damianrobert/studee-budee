// Roadmap generation: the JSON shapes the model is asked for, their validators, and how a
// revised plan is merged into the roadmap that exists. Pure (no DB), so it's unit tested.

import { z } from "zod";
import type { ResourceKind } from "@prisma/client";
import { RESOURCE_KINDS, urlKey } from "@/lib/roadmaps";
import type { GeminiSchema } from "./gemini";
import type { SearchResult } from "./brave";

export const STAGES_MAX = 10;
export const STEPS_PER_STAGE_MAX = 8;
export const QUERIES_MAX = 3;
/** Resources picked per step in one go. */
export const PICKS_MAX = 5;

const str = (description?: string): GeminiSchema => ({ type: "STRING", description });
const queries: GeminiSchema = {
  type: "ARRAY",
  items: { type: "STRING" },
  maxItems: QUERIES_MAX,
  description: "precise web search queries that would find the best learning resources for it",
};

const planStep = (revise: boolean): GeminiSchema => ({
  type: "OBJECT",
  properties: {
    ...(revise && { id: str("id of the existing step this is; leave out for a new step") }),
    title: str(),
    description: str("2–3 sentences: what to learn and why it matters"),
    practice: str("one hands-on exercise for this step"),
    searchQueries: queries,
    ...(revise && {
      findResources: {
        type: "BOOLEAN",
        description: "true when this existing step should get more or different resources",
      },
    }),
  },
  required: ["title", "description", "practice", "searchQueries"],
});

const planSchema = (revise: boolean): GeminiSchema => ({
  type: "OBJECT",
  properties: {
    title: str(),
    summary: str("1–2 sentences: who it's for and where it ends"),
    ...(revise && { changeSummary: str("1–2 sentences, past tense: what you changed") }),
    // No maxItems on stages/steps: Gemini rejects the schema ("invalid argument") with both
    // nested limits. The prompt asks for sensible sizes and parsePlan() caps them.
    stages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          ...(revise && { id: str("id of the existing stage; leave out for a new stage") }),
          title: str(),
          description: str("1–2 sentences"),
          steps: { type: "ARRAY", items: planStep(revise) },
        },
        required: ["title", "description", "steps"],
      },
    },
  },
  required: ["title", "summary", "stages", ...(revise ? ["changeSummary"] : [])],
});

export const PLAN_SCHEMA = planSchema(false);
export const REVISE_SCHEMA = planSchema(true);

export const STEP_REVISE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    title: str(),
    description: str(),
    practice: str(),
    findResources: {
      type: "BOOLEAN",
      description: "true when new resources should be searched for",
    },
    searchQueries: queries,
    changeSummary: str("1–2 sentences, past tense: what you changed"),
  },
  required: ["title", "description", "practice", "findResources", "searchQueries", "changeSummary"],
};

const kind: GeminiSchema = { type: "STRING", enum: [...RESOURCE_KINDS] };

/** Picking from search results: the model can only refer to results by id. */
export const PICK_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          step: str("the step's key"),
          resources: {
            type: "ARRAY",
            maxItems: PICKS_MAX,
            items: {
              type: "OBJECT",
              properties: {
                result: str("id of the search result"),
                title: str("a clean, short title"),
                kind,
                note: str("one sentence: what it covers and how to use it for this step"),
              },
              required: ["result", "title", "kind", "note"],
            },
          },
        },
        required: ["step", "resources"],
      },
    },
  },
  required: ["steps"],
};

/** Without web search the model suggests well-known resources itself. */
export const SUGGEST_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          step: str("the step's key"),
          resources: {
            type: "ARRAY",
            maxItems: PICKS_MAX,
            items: {
              type: "OBJECT",
              properties: { url: str(), title: str(), kind, note: str() },
              required: ["url", "title", "kind", "note"],
            },
          },
        },
        required: ["step", "resources"],
      },
    },
  },
  required: ["steps"],
};

// --- Validation

const text = z.string().trim().min(1);
const optText = z
  .string()
  .nullish()
  .transform((s) => s?.trim() || null);
const queryList = z
  .array(z.string())
  .nullish()
  .transform((qs) =>
    [...new Set((qs ?? []).map((q) => q.trim().slice(0, 200)).filter(Boolean))].slice(
      0,
      QUERIES_MAX,
    ),
  );

const stepSchema = z.object({
  id: optText,
  title: text.max(300),
  description: optText,
  practice: optText,
  searchQueries: queryList,
  findResources: z.boolean().nullish(),
});

const stageSchema = z.object({
  id: optText,
  title: text.max(300),
  description: optText,
  steps: z.array(stepSchema),
});

const planZ = z.object({
  title: text.max(300),
  summary: optText,
  changeSummary: optText,
  stages: z.array(stageSchema),
});

export type PlanStep = z.output<typeof stepSchema>;
export type PlanStage = z.output<typeof stageSchema>;
export type Plan = z.output<typeof planZ>;

/** A plan with at least one step; empty stages are dropped, sizes are capped. */
export function parsePlan(data: unknown): Plan | null {
  const parsed = planZ.safeParse(data);
  if (!parsed.success) return null;
  const stages = parsed.data.stages
    .map((s) => ({ ...s, steps: s.steps.slice(0, STEPS_PER_STAGE_MAX) }))
    .filter((s) => s.steps.length)
    .slice(0, STAGES_MAX);
  if (!stages.length) return null;
  return { ...parsed.data, stages };
}

const stepReviseZ = z.object({
  title: text.max(300),
  description: optText,
  practice: optText,
  findResources: z.boolean(),
  searchQueries: queryList,
  changeSummary: text,
});
export type StepRevision = z.output<typeof stepReviseZ>;

export function parseStepRevision(data: unknown): StepRevision | null {
  const parsed = stepReviseZ.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export type NewResource = {
  title: string;
  url: string;
  kind: ResourceKind;
  note: string | null;
  origin: "SEARCH" | "AI";
};

const kindZ = z.enum(RESOURCE_KINDS as [ResourceKind, ...ResourceKind[]]).catch("OTHER");

const pickZ = z.object({
  steps: z.array(
    z.object({
      step: z.string(),
      resources: z.array(
        z.object({
          result: z.string().optional(),
          url: z.string().optional(),
          title: z.string().nullish(),
          kind: kindZ,
          note: optText,
        }),
      ),
    }),
  ),
});

/**
 * Resources per step key. With `results`, only ids of real search results are accepted and
 * the URL always comes from the result; without, the model's own http(s) URLs are used.
 * Links the step already has (`existing`) and repeats are dropped.
 */
export function parsePicks(
  data: unknown,
  stepKeys: Set<string>,
  results: Map<string, SearchResult> | null,
  existing: Map<string, Set<string>> = new Map(),
): Map<string, NewResource[]> {
  const out = new Map<string, NewResource[]>();
  const parsed = pickZ.safeParse(data);
  if (!parsed.success) return out;
  for (const s of parsed.data.steps) {
    if (!stepKeys.has(s.step)) continue;
    const seen = new Set(existing.get(s.step));
    const list = out.get(s.step) ?? [];
    for (const r of s.resources) {
      const hit = results ? results.get(r.result ?? "") : null;
      const url = results ? hit?.url : r.url?.trim();
      if (!url || !/^https?:\/\/[^/\s]+\.[^/\s]+/.test(url)) continue;
      const key = urlKey(url);
      if (seen.has(key) || list.length >= PICKS_MAX) continue;
      seen.add(key);
      list.push({
        title: (r.title?.trim() || hit?.title || url).slice(0, 300),
        url,
        kind: r.kind,
        note: r.note,
        origin: results ? "SEARCH" : "AI",
      });
    }
    out.set(s.step, list);
  }
  return out;
}

// --- Merging a revised plan into the roadmap

export type CurrentRoadmap = { stages: { id: string; steps: { id: string }[] }[] };

export type MergedStep = {
  /** The existing step this updates, or null for a new one. */
  id: string | null;
  title: string;
  description: string | null;
  practice: string | null;
  searchQueries: string[];
  /** New steps always get resources; existing ones when the model asked for more. */
  research: boolean;
};
export type MergedStage = {
  id: string | null;
  title: string;
  description: string | null;
  steps: MergedStep[];
};
export type Merge = { stages: MergedStage[]; deleteStageIds: string[]; deleteStepIds: string[] };

/**
 * Matches the plan to what exists by id: a known id updates that stage/step (steps may move
 * between stages, keeping their status and resources), an unknown, missing or repeated id
 * makes a new one, and whatever the plan left out is deleted.
 */
export function mergePlan(current: CurrentRoadmap, plan: Plan): Merge {
  const stageIds = new Set(current.stages.map((s) => s.id));
  const stepIds = new Set(current.stages.flatMap((s) => s.steps.map((t) => t.id)));
  const usedStages = new Set<string>();
  const usedSteps = new Set<string>();
  const claim = (id: string | null, known: Set<string>, used: Set<string>) => {
    if (!id || !known.has(id) || used.has(id)) return null;
    used.add(id);
    return id;
  };

  const stages = plan.stages.map((s) => ({
    id: claim(s.id, stageIds, usedStages),
    title: s.title,
    description: s.description,
    steps: s.steps.map((t) => {
      const id = claim(t.id, stepIds, usedSteps);
      return {
        id,
        title: t.title,
        description: t.description,
        practice: t.practice,
        searchQueries: t.searchQueries.length ? t.searchQueries : [t.title],
        research: !id || !!t.findResources,
      };
    }),
  }));
  return {
    stages,
    deleteStageIds: [...stageIds].filter((id) => !usedStages.has(id)),
    deleteStepIds: [...stepIds].filter((id) => !usedSteps.has(id)),
  };
}
