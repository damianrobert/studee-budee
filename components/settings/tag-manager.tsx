"use client";

import * as React from "react";
import Link from "next/link";
import { Merge, Pencil, Search, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { deleteTag, deleteUnusedTags, mergeTags, renameTag } from "@/lib/actions/tags";

export type TagRow = {
  id: string;
  name: string;
  notes: number;
  postmortems: number;
  readingItems: number;
  workObservations: number;
};

const total = (t: TagRow) => t.notes + t.postmortems + t.readingItems + t.workObservations;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function usageText(t: TagRow): string {
  return (
    [
      t.notes && plural(t.notes, "note"),
      t.postmortems && plural(t.postmortems, "postmortem"),
      t.readingItems && plural(t.readingItems, "reading item"),
      t.workObservations && plural(t.workObservations, "observation"),
    ]
      .filter(Boolean)
      .join(" · ") || "Not used"
  );
}

function RenameDialog({ tag, tags }: { tag: TagRow; tags: TagRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(tag.name);
  const [error, setError] = React.useState<string | null>(null);
  const [clash, setClash] = React.useState<TagRow | null>(null);
  const [pending, startTransition] = React.useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await renameTag(tag.id, name);
      if (res.ok) return setOpen(false);
      const clashId = res.code?.startsWith("exists:") ? res.code.slice(7) : null;
      setClash(tags.find((t) => t.id === clashId) ?? null);
      setError(res.error);
    });
  }

  function merge() {
    if (!clash) return;
    startTransition(async () => {
      const res = await mergeTags(tag.id, clash.id);
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setName(tag.name);
          setError(null);
          setClash(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Rename ${tag.name}`}>
          <Pencil aria-hidden />
          <span className="max-sm:sr-only">Rename</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename tag</DialogTitle>
          <DialogDescription>Changes it everywhere it&apos;s used.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field
            label="Name"
            htmlFor={`tag-name-${tag.id}`}
            hint="Saved in lower case, with dashes for spaces."
          >
            <Input
              id={`tag-name-${tag.id}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setClash(null);
                setError(null);
              }}
              autoFocus
            />
          </Field>
          {error && (
            <div role="alert" className="space-y-2 text-sm">
              <p className="text-destructive">{error}</p>
              {clash && (
                <p className="text-muted-foreground">
                  Merge <strong>{tag.name}</strong> into <strong>{clash.name}</strong> instead?
                  Everything tagged {tag.name} gets {clash.name}, and {tag.name} is deleted.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            {clash ? (
              <Button type="button" onClick={merge} disabled={pending}>
                <Merge aria-hidden /> Merge into {clash.name}
              </Button>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Rename"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ tag, tags }: { tag: TagRow; tags: TagRow[] }) {
  const others = tags.filter((t) => t.id !== tag.id);
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const targetName = others.find((t) => t.id === target)?.name;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return setError("Pick the tag to merge into.");
    startTransition(async () => {
      const res = await mergeTags(tag.id, target);
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  if (!others.length) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setTarget("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Merge ${tag.name}`}>
          <Merge aria-hidden />
          <span className="max-sm:sr-only">Merge</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge {tag.name}</DialogTitle>
          <DialogDescription>
            Everything tagged {tag.name} ({usageText(tag).toLowerCase()}) gets the other tag
            instead, and {tag.name} is deleted.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label="Merge into" htmlFor={`merge-${tag.id}`}>
            <Select
              id={`merge-${tag.id}`}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setError(null);
              }}
            >
              <option value="">Choose a tag…</option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Merging…" : targetName ? `Merge into ${targetName}` : "Merge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TagManager({ tags }: { tags: TagRow[] }) {
  const [filter, setFilter] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const unused = tags.filter((t) => total(t) === 0).length;
  const q = filter.trim().toLowerCase();
  const shown = q ? tags.filter((t) => t.name.includes(q)) : tags;

  if (!tags.length)
    return (
      <EmptyState icon={<Tags />} title="No tags yet">
        Tags group notes, postmortems, reading and observations by theme. Add them while you write;
        this is where you tidy them up.
      </EmptyState>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tags.length > 8 && (
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Filter tags"
              placeholder="Filter tags…"
              className="pl-8"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        )}
        {unused > 0 && (
          <Confirm
            title={`Delete ${plural(unused, "unused tag")}?`}
            description="They aren't on anything, so nothing else changes."
            onConfirm={async () => {
              const res = await deleteUnusedTags();
              setMsg(res.ok ? `Deleted ${plural(res.data?.count ?? 0, "tag")}.` : res.error);
            }}
          >
            <Button variant="outline" size="sm">
              <Trash2 aria-hidden /> Delete {plural(unused, "unused tag")}
            </Button>
          </Confirm>
        )}
      </div>
      {msg && (
        <p role="status" className="text-xs text-muted-foreground">
          {msg}
        </p>
      )}
      {shown.length ? (
        <ul className="divide-y rounded-lg border" aria-label="Tags">
          {shown.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">#{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.notes > 0 && (
                    <Link
                      href={`/notes?tag=${encodeURIComponent(t.name)}`}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {plural(t.notes, "note")}
                    </Link>
                  )}
                  {t.notes > 0 && total(t) > t.notes && " · "}
                  {(t.notes === 0 || total(t) > t.notes) && usageText({ ...t, notes: 0 })}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <RenameDialog tag={t} tags={tags} />
                <MergeDialog tag={t} tags={tags} />
                <Confirm
                  title={`Delete #${t.name}?`}
                  description={
                    total(t)
                      ? `It's removed from ${usageText(t).toLowerCase().replace(/ · /g, ", ")}. Those stay.`
                      : "It isn't used anywhere."
                  }
                  onConfirm={() => deleteTag(t.id).then(() => undefined)}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${t.name}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </Confirm>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">No tags match.</p>
      )}
    </div>
  );
}
