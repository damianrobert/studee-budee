"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RefreshCw, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/markdown/markdown";
import { clearMentorChat, rebuildMentorMemory, saveMentorMemory } from "@/lib/actions/mentor";
import { cn } from "@/lib/utils";
import { useAiStream } from "./use-ai-stream";

export type MentorMessageView = {
  id: string;
  role: "USER" | "MENTOR";
  content: string;
  solution: boolean;
};

const STARTERS = [
  "What should I work on next?",
  "Here's my plan for the current topic. What am I missing?",
  "I'm stuck. Ask me questions until we find where.",
  "What could I break on purpose in this project?",
];

/**
 * The project mentor: a conversation that nudges instead of solving (unless "Give me the
 * solution" is ticked for a message), and the memory it keeps about the project.
 */
export function Mentor({
  projectId,
  messages: initial,
  memory,
  memoryUpdated,
  context,
}: {
  projectId: string;
  messages: MentorMessageView[];
  memory: string | null;
  /** Formatted "updated" time of the memory, or null. */
  memoryUpdated: string | null;
  /** Everything else the mentor is told about the project, as sent. */
  context: string;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"chat" | "memory">("chat");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="space-y-1 pr-6">
        <h2 className="text-lg font-semibold">Mentor</h2>
        <p className="text-sm text-muted-foreground">
          Nudges, not answers. It knows this project: topics, sessions, notes, postmortems and what
          you talked about before.
        </p>
      </div>
      <div role="tablist" aria-label="Mentor" className="flex gap-1 border-b">
        {(["chat", "memory"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              // The memory is updated in the background after each answer.
              if (t === "memory") router.refresh();
            }}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === t
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "chat" ? "Conversation" : "Memory"}
          </button>
        ))}
      </div>
      {tab === "chat" ? (
        <Chat projectId={projectId} initial={initial} />
      ) : (
        <Memory
          projectId={projectId}
          memory={memory}
          memoryUpdated={memoryUpdated}
          context={context}
        />
      )}
    </div>
  );
}

function Chat({ projectId, initial }: { projectId: string; initial: MentorMessageView[] }) {
  const [messages, setMessages] = React.useState(initial);
  const [draft, setDraft] = React.useState("");
  const [solution, setSolution] = React.useState(false);
  const [pending, setPending] = React.useState<{ content: string; solution: boolean } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const reply = useAiStream();
  const end = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending, reply.text]);

  async function send() {
    const message = draft.trim();
    if (!message || reply.streaming) return;
    const asked = { content: message, solution };
    setPending(asked);
    setDraft("");
    setError(null);
    const answer = await reply.run("/api/ai/mentor", { projectId, message, solution });
    setPending(null);
    if (answer === null) {
      // Nothing was saved (the hook has the error): put the question back to send again.
      setDraft(message);
      return;
    }
    const stamp = Date.now();
    setMessages((m) => [
      ...m,
      { id: `u${stamp}`, role: "USER", ...asked },
      { id: `m${stamp}`, role: "MENTOR", content: answer, solution: asked.solution },
    ]);
    // A solution is unlocked for one message only.
    setSolution(false);
    reply.reset();
    input.current?.focus();
  }

  return (
    <>
      <div
        className="-mx-2 min-h-0 flex-1 space-y-4 overflow-y-auto px-2"
        aria-live="polite"
        aria-busy={reply.streaming}
      >
        {messages.length === 0 && !pending && (
          <div className="space-y-3 py-4 text-sm text-muted-foreground">
            <p>
              Tell it what you&apos;re working on or where you&apos;re stuck. It asks questions and
              points you the right way, but won&apos;t write the solution unless you tick{" "}
              <span className="font-medium text-foreground">Give me the solution</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setDraft(s);
                    input.current?.focus();
                  }}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} solution={m.solution}>
            {m.content}
          </Bubble>
        ))}
        {pending && (
          <>
            <Bubble role="USER" solution={pending.solution}>
              {pending.content}
            </Bubble>
            {reply.text ? (
              <Bubble role="MENTOR" solution={pending.solution}>
                {reply.text}
              </Bubble>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                {pending.solution ? "Working out the solution…" : "Thinking…"}
              </p>
            )}
          </>
        )}
        <div ref={end} />
      </div>

      <form
        className="space-y-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {(reply.error || error) && (
          <p role="alert" className="text-sm text-destructive">
            {reply.error || error}
          </p>
        )}
        <Textarea
          ref={input}
          aria-label="Message the mentor"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="What are you working on? Where are you stuck?"
          disabled={reply.streaming}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
              solution && "border-warning bg-warning/10",
            )}
          >
            <input
              type="checkbox"
              checked={solution}
              onChange={(e) => setSolution(e.target.checked)}
              className="size-4 accent-current"
            />
            <KeyRound aria-hidden className="size-4" />
            Give me the solution
          </label>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Confirm
                title="Clear the conversation?"
                description="The messages are deleted. The mentor's memory of this project is kept."
                confirmLabel="Clear"
                onConfirm={async () => {
                  const res = await clearMentorChat(projectId);
                  if (res.ok) setMessages([]);
                  else setError(res.error);
                }}
              >
                <Button type="button" variant="ghost" size="icon" aria-label="Clear conversation">
                  <Trash2 />
                </Button>
              </Confirm>
            )}
            <Button type="submit" size="sm" disabled={reply.streaming || !draft.trim()}>
              <Send aria-hidden /> Send
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {solution
            ? "This message gets the full solution. The next one goes back to nudges."
            : "Ctrl+Enter to send. You'll get hints and questions, not code."}
        </p>
      </form>
    </>
  );
}

