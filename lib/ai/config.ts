// Server-only: reads the API key. Never import this from a client component.

/**
 * Gemini 3.5 Flash: a stable (non-preview) Flash model. Fast and cheap enough for hints,
 * quizzes and grading, and good at following the "hints, not answers" rules and at
 * returning structured JSON. Override with GEMINI_MODEL.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

export type AiConfig = { apiKey: string; model: string; baseUrl: string };

export function aiConfig(): AiConfig | null {
  const apiKey = (process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY)?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  };
}

/** AI UI is hidden entirely when no key is set. */
export function aiEnabled(): boolean {
  return aiConfig() !== null;
}

/** Brave Search finds real pages for roadmap resources; without it the model suggests them. */
export function braveSearchKey(): string | null {
  return process.env.BRAVE_SEARCH_API_KEY?.trim() || null;
}
