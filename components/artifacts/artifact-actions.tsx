"use client";

import * as React from "react";
import type { ArtifactStatus } from "@prisma/client";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { deleteArtifact, setArtifactStatus } from "@/lib/actions/artifacts";
import { ARTIFACT_STATUSES, ARTIFACT_STATUS_LABEL } from "@/lib/artifacts";
import { cn } from "@/lib/utils";
import { ArtifactFormDialog, type ArtifactValues } from "./artifact-form-dialog";

const ACTIVE: Record<ArtifactStatus, string> = {
  IDEA: "bg-secondary text-secondary-foreground border-foreground/30",
  DRAFT: "bg-warning/15 text-warning border-warning/40",
  PUBLISHED: "bg-success/15 text-success border-success/40",
};

/** Idea → Draft → Published as a segmented control; click a step to move there. */
export function StatusPills({ id, status }: { id: string; status: ArtifactStatus }) {
  const [optimistic, setOptimistic] = React.useOptimistic(status);
  const [, startTransition] = React.useTransition();
  return (
    <div role="radiogroup" aria-label="Status" className="inline-flex rounded-full border p-0.5">
      {ARTIFACT_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={optimistic === s}
          onClick={() =>
            s !== optimistic &&
            startTransition(async () => {
              setOptimistic(s);
              await setArtifactStatus(id, s);
            })
          }
          className={cn(
            "rounded-full border border-transparent px-2.5 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            optimistic === s ? ACTIVE[s] : "text-muted-foreground hover:text-foreground",
          )}
        >
          {ARTIFACT_STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

export function ArtifactActions({ artifact }: { artifact: { id: string } & ArtifactValues }) {
  return (
    <div className="flex items-center">
      <ArtifactFormDialog artifact={artifact}>
        <Button variant="ghost" size="sm" aria-label={`Edit ${artifact.title}`}>
          <Pencil aria-hidden />
        </Button>
      </ArtifactFormDialog>
      <Confirm
        title="Delete this artifact?"
        description="It's deleted permanently. Its source note or postmortem is kept."
        onConfirm={() => deleteArtifact(artifact.id).then(() => undefined)}
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${artifact.title}`}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden />
        </Button>
      </Confirm>
    </div>
  );
}
