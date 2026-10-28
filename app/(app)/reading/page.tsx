import Link from "next/link";
import type { Prisma, ReadingStatus } from "@prisma/client";
import { BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { READING_TABS, STARTER_READING_TAGS } from "@/lib/reading";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AddReadingForm } from "@/components/reading/add-reading-form";
import { ReadingItemActions } from "@/components/reading/reading-item-actions";
import { ScrollIntoView } from "@/components/scroll-into-view";

export const metadata = { title: "Reading" };

type SP = { tab?: string; tag?: string; hl?: string };

function href(tab: string, tag?: string) {
  const p = new URLSearchParams();
  if (tab !== "UNREAD") p.set("tab", tab.toLowerCase());
  if (tag) p.set("tag", tag);
  const qs = p.toString();
  return qs ? `/reading?${qs}` : "/reading";
}

export default async function ReadingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = (READING_TABS.find((t) => t.value === sp.tab?.toUpperCase())?.value ??
    "UNREAD") as ReadingStatus;
  const where: Prisma.ReadingItemWhereInput = { status: tab };
  if (sp.tag) where.tags = { some: { name: sp.tag } };

  const [items, counts, usedTags, allTags] = await Promise.all([
    db.readingItem.findMany({
      where,
      orderBy:
        tab === "UNREAD" ? { createdAt: "desc" } : [{ readAt: "desc" }, { createdAt: "desc" }],
      take: 500,
      include: { tags: { select: { name: true }, orderBy: { name: "asc" } } },
    }),
    db.readingItem.groupBy({ by: ["status"], _count: true }),
    db.tag.findMany({
      where: { readingItems: { some: {} } },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  const count = (s: ReadingStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  const suggestions = [...new Set([...STARTER_READING_TAGS, ...allTags.map((t) => t.name)])];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Reading"
        description="An inbox for links. Reading is input, not a session — the streak counts doing."
      />
      <AddReadingForm tagSuggestions={suggestions} />

      <nav aria-label="Reading status" className="mb-3 flex gap-1 border-b">
        {READING_TABS.map((t) => (
          <Link
            key={t.value}
            href={href(t.value, sp.tag)}
            aria-current={t.value === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              t.value === tab
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}{" "}
            <span className="text-xs text-muted-foreground tabular-nums">{count(t.value)}</span>
          </Link>
        ))}
      </nav>

      {usedTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by tag">
          {usedTags.map((t) => (
            <Link
              key={t.name}
              href={href(tab, sp.tag === t.name ? undefined : t.name)}
              aria-pressed={sp.tag === t.name}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs hover:bg-accent",
                sp.tag === t.name &&
                  "border-foreground bg-foreground text-background hover:bg-foreground",
              )}
            >
              #{t.name}
            </Link>
          ))}
        </div>
      )}

      {items.length ? (
        <ul className="divide-y rounded-xl border">
          {items.map((item) => (
            <li
              key={item.id}
              aria-current={item.id === sp.hl ? "true" : undefined}
              className={cn(
                "space-y-1.5 p-4 first:rounded-t-xl last:rounded-b-xl",
                item.id === sp.hl && "bg-accent",
              )}
            >
              {item.id === sp.hl && <ScrollIntoView />}
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block font-medium break-words hover:underline"
              >
                {item.title ?? item.url}
              </a>
              <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                {item.source && <span>{item.source}</span>}
                <span>
                  {item.readAt
                    ? `read ${fmtDate(item.readAt)}`
                    : `added ${fmtDate(item.createdAt)}`}
                </span>
                {item.tags.map((t) => (
                  <span key={t.name}>#{t.name}</span>
                ))}
              </p>
              {item.takeaway && <p className="border-l-2 pl-2 text-sm">{item.takeaway}</p>}
              <ReadingItemActions
                item={{
                  id: item.id,
                  url: item.url,
                  title: item.title,
                  status: item.status,
                  takeaway: item.takeaway,
                  tags: item.tags.map((t) => t.name),
                }}
                tagSuggestions={suggestions}
              />
            </li>
          ))}
        </ul>
      ) : sp.tag ? (
        <EmptyState icon={<BookOpen />} title={`Nothing tagged #${sp.tag} here`}>
          <Link href={href(tab)} className="underline">
            Clear the tag filter
          </Link>
          .
        </EmptyState>
      ) : tab === "UNREAD" ? (
        <EmptyState icon={<BookOpen />} title="Inbox zero">
          Paste a link above when you find something worth reading — postmortems, talks, docs — and
          come back to it on the commute.
        </EmptyState>
      ) : (
        <EmptyState
          icon={<BookOpen />}
          title={tab === "READ" ? "Nothing read yet" : "Nothing archived"}
        >
          {tab === "READ"
            ? "Items you mark as read land here with their one-line takeaway."
            : "Archive links you've decided not to read — no guilt, just a clean inbox."}
        </EmptyState>
      )}
    </div>
  );
}
