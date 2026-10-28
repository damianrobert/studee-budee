"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LoopStage } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ParamDrawer } from "@/components/ui/param-drawer";
import { deleteTopic, moveTopic, updateTopic } from "@/lib/actions/projects";
import { STAGES, STAGE_INFO } from "@/lib/stages";
import { BreakFirstHint, DoneGateDialog } from "./gate-dialogs";

/** Right-side drawer whose open state lives in the `?topic=` search param. */
export function TopicDrawer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ParamDrawer param="topic" title={title}>
      {children}
    </ParamDrawer>
  );
}

export function TopicEditor({
  topic,
  projectId,
}: {
  topic: { id: string; title: string; description: string | null; stage: LoopStage };
  projectId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [title, setTitle] = React.useState(topic.title);
  const [description, setDescription] = React.useState(topic.description ?? "");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [gate, setGate] = React.useState(false);
  const [hint, setHint] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const dirty = title !== topic.title || description !== (topic.description ?? "");

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await updateTopic(topic.id, { title, description });
            setMsg(res.ok ? "Saved" : res.error);
          });
        }}
      >
        <Field label="Title" htmlFor="topic-title">
          <Input
            id="topic-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>
        <Field label="Description" htmlFor="topic-description">
          <Textarea
            id="topic-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this topic about?"
          />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending || !dirty}>
            Save
          </Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      </form>
      <Field label="Stage" htmlFor="topic-stage">
        <Select
          id="topic-stage"
          value={topic.stage}
          disabled={pending}
          onChange={(e) => {
            const to = e.target.value as LoopStage;
            startTransition(async () => {
              const res = await moveTopic(topic.id, to, 10_000);
              if (!res.ok) {
                if (res.code === "NEEDS_EXPLAIN_NOTE") setGate(true);
                else setMsg(res.error);
              } else setHint(res.data?.hint === "BREAK_FIRST");
            });
          }}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_INFO[s].label} — {STAGE_INFO[s].description}
            </option>
          ))}
        </Select>
      </Field>
      {hint && (
        <BreakFirstHint topic={topic} projectId={projectId} onDismiss={() => setHint(false)} />
      )}
      <DoneGateDialog
        topic={gate ? topic : null}
        projectId={projectId}
        onClose={() => setGate(false)}
      />
      <Confirm
        title={`Delete “${topic.title}”?`}
        description="Its stage history is deleted. Linked sessions, notes and postmortems are kept but unlinked."
        onConfirm={async () => {
          await deleteTopic(topic.id);
          router.push(pathname, { scroll: false });
        }}
      >
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          Delete topic
        </Button>
      </Confirm>
    </div>
  );
}
