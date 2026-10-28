"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { startSession } from "@/lib/actions/sessions";

/** One click: starts a session with the active project and last topic, or the given ones. */
export function QuickStartButton({
  projectId,
  topicId,
  children = "Start session",
  ...props
}: Omit<ButtonProps, "onClick"> & { projectId?: string | null; topicId?: string | null }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const explicit = projectId !== undefined || topicId !== undefined;
  return (
    <>
      <Button
        {...props}
        disabled={pending || props.disabled}
        onClick={() =>
          startTransition(async () => {
            const res = await startSession(explicit ? { projectId, topicId } : undefined);
            setError(res.ok ? null : res.error);
          })
        }
      >
        <Play aria-hidden />
        {pending ? "Starting…" : children}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </>
  );
}
