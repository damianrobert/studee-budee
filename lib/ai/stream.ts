import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { sameOrigin } from "@/lib/auth/origin";
import { UserError } from "@/lib/utils";
import { aiEnabled } from "./config";

/** Marks a failure after the stream started: everything after it is the error message. */
export const STREAM_ERROR = "\u0000";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function errorMessage(e: unknown): { message: string; status: number } {
  if (e instanceof UserError) return { message: e.message, status: e.status };
  console.error("[ai]", e);
  return { message: "Something went wrong talking to the AI. Try again.", status: 500 };
}

/**
 * Wraps a POST route for a streamed AI answer: AI must be on, same origin, JSON body
 * matching `schema`. The middleware has already checked the session.
 */
export function aiRoute<T>(
  schema: z.ZodType<T>,
  handler: (input: T) => Promise<Response>,
): (req: NextRequest) => Promise<Response> {
  return async (req) => {
    if (!aiEnabled()) return jsonError("AI features are turned off.", 404);
    if (!sameOrigin(req)) return jsonError("Forbidden", 403);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Invalid request");
    try {
      return await handler(parsed.data);
    } catch (e) {
      const { message, status } = errorMessage(e);
      return jsonError(message, status);
    }
  };
}

/**
 * Streams text to the client. The first chunk is awaited before responding, so a failed
 * request (bad key, quota) gets a proper error status. `onDone` runs with the full text
 * once the stream finished without errors.
 */
export async function streamText(
  chunks: AsyncGenerator<string>,
  onDone?: (text: string) => Promise<void>,
): Promise<Response> {
  const first = await chunks.next();
  let full = first.done ? "" : first.value;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (full) controller.enqueue(encoder.encode(full));
      if (first.done) return finish(controller);
    },
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (next.done) return await finish(controller);
        full += next.value;
        controller.enqueue(encoder.encode(next.value));
      } catch (e) {
        controller.enqueue(encoder.encode(STREAM_ERROR + errorMessage(e).message));
        controller.close();
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });

  async function finish(controller: ReadableStreamDefaultController<Uint8Array>) {
    try {
      await onDone?.(full);
    } catch (e) {
      controller.enqueue(encoder.encode(STREAM_ERROR + errorMessage(e).message));
    }
    controller.close();
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
