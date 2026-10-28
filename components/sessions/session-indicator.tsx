"use client";

import * as React from "react";
import { CircleStop, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StuckButton } from "@/components/ai/stuck";
import { useNow } from "@/components/use-now";
import { formatElapsed } from "@/lib/client-time";
import { StopSessionDialog, type ClientSession } from "./stop-session-dialog";

export function SessionIndicator({ session, ai }: { session: ClientSession; ai: boolean }) {
  const now = useNow();
  const [open, setOpen] = React.useState(false);
  const label = [session.project?.name, session.topic?.title].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-2 rounded-full border bg-card py-1 pr-1 pl-3 text-sm shadow-xs">
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      <Timer className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
      <span className="font-mono tabular-nums" suppressHydrationWarning aria-label="Elapsed time">
        {formatElapsed(now - Date.parse(session.startedAt))}
      </span>
      {label && (
        <span className="hidden max-w-48 truncate text-muted-foreground md:inline">{label}</span>
      )}
      {ai && <StuckButton session={session} />}
      <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setOpen(true)}>
        <CircleStop aria-hidden />
        Stop
      </Button>
      <StopSessionDialog session={session} open={open} onOpenChange={setOpen} />
    </div>
  );
}
