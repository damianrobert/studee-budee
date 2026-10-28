"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { deleteRoadmap, renameRoadmap } from "@/lib/actions/roadmaps";

export function RoadmapActions({ roadmap }: { roadmap: { id: string; title: string } }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(roadmap.title);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Rename roadmap"
        onClick={() => {
          setTitle(roadmap.title);
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roadmap</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await renameRoadmap(roadmap.id, title);
                if (res.ok) setOpen(false);
                else setError(res.error);
              });
            }}
          >
            <Field label="Title" htmlFor="roadmap-title">
              <Input
                id="roadmap-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </Field>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <DialogFooter className="sm:justify-between">
              <Confirm
                title={`Delete “${roadmap.title}”?`}
                description="All its stages, steps, resources and change history are deleted."
                onConfirm={async () => {
                  await deleteRoadmap(roadmap.id);
                  router.push("/roadmaps");
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                >
                  Delete roadmap
                </Button>
              </Confirm>
              <Button type="submit" disabled={pending || !title.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
