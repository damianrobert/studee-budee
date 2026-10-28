"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ResourceKind, RoadmapStepStatus } from "@prisma/client";
import { BookPlus, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { addReadingItem } from "@/lib/actions/reading";
import { addResource, deleteResource, deleteStep, setStepStatus } from "@/lib/actions/roadmaps";
import {
  RESOURCE_KINDS,
  RESOURCE_KIND_LABEL,
  STEP_STATUSES,
  STEP_STATUS_INFO,
} from "@/lib/roadmaps";
import { cn } from "@/lib/utils";
import { StatusIcon } from "./status-icon";

function useCloseStep() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return () => {
    const next = new URLSearchParams(params);
    next.delete("step");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

/** Right-side drawer whose open state lives in the `?step=` search param. */
export function StepDrawer({ title, children }: { title: string; children: React.ReactNode }) {
  const close = useCloseStep();
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent side="right" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function StepStatusControl({
  stepId,
  status,
}: {
  stepId: string;
  status: RoadmapStepStatus;
}) {
  const [current, setCurrent] = React.useState(status);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();
  React.useEffect(() => setCurrent(status), [status]);
  return (
    <div className="space-y-1">
      <div role="group" aria-label="Status" className="inline-flex rounded-lg border p-0.5">
        {STEP_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={current === s}
            onClick={() => {
              const before = current;
              setCurrent(s);
              setError(null);
              startTransition(async () => {
                const res = await setStepStatus(stepId, s);
                if (!res.ok) {
                  setCurrent(before);
                  setError(res.error);
                }
              });
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm",
              current === s ? "bg-foreground text-background" : "hover:bg-accent",
            )}
          >
            <StatusIcon status={s} className="size-3.5" plain={current === s} />
            {STEP_STATUS_INFO[s].label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ResourceActions({ resource }: { resource: { id: string; url: string } }) {
  const [saved, setSaved] = React.useState<"no" | "saving" | "yes">("no");
  return (
    <div className="flex shrink-0 items-start gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        title={saved === "yes" ? "Saved to Reading" : "Save to Reading"}
        aria-label={saved === "yes" ? "Saved to Reading" : "Save to Reading"}
        disabled={saved === "saving" || saved === "yes"}
        onClick={async () => {
          setSaved("saving");
          const res = await addReadingItem({ url: resource.url, tags: ["roadmap"] });
          setSaved(res.ok ? "yes" : "no");
        }}
      >
        {saved === "yes" ? <Check /> : <BookPlus />}
      </Button>
      <Confirm
        title="Remove this resource?"
        description="It's removed from this step. You can ask the AI for more at any time."
        confirmLabel="Remove"
        onConfirm={async () => {
          await deleteResource(resource.id);
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label="Remove resource"
          title="Remove"
        >
          <Trash2 />
        </Button>
      </Confirm>
    </div>
  );
}

export function AddResourceForm({ stepId }: { stepId: string }) {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<ResourceKind>("ARTICLE");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add a link
      </Button>
    );
  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await addResource(stepId, { url, title, kind });
          if (!res.ok) return setError(res.error);
          setUrl("");
          setTitle("");
          setOpen(false);
        });
      }}
    >
      <Field label="Link" htmlFor="resource-url">
        <Input
          id="resource-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          required
          autoFocus
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Title" htmlFor="resource-title" hint="Left empty, the page's title is used.">
          <Input id="resource-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Kind" htmlFor="resource-kind">
          <Select
            id="resource-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ResourceKind)}
          >
            {RESOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {RESOURCE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !url.trim()}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DeleteStepButton({ stepId, title }: { stepId: string; title: string }) {
  const close = useCloseStep();
  return (
    <Confirm
      title={`Delete “${title}”?`}
      description="The step and its resources are removed from the roadmap."
      onConfirm={async () => {
        await deleteStep(stepId);
        close();
      }}
    >
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
        Delete step
      </Button>
    </Confirm>
  );
}
