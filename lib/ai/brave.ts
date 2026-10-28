// Server-only: Brave Search web results, used to find real resources for roadmap steps.

import { braveSearchKey } from "./config";

export type SearchResult = { title: string; url: string; description: string };

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const TIMEOUT_MS = 10_000;
/** Parallel requests; the free plan allows 1/s, paid ones 20–50/s. */
const CONCURRENCY = 4;

type BraveResponse = {
  web?: { results?: { title?: string; url?: string; description?: string }[] };
};

/** Brave marks matches with <strong>; results are shown and sent to the model as plain text. */
export function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export function parseBrave(data: BraveResponse): SearchResult[] {
  return (data.web?.results ?? []).flatMap((r) =>
    r.url && /^https?:\/\//.test(r.url)
      ? [
          {
            title: stripTags(r.title ?? r.url),
            url: r.url,
            description: stripTags(r.description ?? ""),
          },
        ]
      : [],
  );
}

/** One web search. Failures are logged and give no results, so one bad query never sinks a roadmap. */
export async function webSearch(query: string, count = 8): Promise<SearchResult[]> {
  const key = braveSearchKey();
  if (!key) return [];
  const url = `${ENDPOINT}?${new URLSearchParams({ q: query, count: String(count), safesearch: "moderate" })}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "x-subscription-token": key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1100));
        continue;
      }
      if (!res.ok) {
        console.error(`[search] Brave ${res.status}:`, (await res.text()).slice(0, 500));
        return [];
      }
      return parseBrave((await res.json()) as BraveResponse);
    } catch (e) {
      console.error("[search] Brave request failed:", e);
      return [];
    }
  }
  return [];
}

/** Runs the searches a few at a time; results come back in query order. */
export async function searchAll(queries: string[], count?: number): Promise<SearchResult[][]> {
  const out: SearchResult[][] = new Array(queries.length);
  let next = 0;
  const worker = async () => {
    while (next < queries.length) {
      const i = next++;
      out[i] = await webSearch(queries[i]!, count);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queries.length) }, worker));
  return out;
}