function Bubble({
  role,
  solution,
  children,
}: {
  role: "USER" | "MENTOR";
  solution: boolean;
  children: string;
}) {
  if (role === "USER")
    return (
      <div className="ml-8 space-y-1 rounded-xl bg-accent px-3 py-2 text-sm">
        {solution && (
          <Badge variant="warning">
            <KeyRound aria-hidden className="size-3" /> Asked for the solution
          </Badge>
        )}
        <p className="whitespace-pre-wrap">{children}</p>
      </div>
    );
  return (
    <div className="mr-4 space-y-1">
      {solution && <Badge variant="warning">Solution</Badge>}
      <Markdown className="text-sm">{children}</Markdown>
    </div>
  );
}

function Memory({
  projectId,
  memory,
  memoryUpdated,
  context,
}: {
  projectId: string;
  memory: string | null;
  memoryUpdated: string | null;
  context: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(memory ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      <p className="text-sm text-muted-foreground">
        The mentor&apos;s own notes on this project: what&apos;s done, what&apos;s next, decisions
        and where you struggled. It rewrites them after each conversation. Fix anything that&apos;s
        wrong.
      </p>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await saveMentorMemory(projectId, draft);
              if (!res.ok) return setError(res.error);
              setEditing(false);
              setError(null);
              router.refresh();
            });
          }}
        >
          <Textarea
            aria-label="Mentor memory"
            rows={16}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          {memory ? (
            <div className="rounded-xl border p-3">
              <Markdown className="text-sm">{memory}</Markdown>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Empty. The mentor writes it after your first conversation, or rebuild it now from what
              the project already has.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(memory ?? "");
                setEditing(true);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await rebuildMentorMemory(projectId);
                  if (!res.ok) return setError(res.error);
                  router.refresh();
                })
              }
            >
              <RefreshCw aria-hidden className={cn(pending && "animate-spin")} />
              {pending ? "Rebuilding…" : "Rebuild"}
            </Button>
            {memoryUpdated && (
              <span className="text-xs text-muted-foreground">Updated {memoryUpdated}</span>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <details className="rounded-xl border p-3 text-sm">
        <summary className="cursor-pointer font-medium">What else the mentor sees</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Read fresh from the app with every message, so it&apos;s always current.
        </p>
        <pre className="mt-2 text-xs whitespace-pre-wrap">{context}</pre>
      </details>
    </div>
  );
}
