"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fromLocalInput, toLocalInput } from "@/lib/client-time";
import { StopSessionDialog, type ClientSession } from "./stop-session-dialog";

export function ForgottenSessionBanner({ session }: { session: ClientSession }) {
  const started = new Date(session.startedAt);
  const [end, setEnd] = React.useState(() =>
    toLocalInput(new Date(started.getTime() + 60 * 60_000)),
  );
  const [endedAt, setEndedAt] = React.useState<Date | undefined>();
  const [open, setOpen] = React.useState(false);
  const parsed = fromLocalInput(end);
  const valid = !!parsed && parsed > started && parsed <= new Date();

  return (
    <div role="status" className="border-b bg-warning/10 px-4 py-3 text-sm sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <TriangleAlert className="size-4 text-warning" aria-hidden />
        <span className="flex-1">
          This session has been running for over 4 hours. Did you forget to stop it?
        </span>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Actually ended at</span>
          <Input
            type="datetime-local"
            value={end}
            min={toLocalInput(started)}
            onChange={(e) => setEnd(e.target.value)}
            className="h-8 w-auto"
          />
        </label>
        <Button
          size="sm"
          disabled={!valid}
          onClick={() => {
            setEndedAt(parsed ?? undefined);
            setOpen(true);
          }}
        >
          Stop at that time
        </Button>
      </div>
      <StopSessionDialog session={session} open={open} onOpenChange={setOpen} endedAt={endedAt} />
    </div>
  );
}
