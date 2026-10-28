import { UserError } from "@/lib/utils";
import { aiConfig, type AiConfig } from "./config";

/** An AI failure with a message that's safe to show (the details are logged on the server). */
export class AiError extends UserError {}

/** A Gemini `responseSchema` (OpenAPI subset). */
export type GeminiSchema = {
  type: "OBJECT" | "ARRAY" | "STRING" | "INTEGER" | "NUMBER" | "BOOLEAN";
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  enum?: string[];
  minItems?: number;
  maxItems?: number;
  description?: string;
};

export type AiRequest = {
  system: string;
  /** Earlier turns of a conversation, oldest first; `prompt` is the newest user turn. */
  history?: { role: "user" | "model"; text: string }[];
  prompt: string;
  /** Ask for JSON matching this schema. */
  schema?: GeminiSchema;
  maxOutputTokens?: number;
  /** How much the model thinks first; "low" keeps hints snappy. */
  thinking?: "low" | "high";
};

const TIMEOUT_MS = 90_000;

type Part = { text?: string; thought?: boolean };
type GeminiResponse = {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

function requireConfig(): AiConfig {
  const config = aiConfig();
  if (!config) throw new AiError("AI features are turned off.", 404);
  return config;
}

/** Gemini 3+ takes a thinking level; 2.x takes a token budget. */
export function thinkingConfig(model: string, level: "low" | "high") {
  if (/^gemini-2\./.test(model)) return { thinkingBudget: level === "low" ? 512 : -1 };
  if (/^gemini-/.test(model)) return { thinkingLevel: level };
  return undefined;
}

export function requestBody(model: string, req: AiRequest) {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [
      ...(req.history ?? []).map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      { role: "user", parts: [{ text: req.prompt }] },
    ],
    generationConfig: {
      maxOutputTokens: req.maxOutputTokens ?? 8192,
      thinkingConfig: thinkingConfig(model, req.thinking ?? "low"),
      ...(req.schema && { responseMimeType: "application/json", responseSchema: req.schema }),
    },
  };
}

async function call(config: AiConfig, method: string, req: AiRequest, query = "") {
  const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:${method}${query}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify(requestBody(config.model, req)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error("[ai] request failed:", e);
    if (e instanceof Error && e.name === "TimeoutError")
      throw new AiError("Gemini took too long to answer. Try again.", 504);
    throw new AiError("Couldn't reach Gemini. Check the server's internet connection.", 502);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ai] Gemini ${res.status}:`, detail.slice(0, 2000));
    throw httpError(res.status, detail, config.model);
  }
  return res;
}

export function httpError(status: number, detail: string, model: string): AiError {
  if (/API_KEY_INVALID|API key not valid/.test(detail) || status === 401 || status === 403)
    return new AiError("Gemini rejected the API key. Check GOOGLE_GEMINI_API_KEY in .env.", 502);
  if (status === 404)
    return new AiError(`The model “${model}” isn't available. Check GEMINI_MODEL in .env.`, 502);
  if (status === 429)
    return new AiError("Gemini's rate limit or quota was hit. Wait a minute and try again.", 429);
  if (status >= 500)
    return new AiError("Gemini is having trouble right now. Try again in a moment.", 502);
  return new AiError("Gemini couldn't handle that request.", 502);
}

/** The answer text of one response or stream chunk (thought parts are skipped). */
export function responseText(data: GeminiResponse): string {
  if (data.promptFeedback?.blockReason)
    throw new AiError("Gemini refused to answer this. Try rewording it.", 422);
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  const reason = candidate?.finishReason;
  if (reason && /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(reason))
    throw new AiError("Gemini stopped answering because of its content filters.", 422);
  return text;
}

/** One complete answer. With a schema, returns the parsed JSON (validate it before use). */
export async function generate(req: AiRequest): Promise<string> {
  const config = requireConfig();
  const res = await call(config, "generateContent", req);
  const data = (await res.json()) as GeminiResponse;
  const text = responseText(data);
  if (!text.trim()) {
    console.error("[ai] empty answer:", JSON.stringify(data).slice(0, 2000));
    throw new AiError("Gemini returned an empty answer. Try again.", 502);
  }
  return text;
}

export async function generateJson(req: AiRequest & { schema: GeminiSchema }): Promise<unknown> {
  const text = await generate(req);
  try {
    return JSON.parse(text);
  } catch {
    console.error("[ai] invalid JSON:", text.slice(0, 2000));
    throw new AiError("Gemini's answer came back garbled. Try again.", 502);
  }
}

/** Splits a server-sent-events stream into the JSON payloads of its `data:` lines. */
export class SseParser {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const events = this.buffer.split("\n\n");
    this.buffer = events.pop() ?? "";
    return events.flatMap(dataOf);
  }

  end(): string[] {
    const rest = dataOf(this.buffer);
    this.buffer = "";
    return rest;
  }
}

function dataOf(event: string): string[] {
  const data = event
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart())
    .join("\n");
  return data ? [data] : [];
}

/** Streams the answer text as it's written. */
export async function* stream(req: AiRequest): AsyncGenerator<string> {
  const config = requireConfig();
  const res = await call(config, "streamGenerateContent", req, "?alt=sse");
  if (!res.body) throw new AiError("Gemini returned an empty answer. Try again.", 502);
  const parser = new SseParser();
  const decoder = new TextDecoder();
  let any = false;
  const texts = function* (payloads: string[]) {
    for (const p of payloads) {
      let data: GeminiResponse;
      try {
        data = JSON.parse(p) as GeminiResponse;
      } catch {
        continue;
      }
      const text = responseText(data);
      if (text) yield text;
    }
  };
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    for (const text of texts(parser.push(decoder.decode(chunk, { stream: true })))) {
      any = true;
      yield text;
    }
  }
  for (const text of texts(parser.end())) {
    any = true;
    yield text;
  }
  if (!any) throw new AiError("Gemini returned an empty answer. Try again.", 502);
}
