// Postmortem template and the portfolio-ready markdown it copies as. No server APIs here.

export const POSTMORTEM_FIELDS = [
  {
    key: "whatBroke",
    label: "What broke",
    placeholder: "One or two sentences: which system, what stopped working.",
  },
  {
    key: "symptoms",
    label: "Symptoms",
    placeholder: "What you saw: errors, logs, status codes, alerts. Paste the exact text.",
  },
  {
    key: "investigation",
    label: "How I found the cause",
    placeholder: "Commands you ran, what you checked, the dead ends. This is the valuable part.",
  },
  {
    key: "rootCause",
    label: "Root cause",
    placeholder: "Why it really happened, not just the trigger.",
  },
  {
    key: "fix",
    label: "Fix",
    placeholder: "What you changed to recover, and to stop it recurring.",
  },
  {
    key: "lessons",
    label: "What I learned",
    placeholder: "What would you do differently? What would you check first next time?",
  },
] as const;

export type PostmortemFieldKey = (typeof POSTMORTEM_FIELDS)[number]["key"];

export type PostmortemContent = { title: string } & Record<PostmortemFieldKey, string>;

/** All markdown fields joined, e.g. to find the files they link to. */
export function postmortemText(p: Record<PostmortemFieldKey, string>): string {
  return POSTMORTEM_FIELDS.map((f) => p[f.key]).join("\n");
}

/**
 * Clean markdown for a README or blog: no app metadata beyond the date and the kind of
 * incident. App-internal file links (/api/files/…) are kept as-is since only the user
 * can open them; the text around them still reads fine.
 */
export function postmortemToMarkdown(
  p: PostmortemContent & {
    occurredAt: Date;
    wasDeliberate: boolean;
    chaosExperiment?: { title: string } | null;
  },
  tz?: string,
): string {
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "long" }).format(
    p.occurredAt,
  );
  const kind = p.wasDeliberate
    ? `Deliberate failure (chaos experiment${p.chaosExperiment ? `: ${p.chaosExperiment.title}` : ""})`
    : "Real incident";
  const sections = POSTMORTEM_FIELDS.filter((f) => p[f.key].trim()).map(
    (f) => `## ${f.label}\n\n${p[f.key].trim()}`,
  );
  return `# Postmortem: ${p.title.trim() || "Untitled"}\n\n**Date:** ${date}  \n**Type:** ${kind}\n\n${sections.join("\n\n")}\n`;
}
