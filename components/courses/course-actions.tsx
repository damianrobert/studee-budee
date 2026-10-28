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
import { deleteCourse, renameCourse } from "@/lib/actions/courses";

export function CourseActions({ course }: { course: { id: string; title: string } }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(course.title);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Rename course"
        onClick={() => {
          setTitle(course.title);
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Course</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await renameCourse(course.id, title);
                if (res.ok) setOpen(false);
                else setError(res.error);
              });
            }}
          >
            <Field label="Title" htmlFor="course-title">
              <Input
                id="course-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </Field>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <DialogFooter className="sm:justify-between">
              <Confirm
                title={`Delete “${course.title}”?`}
                description="All its modules, resources and progress are deleted. Your resources file is not affected."
                onConfirm={async () => {
                  await deleteCourse(course.id);
                  router.push("/courses");
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                >
                  Delete course
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
