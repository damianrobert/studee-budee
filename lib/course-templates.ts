// Server-only: reads the course templates shipped in templates/ (copied into the image).

import { readFile } from "node:fs/promises";
import path from "node:path";

const dir = () => path.join(process.cwd(), "templates");

/** The "gather resources" prompt to paste into an LLM: everything below the first `---` line. */
export function gatherPromptBody(markdown: string): string {
  const at = markdown.search(/^---\s*$/m);
  return (at < 0 ? markdown : markdown.slice(at).replace(/^---\s*\n/, "")).trim();
}

export async function courseTemplates(): Promise<{ prompt: string; example: string } | null> {
  try {
    const [prompt, example] = await Promise.all([
      readFile(path.join(dir(), "prompt-1-gather-resources.md"), "utf8"),
      readFile(path.join(dir(), "resources-template.yaml"), "utf8"),
    ]);
    return { prompt: gatherPromptBody(prompt), example };
  } catch (e) {
    console.error("[courses] templates not found:", e);
    return null;
  }
}
