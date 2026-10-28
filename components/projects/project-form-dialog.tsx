"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { Field, Input, Textarea } from "@/components/ui/input";
import { createProject, updateProject } from "@/lib/actions/projects";
import type { ProjectIdea } from "@/lib/ai/mentor";
import { cn } from "@/lib/utils";
import { IdeaPicker, StarterTopics, type TopicChoice } from "@/components/ai/project-ideas";

type ProjectFields = { name: string; goal: string; description: string; repoUrl: string };

export function ProjectFormDialog({
  project,
  ai = false,
  children,
}: {
  /** AI on: a new project can start from a suggested idea and get starter topics. */
  ai?: boolean;
  project?: {
    id: string;
    name: string;
    goal: string | null;
    description: string | null;
    repoUrl: string | null;
  };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const initial: ProjectFields = {
    name: project?.name ?? "",
    goal: project?.goal ?? "",
    description: project?.description ?? "",
    repoUrl: project?.repoUrl ?? "",
  };
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(initial);
  const withAi = ai && !project;
  const [mode, setMode] = React.useState<"own" | "ideas">("own");
  const [ideas, setIdeas] = React.useState<ProjectIdea[]>([]);
  const [topics, setTopics] = React.useState<TopicChoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set =
    (k: keyof ProjectFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      if (project) {
        const res = await updateProject(project.id, v);
        if (!res.ok) return setError(res.error);
        setOpen(false);
      } else {
        const keep = topics.filter((t) => t.keep);
        const res = await createProject({ ...v, topics: keep });
        if (!res.ok) return setError(res.error);
        setOpen(false);
        router.push(`/projects/${res.data}`);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(initial);
          setError(null);
          setMode("own");
          setIdeas([]);
          setTopics([]);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className={withAi ? "max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            A project is something you build end to end, topic by topic.
            {withAi && " Bring your own idea or let the mentor suggest some."}
          </DialogDescription>
        </DialogHeader>
        {withAi && (
          <div
            role="radiogroup"
            aria-label="Start from"
            className="mb-4 flex rounded-md border p-0.5"
          >
            {(
              [
                ["own", "My own idea"],
                ["ideas", "Suggest ideas"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded px-3 py-1.5 text-sm",
                  mode === m
                    ? "bg-accent font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {withAi && mode === "ideas" ? (
          <IdeaPicker
            ideas={ideas}
            setIdeas={setIdeas}
            onPick={(idea) => {
              setV((prev) => ({
                ...prev,
                name: idea.name,
                goal: idea.goal,
                description: idea.description,
              }));
              setTopics(idea.topics.map((t) => ({ ...t, keep: true })));
              setMode("own");
            }}
          />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Name" htmlFor="project-name">
              <Input id="project-name" required value={v.name} onChange={set("name")} autoFocus />
            </Field>
            <Field label="Goal" htmlFor="project-goal" hint="What does “done” look like?">
              <Textarea id="project-goal" rows={2} value={v.goal} onChange={set("goal")} />
            </Field>
            <Field label="Description" htmlFor="project-description" hint="Markdown supported.">
              <Textarea
                id="project-description"
                rows={4}
                value={v.description}
                onChange={set("description")}
              />
            </Field>
            <Field label="Repository URL" htmlFor="project-repo">
              <Input
                id="project-repo"
                type="url"
                value={v.repoUrl}
                onChange={set("repoUrl")}
                placeholder="https://github.com/…"
              />
            </Field>
            {withAi && <StarterTopics topics={topics} setTopics={setTopics} idea={v} />}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : project ? "Save" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
