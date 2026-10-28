import type { LoopStage } from "@prisma/client";

export type StageMoveCheck =
  { allowed: true; hint?: "BREAK_FIRST" } | { allowed: false; reason: "NEEDS_EXPLAIN_NOTE" };

/**
 * The Done gate: a topic only reaches Done with at least one explain-it note.
 * Moving into Explain without a postmortem is allowed, with a soft hint.
 */
export function checkStageMove(
  from: LoopStage,
  to: LoopStage,
  counts: { explainNotes: number; postmortems: number },
): StageMoveCheck {
  if (to === "DONE" && from !== "DONE" && counts.explainNotes < 1) {
    return { allowed: false, reason: "NEEDS_EXPLAIN_NOTE" };
  }
  if (to === "EXPLAIN" && from !== "EXPLAIN" && counts.postmortems < 1) {
    return { allowed: true, hint: "BREAK_FIRST" };
  }
  return { allowed: true };
}
