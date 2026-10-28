// The "I'm stuck" exchange is stored as a markdown note (tag `stuck`). The note is the
// source of truth: its creation time starts the countdown and its sections hold the hints.
// Pure, so it's shared by the server and the client.

export const STUCK_TAG = "stuck";
export const STUCK_WAIT_MS = 15 * 60_000;
export const MAX_HINTS = 3;

export type StuckAttempt = { goal: string; tried: string; happened: string };
export type StuckState = StuckAttempt & { hints: string[]; outcome: string | null };

const SECTIONS = {
  goal: "What I'm trying to do",
  tried: "What I've tried",
  happened: "What happened",
} as const;
const OUTCOME = "Outcome";
const HINT = /^Hint (\d+)$/;

/** Keeps user and AI text from adding top-level sections (which would confuse the parser). */
export function demoteHeadings(text: string): string {
  return text.trim().replace(/^#{1,2}(?=\s)/gm, "###");
}

export function stuckTitle(goal: string): string {
  const line = goal.trim().split("\n")[0]!.trim();
  return `Stuck: ${line.length > 80 ? `${line.slice(0, 79)}…` : line}`;
}

export function stuckNoteContent(state: StuckState): string {
  const parts = [
    ...(Object.keys(SECTIONS) as (keyof StuckAttempt)[]).map(
      (k) => `## ${SECTIONS[k]}\n\n${demoteHeadings(state[k])}`,
    ),
    ...state.hints.map((h, i) => `## Hint ${i + 1}\n\n${demoteHeadings(h)}`),
  ];
  if (state.outcome !== null) parts.push(`## ${OUTCOME}\n\n${demoteHeadings(state.outcome)}`);
  return `${parts.join("\n\n")}\n`;
}

/** Reads a note written by `stuckNoteContent`. Returns null if it was edited out of shape. */
export function parseStuckNote(content: string): StuckState | null {
  const sections = new Map<string, string>();
  const hints: string[] = [];
  for (const block of `\n${content}`.split(/\n## /).slice(1)) {
    const nl = block.indexOf("\n");
    const heading = (nl < 0 ? block : block.slice(0, nl)).trim();
    const body = nl < 0 ? "" : block.slice(nl + 1).trim();
    const hint = HINT.exec(heading);
    if (hint) {
      if (Number(hint[1]) !== hints.length + 1) return null;
      hints.push(body);
    } else sections.set(heading, body);
  }
  const goal = sections.get(SECTIONS.goal);
  const tried = sections.get(SECTIONS.tried);
  const happened = sections.get(SECTIONS.happened);
  if (goal === undefined || tried === undefined || happened === undefined) return null;
  return { goal, tried, happened, hints, outcome: sections.get(OUTCOME) ?? null };
}

/** Milliseconds until a hint can be asked for (0 = now). */
export function hintWait(createdAt: Date | string, now = Date.now()): number {
  return Math.max(0, new Date(createdAt).getTime() + STUCK_WAIT_MS - now);
}

export function defaultOutcome(hints: number): string {
  return hints
    ? `Solved it after ${hints} hint${hints === 1 ? "" : "s"}.`
    : "Solved it without a hint.";
}
