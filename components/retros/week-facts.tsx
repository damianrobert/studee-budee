import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { WeekFacts } from "@/lib/retros";
import { STAGE_INFO } from "@/lib/stages";
import { formatMinutes } from "@/lib/utils";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children?: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h3 className="flex justify-between text-sm font-medium">
        <span>{title}</span>
        <span className="text-muted-foreground tabular-nums">{count}</span>
      </h3>
      {count > 0 && children}
    </section>
  );
}

/** This week's auto-collected facts, shown beside the retro form. */
export function WeekFactsPanel({ facts, label }: { facts: WeekFacts; label: string }) {
  return (
    <aside
      aria-label="This week's facts"
      className="space-y-4 self-start rounded-xl border bg-muted/40 p-4 text-sm"
    >
      <div>
        <h2 className="font-semibold">What happened</h2>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <Section title="Sessions" count={facts.sessions}>
        <p className="text-xs text-muted-foreground">{formatMinutes(facts.minutes)} in total</p>
      </Section>
      <Section title="Topics moved" count={facts.topics.length}>
        <ul className="space-y-0.5 text-xs">
          {facts.topics.map((m) => (
            <li key={m.topic.id}>
              <Link
                href={`/projects/${m.topic.projectId}?topic=${m.topic.id}`}
                className="hover:underline"
              >
                {m.topic.title}
              </Link>{" "}
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                {STAGE_INFO[m.from].label} <ArrowRight className="size-3" aria-label="to" />{" "}
                {STAGE_INFO[m.to].label}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Postmortems written" count={facts.postmortems.length}>
        <ul className="space-y-0.5 text-xs">
          {facts.postmortems.map((p) => (
            <li key={p.id}>
              <Link href={`/postmortems/${p.id}`} className="hover:underline">
                {p.title}
              </Link>
              {p.wasDeliberate && <span className="text-muted-foreground"> · chaos</span>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Artifacts published" count={facts.artifacts.length}>
        <ul className="space-y-0.5 text-xs">
          {facts.artifacts.map((a) => (
            <li key={a.id}>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {a.title}
                </a>
              ) : (
                a.title
              )}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Reading items read" count={facts.reading.length}>
        <ul className="space-y-0.5 text-xs">
          {facts.reading.map((r) => (
            <li key={r.id} className="truncate">
              <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
                {r.title ?? r.url}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </aside>
  );
}
