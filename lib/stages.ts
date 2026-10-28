import type { LoopStage } from "@prisma/client";

export const STAGES: LoopStage[] = ["PAIN", "BUILD", "BREAK", "EXPLAIN", "DONE"];
/** Stages a session can be in (Done is a topic state only). */
export type SessionStage = Exclude<LoopStage, "DONE">;
export const LOOP_STAGES: SessionStage[] = ["PAIN", "BUILD", "BREAK", "EXPLAIN"];

export const STAGE_INFO: Record<
  LoopStage,
  { label: string; description: string; color: string; dot: string }
> = {
  PAIN: {
    label: "Pain",
    description: "Do it the manual way first, to feel the problem.",
    color: "bg-stage-pain",
    dot: "text-stage-pain",
  },
  BUILD: {
    label: "Build",
    description: "Automate or solve it with the tool.",
    color: "bg-stage-build",
    dot: "text-stage-build",
  },
  BREAK: {
    label: "Break",
    description: "Deliberately break it and debug it.",
    color: "bg-stage-break",
    dot: "text-stage-break",
  },
  EXPLAIN: {
    label: "Explain",
    description: "Write it up in plain words.",
    color: "bg-stage-explain",
    dot: "text-stage-explain",
  },
  DONE: {
    label: "Done",
    description: "Explained, so you actually know it.",
    color: "bg-stage-done",
    dot: "text-stage-done",
  },
};
