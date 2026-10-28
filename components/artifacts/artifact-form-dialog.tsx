"use client";

import * as React from "react";
import type { ArtifactKind, ArtifactStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useQueryParams } from "@/components/use-query-params";
import { createArtifact, updateArtifact } from "@/lib/actions/artifacts";
import {
  ARTIFACT_KINDS,
  ARTIFACT_KIND_LABEL,
  ARTIFACT_STATUSES,
  ARTIFACT_STATUS_LABEL,
} from "@/lib/artifacts";

export type ArtifactValues = {
  title: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  url: string;
  notes: string;
  /** "YYYY-MM" */
  targetMonth: string;
};

export type ArtifactSource = { noteId?: string; postmortemId?: string; label: string };

function ArtifactForm({
  artifactId,
  initial,
  source,
  onDone,
}: {
  artifactId?: string;
  initial: ArtifactValues;
  source?: ArtifactSource;
  onDone: () => void;
}) {
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set =
    (k: "title" | "url" | "notes" | "targetMonth") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = artifactId
        ? await updateArtifact(artifactId, v)
        : await createArtifact({
            ...v,
            sourceNoteId: source?.noteId,
            sourcePostmortemId: source?.postmortemId,
          });
      if (!res.ok) return setError(res.error);
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" htmlFor="art-title">
        <Input
          id="art-title"
          required
          maxLength={300}
          value={v.title}
          onChange={set("title")}
          placeholder="e.g. What I learned killing Postgres mid-write"
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Kind" htmlFor="art-kind">
          <Select
            id="art-kind"
            value={v.kind}
            onChange={(e) => setV((p) => ({ ...p, kind: e.target.value as ArtifactKind }))}
          >
            {ARTIFACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {ARTIFACT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="art-status">
          <Select
            id="art-status"
            value={v.status}
            onChange={(e) => setV((p) => ({ ...p, status: e.target.value as ArtifactStatus }))}
          >
            {ARTIFACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ARTIFACT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Month" htmlFor="art-month">
          <Input
            id="art-month"
            type="month"
            required
            value={v.targetMonth}
            onChange={set("targetMonth")}
          />
        </Field>
      </div>
      <Field label="Link (optional)" htmlFor="art-url" hint="Where it lives once published.">
        <Input
          id="art-url"
          type="url"
          maxLength={2000}
          value={v.url}
          onChange={set("url")}
          placeholder="https://"
        />
      </Field>
      <Field label="Notes (optional)" htmlFor="art-notes">
        <Textarea id="art-notes" rows={3} value={v.notes} onChange={set("notes")} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : artifactId ? "Save" : "Add artifact"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const DESCRIPTION = "Something public that proves what you learned: a post, a diagram, a talk.";

export function ArtifactFormDialog({
  artifact,
  initial,
  children,
}: {
  artifact?: { id: string } & ArtifactValues;
  initial?: ArtifactValues;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const values = artifact ?? initial!;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{artifact ? "Edit artifact" : "New artifact"}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {/* Remounts on every open, so the form starts from the saved values. */}
        {open && (
          <ArtifactForm artifactId={artifact?.id} initial={values} onDone={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Opened by `?fromNote=` / `?fromPostmortem=`; closing it clears the param. */
export function PromoteDialog({
  initial,
  source,
}: {
  initial: ArtifactValues;
  source: ArtifactSource;
}) {
  const { update } = useQueryParams();
  const close = () => update({ fromNote: null, fromPostmortem: null });
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote to artifact</DialogTitle>
          <DialogDescription>
            From {source.label}. {DESCRIPTION}
          </DialogDescription>
        </DialogHeader>
        <ArtifactForm initial={initial} source={source} onDone={close} />
      </DialogContent>
    </Dialog>
  );
}
