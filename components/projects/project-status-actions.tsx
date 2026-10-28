"use client";

import * as React from "react";
import type { ProjectStatus } from "@prisma/client";
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
import { deleteProject, setProjectStatus } from "@/lib/actions/projects";

export const WIP_LINE = "One project at a time keeps you finishing things.";

export function ActivateButton({
  projectId,
  currentActive,
  size = "sm",
}: {
  projectId: string;
  currentActive: { id: string; name: string } | null;
  size?: "sm" | "default";
}) {
  const [pending, startTransition] = React.useTransition();
  const activate = () =>
    startTransition(async () => void (await setProjectStatus(projectId, "ACTIVE")));

  if (!currentActive || currentActive.id === projectId) {
    return (
      <Button size={size} onClick={activate} disabled={pending}>
        Make active
      </Button>
    );
  }
  return (
    <Confirm
      title="Switch the active project?"
      description={
        <>
          <p>
            <strong>{currentActive.name}</strong> will be paused.
          </p>
          <p className="mt-2">{WIP_LINE}</p>
        </>
      }
      confirmLabel="Pause it and switch"
      destructive={false}
      onConfirm={() => setProjectStatus(projectId, "ACTIVE").then(() => undefined)}
    >
      <Button size={size}>Make active</Button>
    </Confirm>
  );
}

export function ProjectStatusActions({
  project,
  currentActive,
}: {
  project: { id: string; name: string; status: ProjectStatus };
  currentActive: { id: string; name: string } | null;
}) {
  const [pending, startTransition] = React.useTransition();
  const set = (s: ProjectStatus) =>
    startTransition(async () => void (await setProjectStatus(project.id, s)));
  return (
    <>
      {project.status !== "ACTIVE" && (
        <ActivateButton projectId={project.id} currentActive={currentActive} />
      )}
      {project.status === "ACTIVE" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set("PAUSED")}>
          Pause
        </Button>
      )}
      {project.status !== "DONE" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set("DONE")}>
          Mark done
        </Button>
      )}
      {project.status !== "ARCHIVED" ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("ARCHIVED")}>
          Archive
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("PAUSED")}>
          Unarchive
        </Button>
      )}
      <DeleteProjectDialog projectId={project.id} name={project.name} />
    </>
  );
}

function DeleteProjectDialog({ projectId, name }: { projectId: string; name: string }) {
  const [deleteContent, setDeleteContent] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{name}”?</DialogTitle>
          <DialogDescription>
            Its topics and their stage history are deleted. Sessions are kept but unlinked.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-2 font-medium">Notes and postmortems linked to this project</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="del-content"
              checked={!deleteContent}
              onChange={() => setDeleteContent(false)}
            />
            Keep them, just unlink
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="del-content"
              checked={deleteContent}
              onChange={() => setDeleteContent(true)}
            />
            Delete them too
          </label>
        </fieldset>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => void (await deleteProject(projectId, deleteContent)))
            }
          >
            {pending ? "Deleting…" : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
