import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Briefcase, CheckCircle2, CircleHelp } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AddObservationForm } from "@/components/work/observation-form";
import { ObservationActions } from "@/components/work/observation-actions";
import { ScrollIntoView } from "@/components/scroll-into-view";

export const metadata = { title: "Work Log" };

/** Unresolved observations that have a question to ask. */
const OPEN: Prisma.WorkObservationWhereInput = { resolved: false, question: { not: null } };

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; hl?: string }>;
}) {
  const { filter, hl } = await searchParams;
  const onlyOpen = filter === "open";
  const [observations, openCount, total, tags] = await Promise.all([
    db.workObservation.findMany({
      where: onlyOpen ? OPEN : {},
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { tags: { select: { name: true }, orderBy: { name: "asc" } } },
    }),
    db.workObservation.count({ where: OPEN }),
    db.workObservation.count(),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  const suggestions = tags.map((t) => t.name);
  const tabs = [
    { href: "/work", label: "All", count: total, active: !onlyOpen },
    { href: "/work?filter=open", label: "Open questions", count: openCount, active: onlyOpen },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Work Log"
        description="Your day job is a lab too. Note what you notice and what to ask a colleague."
      />
      <AddObservationForm tagSuggestions={suggestions} />

      <nav aria-label="Filter" className="mb-3 flex gap-1 border-b">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              t.active
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label} <span className="text-xs text-muted-foreground tabular-nums">{t.count}</span>
          </Link>
        ))}
      </nav>

      {observations.length ? (
        <ul className="divide-y rounded-xl border">
          {observations.map((o) => (
            <li
              key={o.id}
              aria-current={o.id === hl ? "true" : undefined}
              className={cn(
                "space-y-2 p-4 first:rounded-t-xl last:rounded-b-xl",
                o.id === hl && "bg-accent",
              )}
            >
              {o.id === hl && <ScrollIntoView />}
              <p
                className={cn("text-sm whitespace-pre-wrap", o.resolved && "text-muted-foreground")}
              >
                {o.content}
              </p>
              {o.question && (
                <p className="flex items-start gap-1.5 text-sm">
                  {o.resolved ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-label="Resolved"
                    />
                  ) : (
                    <CircleHelp
                      className="mt-0.5 size-4 shrink-0 text-warning"
                      aria-label="Open question"
                    />
                  )}
                  <span className={cn(o.resolved && "text-muted-foreground")}>{o.question}</span>
                </p>
              )}
              {o.answer && (
                <p className="border-l-2 border-success/50 pl-2 text-sm whitespace-pre-wrap">
                  {o.answer}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs text-muted-foreground">{fmtDate(o.createdAt)}</span>
                {o.tags.map((t) => (
                  <span key={t.name} className="text-xs text-muted-foreground">
                    #{t.name}
                  </span>
                ))}
                <span className="flex-1" />
                <ObservationActions
                  observation={{
                    id: o.id,
                    content: o.content,
                    question: o.question,
                    answer: o.answer,
                    resolved: o.resolved,
                    tags: o.tags.map((t) => t.name),
                  }}
                  tagSuggestions={suggestions}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : onlyOpen ? (
        <EmptyState icon={<CircleHelp />} title="No open questions">
          Add a question to an observation and it waits here until you ask someone.
        </EmptyState>
      ) : (
        <EmptyState icon={<Briefcase />} title="Nothing logged yet">
          Things you notice at work — a slow pipeline, an odd alert, a tool nobody explains — are
          free curriculum. Log one above.
        </EmptyState>
      )}
    </div>
  );
}
