export const STARTER_READING_TAGS = ["postmortem", "kubernetes", "ai-infra", "career", "video"];

export const READING_TABS = [
  { value: "UNREAD", label: "Unread" },
  { value: "READ", label: "Read" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

/** Accepts "example.com/x" too; returns null for anything that isn't http(s). */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** "https://www.example.com/a" → "example.com" */
export function sourceFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function metaContent(html: string, prop: string): string | null {
  // Attribute order varies: <meta property="og:title" content="…"> or the reverse.
  const p = prop.replace(/[.:]/g, "\\$&");
  const a = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${p}["'][^>]*content\\s*=\\s*("([^"]*)"|'([^']*)')`,
    "i",
  ).exec(html);
  if (a) return a[2] ?? a[3] ?? null;
  const b = new RegExp(
    `<meta[^>]+content\\s*=\\s*("([^"]*)"|'([^']*)')[^>]*(?:property|name)\\s*=\\s*["']${p}["']`,
    "i",
  ).exec(html);
  return b ? (b[2] ?? b[3] ?? null) : null;
}

/** The page title: OpenGraph/Twitter title first, then <title>. */
export function extractTitle(html: string): string | null {
  const raw =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
    null;
  if (!raw) return null;
  const t = decodeEntities(raw).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 300) : null;
}

const MAX_HTML_BYTES = 512 * 1024;

/** Fetches the page's title server-side; null on any failure. Never takes longer than `timeoutMs`. */
export async function fetchTitle(url: string, timeoutMs = 5000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; studee-budee/1.0; +reading-inbox)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok || !res.body) return null;
    if (!/html/i.test(res.headers.get("content-type") ?? "")) return null;
    // Only read the start of the page: the <head> is all we need.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    while (bytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    void reader.cancel().catch(() => {});
    return extractTitle(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
