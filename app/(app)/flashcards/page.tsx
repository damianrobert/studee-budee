import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CalendarCheck, FileText, Layers, Plus, Search } from "lucide-react";
import { aiEnabled } from "@/lib/ai/config";
import { db } from "@/lib/db";
import { dueLabel, intervalLabel } from "@/lib/flashcards";
import { appTz } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Markdown } from "@/components/markdown/markdown";
import { CardActions } from "@/components/flashcards/card-actions";
import { CardFormDialog, FromNoteDialog } from "@/components/flashcards/card-form-dialog";
import { CardSearch } from "@/components/flashcards/card-search";

export const metadata = { title: "Flashcards" };

/** Cards reviewed into an interval this long are "mature" (the usual Anki threshold). */
const MATURE_DAYS = 21;

type SP = { filter?: string; q?: string; fromNote?: string };

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { filter, q = "", fromNote } = await searchParams;
  const onlyDue = filter === "due";
  const now = new Date();
  const tz = appTz();
  const due: Prisma.FlashcardWhereInput = { dueAt: { lte: now } };
  const query = q.trim();
  const where: Prisma.FlashcardWhereInput = {
    ...(onlyDue ? due : {}),
    ...(query
      ? {
          OR: [
            { front: { contains: query, mode: "insensitive" } },
            { back: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [cards, total, dueCount, mature, nextDue, sourceNote] = await Promise.all([
    db.flashcard.findMany({
      where,
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 500,
      include: { note: { select: { id: true, title: true } } },
    }),
    db.flashcard.count(),
    db.flashcard.count({ where: due }),
    db.flashcard.count({ where: { interval: { gte: MATURE_DAYS } } }),
    db.flashcard.findFirst({
      where: { dueAt: { gt: now } },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    }),
    fromNote
      ? db.note.findUnique({
          where: { id: fromNote },
          select: { id: true, title: true, content: true },
        })
      : null,
  ]);

  const tabs = [
    { href: "/flashcards", label: "All", count: total, active: !onlyDue },
    { href: "/flashcards?filter=due", label: "Due", count: dueCount, active: onlyDue },
  ];
  const newCard = (
    <CardFormDialog>
      <Button variant={dueCount ? "outline" : "default"}>
        <Plus aria-hidden /> New card
      </Button>
    </CardFormDialog>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Flashcards"
        description="Spaced repetition for what you want to keep. A few minutes a day is enough."
        actions={
          <>
            {newCard}
            {dueCount > 0 && (
              <Button asChild>
                <Link href="/flashcards/review">
                  <Layers aria-hidden /> Review {dueCount} due
                </Link>
              </Button>
            )}
          </>
        }
      />

      {total > 0 && (
        <>
          <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {total} card{total === 1 ? "" : "s"}
            </span>
            <span aria-hidden>·</span>
            <span>{mature} remembered for 3+ weeks</span>
            {dueCount === 0 && nextDue && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <CalendarCheck className="size-4 text-success" aria-hidden />
                  Nothing due. Next one {dueLabel(nextDue.dueAt, now, tz)}.
                </span>
              </>
            )}
          </p>
          <CardSearch />
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
                {t.label}{" "}
                <span className="text-xs text-muted-foreground tabular-nums">{t.count}</span>
              </Link>
            ))}
          </nav>
        </>
      )}

      {cards.length ? (
        <ul className="divide-y rounded-xl border">
          {cards.map((c) => {
            const isDue = c.dueAt <= now;
            return (
              <li key={c.id} className="space-y-2 p-4">
                <Markdown className="text-sm">{c.front}</Markdown>
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Show answer
                  </summary>
                  <div className="mt-2 border-l-2 pl-3">
                    <Markdown className="text-sm">{c.back}</Markdown>
                  </div>
                </details>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className={cn(isDue && "font-medium text-primary")}>
                    {dueLabel(c.dueAt, now, tz)}
                  </span>
                  <span>
                    {c.repetitions === 0
                      ? "new"
                      : `every ${intervalLabel(c.interval)} · ease ${c.easeFactor.toFixed(2)}`}
                  </span>
                  {c.note && (
                    <Link
                      href={`/notes/${c.note.id}`}
                      className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline"
                    >
                      <FileText className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{c.note.title}</span>
                    </Link>
                  )}
                  <span className="flex-1" />
                  <CardActions card={{ id: c.id, front: c.front, back: c.back }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : total === 0 ? (
        <EmptyState icon={<Layers />} title="No cards yet" action={newCard}>
          Cards are for what you want to remember without looking it up: flags, ports, the order
          things happen in. Write one here, or use “Flashcards” on a note.
        </EmptyState>
      ) : query ? (
        <EmptyState icon={<Search />} title="No matching cards">
          Nothing on the front or back matches “{query}”.
        </EmptyState>
      ) : (
        <EmptyState icon={<CalendarCheck />} title="Nothing due">
          You’re up to date. Cards come back on the day they’re scheduled.
        </EmptyState>
      )}

      {sourceNote && <FromNoteDialog note={sourceNote} ai={aiEnabled()} />}
    </div>
  );
}
