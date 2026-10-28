"use client";

import * as React from "react";
import type { ReadingStatus } from "@prisma/client";
import { Archive, Check, Inbox, Pencil, Trash2 } from "lucide-react";
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
import { Field, Input } from "@/components/ui/input";
import { TagInput } from "@/components/notes/tag-input";
import { deleteReadingItem, setReadingStatus, updateReadingItem } from "@/lib/actions/reading";

export type ReadingItemView = {
  id: string;
  url: string;
  title: string | null;
  status: ReadingStatus;
  takeaway: string | null;
  tags: string[];
};

function MarkReadDialog({ item }: { item: ReadingItemView }) {
  const [open, setOpen] = React.useState(false);
  const [takeaway, setTakeaway] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await setReadingStatus(item.id, { status: "READ", takeaway });
      if (!res.ok) return setError(res.error);
      setOpen(false);
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setTakeaway("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Check aria-hidden /> Read
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Done reading</DialogTitle>
          <DialogDescription className="line-clamp-2">{item.title ?? item.url}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field
            label="One-line takeaway (optional)"
            htmlFor={`takeaway-${item.id}`}
            hint="What will you remember from it in a month?"
          >
            <Input
              id={`takeaway-${item.id}`}
              maxLength={500}
              value={takeaway}
              onChange={(e) => setTakeaway(e.target.value)}
              autoFocus
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Mark as read"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ item, tagSuggestions }: { item: ReadingItemView; tagSuggestions: string[] }) {
  const initial = {
    url: item.url,
    title: item.title ?? "",
    takeaway: item.takeaway ?? "",
    tags: item.tags,
  };
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateReadingItem(item.id, v);
      if (!res.ok) return setError(res.error);
      setOpen(false);
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(initial);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Edit">
          <Pencil aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit reading item</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label="Link" htmlFor={`r-url-${item.id}`}>
            <Input
              id={`r-url-${item.id}`}
              required
              value={v.url}
              onChange={(e) => setV({ ...v, url: e.target.value })}
            />
          </Field>
          <Field label="Title" htmlFor={`r-title-${item.id}`}>
            <Input
              id={`r-title-${item.id}`}
              maxLength={300}
              value={v.title}
              onChange={(e) => setV({ ...v, title: e.target.value })}
            />
          </Field>
          <Field label="Tags" htmlFor={`r-tags-${item.id}`}>
            <TagInput
              id={`r-tags-${item.id}`}
              value={v.tags}
              onChange={(tags) => setV({ ...v, tags })}
              suggestions={tagSuggestions}
            />
          </Field>
          {item.status !== "UNREAD" && (
            <Field label="Takeaway" htmlFor={`r-takeaway-${item.id}`}>
              <Input
                id={`r-takeaway-${item.id}`}
                maxLength={500}
                value={v.takeaway}
                onChange={(e) => setV({ ...v, takeaway: e.target.value })}
              />
            </Field>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReadingItemActions({
  item,
  tagSuggestions,
}: {
  item: ReadingItemView;
  tagSuggestions: string[];
}) {
  const [pending, startTransition] = React.useTransition();
  const move = (status: ReadingStatus) =>
    startTransition(async () => void (await setReadingStatus(item.id, { status })));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {item.status === "UNREAD" && <MarkReadDialog item={item} />}
      {item.status !== "UNREAD" && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => move("UNREAD")}>
          <Inbox aria-hidden /> Unread
        </Button>
      )}
      {item.status !== "ARCHIVED" && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => move("ARCHIVED")}>
          <Archive aria-hidden /> Archive
        </Button>
      )}
      <EditDialog item={item} tagSuggestions={tagSuggestions} />
      <Confirm
        title="Delete this link?"
        description="It's removed from your reading list permanently."
        onConfirm={() => deleteReadingItem(item.id).then(() => undefined)}
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label="Delete"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden />
        </Button>
      </Confirm>
    </div>
  );
}
