import { UserError, type ActionResult } from "@/lib/utils";
import { aiEnabled } from "./config";

/** Runs an AI action: refuses when AI is off and turns failures into a friendly message. */
export async function runAi<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  if (!aiEnabled()) return { ok: false, error: "AI features are turned off." };
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("[ai]", e);
    return { ok: false, error: "Something went wrong talking to the AI. Try again." };
  }
}
