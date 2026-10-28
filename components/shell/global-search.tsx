"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  BookOpen,
  Briefcase,
  CornerDownLeft,
  Loader2,
  NotebookPen,
  Search,
  Siren,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";
import { SEARCH_KINDS, type SearchHit, type SearchKind } from "@/lib/search-hits";
import { cn } from "@/lib/utils";
import { SearchSnippet } from "@/components/search-snippet";
import { NAV } from "./nav";

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  note: NotebookPen,
  postmortem: Siren,
  topic: SquareKanban,
  reading: BookOpen,
  work: Briefcase,
};

type Item = {
  key: string;
  href: string;
  title: string;
  icon: LucideIcon;
  meta?: string | null;
  snippet?: string | null;
};
type Group = { label: string; items: Item[] };

/** Debounced fetch of /api/search; keeps the previous hits while the next ones load. */
function useSearch(q: string) {
  const [state, setState] = React.useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const query = q.trim();

  React.useEffect(() => {
    if (!query) {
      setState({ q: "", hits: [] });
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const { hits } = (await res.json()) as { hits: SearchHit[] };
        setState({ q: query, hits });
        setError(false);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        console.error(e);
        setError(true);
      }
      setLoading(false);
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  return { ...state, loading, error };
}

function buildGroups(q: string, hits: SearchHit[]): Group[] {
  const needle = q.trim().toLowerCase();
  const groups: Group[] = [];
  const pages = NAV.filter((n) => n.label.toLowerCase().includes(needle));
  if (pages.length)
    groups.push({
      label: "Pages",
      items: pages.map((n) => ({
        key: `page:${n.href}`,
        href: n.href,
        title: n.label,
        icon: n.icon,
      })),
    });
  for (const { kind, label } of SEARCH_KINDS) {
    const items = hits
      .filter((h) => h.kind === kind)
      .map((h) => ({
        key: `${kind}:${h.id}`,
        href: h.href,
        title: h.title,
        icon: KIND_ICON[kind],
        meta: h.meta,
        snippet: h.snippet,
      }));
    if (items.length) groups.push({ label, items });
  }
  if (needle)
    groups.push({
      label: "More",
      items: [
        {
          key: "notes-search",
          href: `/notes?q=${encodeURIComponent(q.trim())}`,
          title: `All notes matching “${q.trim()}”`,
          icon: Search,
        },
      ],
    });
  return groups;
}

/** The Ctrl/Cmd+K dialog: pages plus full-text hits, navigable with the arrow keys. */
export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const search = useSearch(open ? q : "");
  const listRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();

  // Hits only make sense for the query they were fetched for.
  const groups = buildGroups(q, search.q === q.trim() ? search.hits : []);
  const items = groups.flatMap((g) => g.items);
  const current = Math.min(active, items.length - 1);

  // Start fresh each time it opens.
  React.useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  // Navigating closes the dialog (also covers ctrl-click opening a tab, which doesn't navigate).
  React.useEffect(() => onOpenChange(false), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function go(item: Item) {
    onOpenChange(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + items.length) % items.length);
    } else if (e.key === "Home" && e.ctrlKey) {
      setActive(0);
    } else if (e.key === "End" && e.ctrlKey) {
      setActive(items.length - 1);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const item = items[current];
      if (item) go(item);
    }
  }

  const query = q.trim();
  const settled = !search.loading && search.q === query;
  const hitCount = items.filter(
    (i) => !i.key.startsWith("page:") && i.key !== "notes-search",
  ).length;
  let status = "";
  if (search.error) status = "Search failed. Try again.";
  else if (query && settled)
    status = hitCount ? `${hitCount} result${hitCount === 1 ? "" : "s"}` : "No matches";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          className="fixed top-[8dvh] left-1/2 z-50 flex max-h-[80dvh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-lg focus:outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById(`${id}-input`)?.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search notes, postmortems, topics, reading and the work log. Use the arrow keys to pick
            a result and Enter to open it.
          </DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b px-3">
            {search.loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <input
              id={`${id}-input`}
              role="combobox"
              aria-label="Search"
              aria-expanded={items.length > 0}
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={items.length ? `${id}-opt-${current}` : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search everything…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
            <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
              Esc
            </kbd>
          </div>

          <div
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            aria-label="Results"
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {groups.map((g) => {
              const gid = `${id}-g-${g.label.replace(/\s/g, "-")}`;
              return (
                <div key={g.label} role="group" aria-labelledby={gid} className="mb-1 last:mb-0">
                  <div id={gid} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {g.label}
                  </div>
                  {g.items.map((item) => {
                    const index = items.indexOf(item);
                    const selected = index === current;
                    const Icon = item.icon;
                    return (
                      <a
                        key={item.key}
                        id={`${id}-opt-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={selected}
                        href={item.href}
                        tabIndex={-1}
                        onMouseMove={() => index !== current && setActive(index)}
                        onClick={(e) => {
                          // Let modified clicks open a new tab as usual.
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                          e.preventDefault();
                          go(item);
                        }}
                        className={cn(
                          "flex items-start gap-3 rounded-md px-2 py-2 text-sm",
                          selected && "bg-accent text-accent-foreground",
                        )}
                      >
                        <Icon
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate font-medium">{item.title}</span>
                            {item.meta && (
                              <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                                {item.meta}
                              </span>
                            )}
                          </span>
                          {item.snippet && (
                            <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                              <SearchSnippet text={item.snippet} />
                            </span>
                          )}
                        </span>
                        {selected && (
                          <CornerDownLeft
                            className="mt-0.5 hidden size-3.5 shrink-0 text-muted-foreground sm:block"
                            aria-hidden
                          />
                        )}
                      </a>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <p role="status" aria-live="polite" className="flex-1">
              {status}
            </p>
            <span className="hidden sm:inline" aria-hidden>
              ↑↓ to move · Enter to open
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
