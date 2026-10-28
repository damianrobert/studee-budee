"use client";

import * as React from "react";

/** Mirrors STREAM_ERROR in lib/ai/stream.ts (that module is server-only). */
const STREAM_ERROR = "\u0000";

/**
 * Posts JSON to a streaming AI route and exposes the text as it arrives.
 * `run` resolves with the full text, or null when it failed (see `error`).
 */
export function useAiStream() {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [streaming, setStreaming] = React.useState(false);
  const abort = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abort.current?.abort(), []);

  const run = React.useCallback(async (url: string, body: unknown): Promise<string | null> => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setText("");
    setError(null);
    setStreaming(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "The AI couldn't answer. Try again.");
        return null;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        // After an error marker, keep reading: the message may span chunks.
        if (!full.includes(STREAM_ERROR)) setText(full);
      }
      full += decoder.decode();
      const cut = full.indexOf(STREAM_ERROR);
      if (cut >= 0) {
        setText(full.slice(0, cut));
        setError(full.slice(cut + 1) || "The answer was cut off. Try again.");
        return null;
      }
      setText(full);
      return full;
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError("Lost the connection to the server. Try again.");
      return null;
    } finally {
      if (abort.current === ctrl) {
        abort.current = null;
        setStreaming(false);
      }
    }
  }, []);

  const reset = React.useCallback(() => {
    abort.current?.abort();
    setText("");
    setError(null);
  }, []);

  return { text, error, streaming, run, reset };
}
