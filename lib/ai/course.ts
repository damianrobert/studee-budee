// Course building: the JSON shape Gemini returns when it arranges a resources file into a
// course, and its validator. Items refer to resources by id only, so the model can't add a
// link that isn't in the file. Pure (no DB), so it's unit tested.

import { z } from "zod";
import {
  CHECKPOINTS_MAX,
  ITEMS_PER_MODULE_MAX,
  MODULES_MAX,
  PRACTICE_MAX,
  PRACTICE_STAGES,
  type CoursePlan,
  type Library,
  type PlanModule,
} from "@/lib/courses";
import type { GeminiSchema } from "./gemini";

const str = (description?: string): GeminiSchema => ({ type: "STRING", description });

// No maxItems on nested arrays: Gemini rejects schemas with several nested limits.
// The prompt asks for sensible sizes and parseCoursePlan() caps them.
export const COURSE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    title: str("short course title, ≤ 8 words"),
    description: str("1–2 sentences: who it's for and where it ends"),
    level: { type: "STRING", enum: ["beginner", "intermediate", "advanced"] },
    outcomes: {
      type: "ARRAY",
      items: str(),
      description: "3–6 things the learner can do at the end",
    },
    modules: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: str(),
          goal: str("one sentence: what the learner can do after this module"),
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                resource: str("the resource's id, exactly as given"),
                required: { type: "BOOLEAN" },
                why: str("one line on why it's here, specific to this module"),
                sections: {
                  type: "ARRAY",
                  items: str(),
                  description: "optional: the parts of a long page to focus on",
                },
              },
              required: ["resource", "required", "why"],
            },
          },
          practice: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                stage: { type: "STRING", enum: [...PRACTICE_STAGES] },
                task: str(),
                doneWhen: str("how the learner checks it's done"),
              },
              required: ["stage", "task", "doneWhen"],
            },
          },
          checkpoint: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { question: str(), answer: str("short") },
              required: ["question", "answer"],
            },
          },
        },
        required: ["title", "goal", "items", "practice", "checkpoint"],
      },
    },
    gaps: {
      type: "ARRAY",
      items: str(),
      description: "what the course needs that no resource covers, one line each",
    },
  },
  required: ["title", "description", "level", "outcomes", "modules", "gaps"],
};

const text = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => s?.trim().slice(0, max) || null);

const planSchema = z.object({
  title: text(300),
  description: text(2000),
  level: text(30),
  outcomes: z.array(z.string()).nullish(),
  modules: z.array(
    z.object({
      title: text(300),
      goal: text(1000),
      items: z
        .array(
          z.object({
            resource: z.string(),
            required: z.boolean().nullish(),
            why: text(1000),
            sections: z.array(z.string()).nullish(),
          }),
        )
        .nullish(),
      practice: z
        .array(z.object({ stage: z.string().nullish(), task: text(2000), doneWhen: text(1000) }))
        .nullish(),
      checkpoint: z.array(z.object({ question: text(1000), answer: text(2000) })).nullish(),
    }),
  ),
  gaps: z.array(z.string()).nullish(),
});

const clean = (list: string[] | null | undefined, max: number, len = 300) =>
  [...new Set((list ?? []).map((s) => s.trim().slice(0, len)).filter(Boolean))].slice(0, max);

/**
 * Validates the model's course against the library: unknown resource ids are dropped, a
 * resource is used once per module, empty modules go, and every module keeps at least one
 * required item. Returns null when nothing usable is left.
 */
export function parseCoursePlan(data: unknown, lib: Library): CoursePlan | null {
  const parsed = planSchema.safeParse(data);
  if (!parsed.success) return null;
  const p = parsed.data;
  const known = new Set(lib.resources.map((r) => r.key));

  const modules: PlanModule[] = [];
  for (const m of p.modules) {
    const seen = new Set<string>();
    const items = (m.items ?? [])
      .map((i) => ({ ...i, resource: i.resource.trim() }))
      .filter((i) => known.has(i.resource) && !seen.has(i.resource) && seen.add(i.resource))
      .slice(0, ITEMS_PER_MODULE_MAX)
      .map((i) => ({
        resourceKey: i.resource,
        required: i.required ?? true,
        why: i.why,
        sections: clean(i.sections, 8, 200),
      }));
    if (!items.length) continue;
    if (!items.some((i) => i.required)) items[0]!.required = true;
    modules.push({
      title: m.title ?? `Module ${modules.length + 1}`,
      goal: m.goal,
      items,
      practice: (m.practice ?? [])
        .filter((x) => x.task)
        .slice(0, PRACTICE_MAX)
        .map((x) => ({
          stage: PRACTICE_STAGES.find((s) => s === x.stage?.toUpperCase()) ?? "BUILD",
          task: x.task!,
          doneWhen: x.doneWhen,
        })),
      checkpoints: (m.checkpoint ?? [])
        .filter((c) => c.question && c.answer)
        .slice(0, CHECKPOINTS_MAX)
        .map((c) => ({ question: c.question!, answer: c.answer! })),
    });
  }
  if (!modules.length) return null;

  return {
    title: p.title ?? lib.subject,
    description: p.description,
    level: p.level?.toLowerCase() ?? null,
    outcomes: clean(p.outcomes, 8),
    modules: modules.slice(0, MODULES_MAX),
    gaps: clean([...lib.gaps, ...(p.gaps ?? [])], 20, 500),
  };
}
