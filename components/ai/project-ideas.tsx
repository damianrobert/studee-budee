"use client";

import * as React from "react";
import { Lightbulb, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/markdown/markdown";
import { suggestProjectIdeas, suggestStarterTopics } from "@/lib/actions/mentor";
import type { ProjectIdea, StarterTopic } from "@/lib/ai/mentor";

/** "Suggest ideas": the mentor proposes projects; picking one fills in the form. */
export function IdeaPicker({
  ideas,
  setIdeas,
  onPick,
}: {
  ideas: ProjectIdea[];
  setIdeas: (ideas: ProjectIdea[]) => void;
  onPick: (idea: ProjectIdea) => void;
}) {
  const [wish, setWish] = React.useState("");
  const [shown, setShown] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function suggest(more: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await suggestProjectIdeas({ wish, exclude: more ? shown : [] });
      if (!res.ok) return setError(res.error);
      const next = res.data ?? [];
      setIdeas(next);
      setShown((s) => [...(more ? s : []), ...next.map((i) => i.name)].slice(-40));
    });
  }

  return (
    <div className="space-y-4">
      <Field
        label="What do you want to practice?"
        htmlFor="idea-wish"
        hint="Optional. Technologies, a problem you have at home or at work, how big it should be."
      >
        <Textarea
          id="idea-wish"
          rows={2}
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder="e.g. Kubernetes networking and observability, something I'd actually use"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => suggest(false)}>
          <Sparkles aria-hidden /> {pending ? "Thinking up ideas…" : "Suggest ideas"}
        </Button>
        {ideas.length > 0 && (
          <Button type="button" variant="outline" disabled={pending} onClick={() => suggest(true)}>
            Different ones
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {ideas.length > 0 && (
        <ul className="space-y-3" aria-label="Project ideas">
          {ideas.map((idea) => (
            <li key={idea.name} className="space-y-2 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">{idea.name}</h3>
                  <p className="text-sm text-muted-foreground">{idea.pitch}</p>
                </div>
                <Button type="button" size="sm" onClick={() => onPick(idea)}>
                  Use this idea
                </Button>
              </div>
              {idea.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {idea.skills.map((s) => (
                    <Badge key={s} variant="outline">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Details
                </summary>
                <div className="mt-2 space-y-2">
                  <p>
                    <span className="text-muted-foreground">Goal:</span> {idea.goal}
                  </p>
                  <Markdown className="text-sm">{idea.description}</Markdown>
                  {idea.topics.length > 0 && (
                    <div>
                      <p className="text-muted-foreground">Starter topics:</p>
                      <ol className="list-decimal pl-5">
                        {idea.topics.map((t) => (
                          <li key={t.title}>{t.title}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type TopicChoice = StarterTopic & { keep: boolean };

/** Starter topics for a new project: from a picked idea, or suggested for your own idea. */
export function StarterTopics({
  topics,
  setTopics,
  idea,
}: {
  topics: TopicChoice[];
  setTopics: (t: TopicChoice[]) => void;
  /** The project as typed so far, to suggest topics for. */
  idea: { name: string; goal: string; description: string };
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Starter topics</legend>
      {topics.length > 0 ? (
        <ul className="space-y-1.5">
          {topics.map((t, i) => (
            <li key={`${i}-${t.title}`}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={t.keep}
                  onChange={(e) =>
                    setTopics(
                      topics.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)),
                    )
                  }
                />
                <span>
                  <span className="font-medium">{t.title}</span>
                  {t.description && (
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Topics go into the Pain column of the board. Add your own later, or let the mentor suggest
          a few from your description.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || !idea.name.trim()}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await suggestStarterTopics(idea);
            if (!res.ok) return setError(res.error);
            setTopics((res.data ?? []).map((t) => ({ ...t, keep: true })));
          });
        }}
      >
        <Lightbulb aria-hidden />
        {pending ? "Suggesting…" : topics.length ? "Suggest again" : "Suggest starter topics"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
