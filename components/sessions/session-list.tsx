import Link from "next/link";
import type { LoopStage } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { STAGE_INFO } from "@/lib/stages";
import { cn, formatMinutes } from "@/lib/utils";
import { DeleteSessionButton } from "./delete-session-button";

export type SessionRow = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMin: number | null;
  stage: LoopStage | null;
  summary: string | null;
  producedOutput: boolean;
  outputLink: string | null;
  nextStep: string | null;
  project: { id: string; name: string } | null;
  topic: { id: string; title: string } | null;
};

export function SessionList({
  sessions,
  showProject = true,
}: {
  sessions: SessionRow[];
  showProject?: boolean;
}) {
  return (
    <ul className="divide-y rounded-xl border">
      {sessions.map((s) => (
        <li key={s.id} className="space-y-1.5 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{fmtDateTime(s.startedAt)}</span>
            <span className="text-muted-foreground">
              {s.endedAt ? formatMinutes(s.durationMin ?? 0) : "running"}
            </span>
            {s.stage && (
              <Badge variant="outline">
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", STAGE_INFO[s.stage].color)}
                />
                {STAGE_INFO[s.stage].label}
              </Badge>
            )}
            {s.producedOutput && <Badge variant="success">output</Badge>}
            {showProject && s.project && (
              <Link
                href={`/projects/${s.project.id}`}
                className="text-muted-foreground hover:underline"
              >
                {s.project.name}
                {s.topic && ` · ${s.topic.title}`}
              </Link>
            )}
            {!showProject && s.topic && (
              <span className="text-muted-foreground">{s.topic.title}</span>
            )}
            <span className="flex-1" />
            {s.endedAt && <DeleteSessionButton id={s.id} />}
          </div>
          {s.summary && <p className="whitespace-pre-wrap">{s.summary}</p>}
          {s.outputLink && (
            <a
              href={s.outputLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden />
              {s.outputLink}
            </a>
          )}
          {s.nextStep && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Next:</span> {s.nextStep}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
