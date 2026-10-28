"use client";

import { reviseStep } from "@/lib/actions/roadmaps";
import { PromptBox } from "./prompt-box";

export function StepPrompt({ stepId, webSearch }: { stepId: string; webSearch: boolean }) {
  return (
    <PromptBox
      id="step-prompt"
      label="Ask the AI about this step"
      placeholder="e.g. Find a hands-on lab, or make the practice task harder"
      suggestions={[
        "Find more resources",
        "Find a good video",
        "Something more beginner-friendly",
        "Make the practice task harder",
      ]}
      working={
        webSearch ? "Searching the web and picking the best results…" : "Looking for resources…"
      }
      onSubmit={async (prompt) => {
        const res = await reviseStep(stepId, prompt);
        return res.ok ? { ok: true, summary: res.data?.summary ?? "Done." } : res;
      }}
    />
  );
}
