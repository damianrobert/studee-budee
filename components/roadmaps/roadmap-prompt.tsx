"use client";

import * as React from "react";
import { Select } from "@/components/ui/input";
import { reviseRoadmap } from "@/lib/actions/roadmaps";
import { PromptBox } from "./prompt-box";

/** Change the whole roadmap, or one stage of it, with a prompt. */
export function RoadmapPrompt({
  roadmapId,
  stages,
  webSearch,
}: {
  roadmapId: string;
  stages: { id: string; title: string }[];
  webSearch: boolean;
}) {
  const [stageId, setStageId] = React.useState("");
  const stage = stages.find((s) => s.id === stageId);
  return (
    <PromptBox
      id="roadmap-prompt"
      label="Change the roadmap"
      placeholder={
        stage
          ? `What should change in “${stage.title}”?`
          : "e.g. Add a stage on observability before the capstone, or drop the Helm steps"
      }
      suggestions={
        stage
          ? [
              "Find more resources for this stage",
              "Split it into smaller steps",
              "Add a video for each step",
            ]
          : [
              "Find more resources for every step",
              "Make it shorter",
              "Add a capstone project stage",
            ]
      }
      working={`Reworking the roadmap${webSearch ? " and searching the web for new resources" : ""}. This can take a minute.`}
      onSubmit={async (prompt) => {
        const res = await reviseRoadmap(roadmapId, prompt, stageId || undefined);
        return res.ok ? { ok: true, summary: res.data ?? "Done." } : res;
      }}
      extra={
        <Select
          aria-label="What to change"
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="h-8 w-auto max-w-48 text-xs"
        >
          <option value="">Whole roadmap</option>
          {stages.map((s, i) => (
            <option key={s.id} value={s.id}>
              Stage {i + 1}: {s.title}
            </option>
          ))}
        </Select>
      }
    />
  );
}
