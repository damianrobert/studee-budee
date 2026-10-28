"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { Field, Textarea } from "@/components/ui/input";
import { createRoadmap } from "@/lib/actions/roadmaps";
import { AiWorking } from "./ai-working";

const EXAMPLES = [
  "Kubernetes from zero to running my own homelab cluster. I know Docker and Linux basics.",
  "Serving LLMs in production: GPUs, vLLM, autoscaling and monitoring. I'm a backend developer.",
  "Terraform on AWS for someone who has only clicked around the console.",
];

/** "New roadmap": describe what you want to learn; the AI plans it and finds resources. */
export function NewRoadmapDialog({
  webSearch,
  children,
}: {
  webSearch: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createRoadmap(prompt);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      setPrompt("");
      router.push(`/roadmaps/${res.data}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {children ?? (
          <Button>
            <Plus aria-hidden /> New roadmap
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New roadmap</DialogTitle>
          <DialogDescription>
            Say what you want to learn, what you already know and where you want to end up. The AI
            plans the stages and steps and finds{" "}
            {webSearch ? "resources on the web" : "well-known resources"} for each step.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="What do you want to learn?" htmlFor="roadmap-prompt">
            <Textarea
              id="roadmap-prompt"
              rows={5}
              value={prompt}
              disabled={pending}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (prompt.trim()) submit();
                }
              }}
              placeholder="e.g. Observability for Kubernetes: Prometheus, Grafana, logs and tracing. I run a few services at work but never set up monitoring myself."
              required
            />
          </Field>
          {!prompt && !pending && (
            <div className="flex flex-wrap gap-1.5" aria-label="Examples">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="rounded-full border px-2.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
          {!webSearch && (
            <p className="text-xs text-muted-foreground">
              Web search is off, so links come from the AI&apos;s memory and may be out of date. Set{" "}
              <code>BRAVE_SEARCH_API_KEY</code> to find real, current pages.
            </p>
          )}
          {pending && (
            <AiWorking>
              Planning the stages and steps, {webSearch ? "searching the web" : "looking"} for
              resources for each step and picking the best ones. This usually takes under a minute.
            </AiWorking>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending || !prompt.trim()}>
              {pending ? "Building your roadmap…" : "Create roadmap"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
