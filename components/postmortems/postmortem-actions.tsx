"use client";

import * as React from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { deletePostmortem } from "@/lib/actions/postmortems";

export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  React.useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(markdown);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
    >
      {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
      Copy as Markdown
      <span role="status" aria-live="polite" className="text-muted-foreground">
        {state === "copied" ? "· Copied" : state === "failed" ? "· Copy failed" : ""}
      </span>
    </Button>
  );
}

export function DeletePostmortemButton({ id }: { id: string }) {
  return (
    <Confirm
      title="Delete this postmortem?"
      description="It's deleted permanently. Attached files stay in Files."
      onConfirm={() => deletePostmortem(id).then(() => undefined)}
    >
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
        <Trash2 aria-hidden /> Delete
      </Button>
    </Confirm>
  );
}
