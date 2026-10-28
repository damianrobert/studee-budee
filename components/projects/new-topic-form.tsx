"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createTopic } from "@/lib/actions/projects";

export function NewTopicForm({ projectId }: { projectId: string }) {
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      className="mt-2 flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        startTransition(async () => {
          const res = await createTopic(projectId, { title });
          if (res.ok) {
            setTitle("");
            setError(null);
          } else setError(res.error);
        });
      }}
    >
      <Input
        aria-label="New topic title"
        placeholder="New topic…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 bg-background text-sm"
        aria-invalid={!!error}
      />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        className="size-8 shrink-0"
        disabled={pending}
        aria-label="Add topic"
      >
        <Plus />
      </Button>
    </form>
  );
}
