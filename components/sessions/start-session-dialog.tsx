"use client";

import * as React from "react";
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
import { startSession } from "@/lib/actions/sessions";
import type { ProjectOption } from "@/lib/sessions";
import { ProjectTopicPicker, type ProjectTopic } from "./project-topic-picker";

export function StartSessionDialog({
  projects,
  defaults,
  children,
}: {
  projects: ProjectOption[];
  defaults: ProjectTopic;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(defaults);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValue(defaults);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a session</DialogTitle>
          <DialogDescription>
            Ten focused minutes count. Pick what you&apos;re working on.
          </DialogDescription>
        </DialogHeader>
        <ProjectTopicPicker
          idPrefix="start"
          projects={projects}
          value={value}
          onChange={setValue}
        />
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await startSession(value);
                if (res.ok) setOpen(false);
                else setError(res.error);
              })
            }
          >
            {pending ? "Starting…" : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
