import Link from "next/link";
import { notFound } from "next/navigation";
import type { LoopStage } from "@prisma/client";
import { ArrowRight, CircleCheck, ChevronLeft, ExternalLink, RefreshCw } from "lucide-react";
import { aiEnabled } from "@/lib/ai/config";
import { ITEM_TYPE_LABEL, courseProgress, embedUrl, fmtTimestamp, nextItem } from "@/lib/courses";
import { db } from "@/lib/db";
import { fmtDateTime, fmtRelativeDays } from "@/lib/format";
import { sourceFromUrl } from "@/lib/reading";
import { STAGE_INFO } from "@/lib/stages";
import { cn, formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BuildCourseDialog } from "@/components/courses/build-course-dialog";
import { CourseActions } from "@/components/courses/course-actions";
import { DoneToggle } from "@/components/courses/done-toggle";
import { InlineCode } from "@/components/courses/inline-code";
import { TypeIcon } from "@/components/courses/type-icon";
import { VideoEmbed } from "@/components/courses/video-embed";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = await db.course.findUnique({
    where: { id: (await params).id },
    select: { title: true },
  });
  return { title: c?.title ?? "Course" };
}

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await db.course.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { position: "asc" },
        include: {
          items: { orderBy: { position: "asc" } },
          practice: { orderBy: { position: "asc" } },
          checkpoints: { orderBy: { position: "asc" } },
        },
      },
    },
  });
  if (!course) notFound();
  const ai = aiEnabled();

  const p = courseProgress(course.modules.flatMap((m) => m.items));
  const next = nextItem(course.modules);
  const nextModule = next ? course.modules.findIndex((m) => m.items.includes(next)) : -1;

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" /> Courses
        </Link>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
            <CourseActions course={{ id: course.id, title: course.title }} />
            <BuildCourseDialog
              ai={ai}
              course={{
                id: course.id,
                source: course.source,
                build: course.build,
                weeklyMinutes: course.weeklyMinutes,
                focus: course.focus,
              }}
            >
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-muted-foreground">
                <RefreshCw aria-hidden /> Rebuild
              </Button>
            </BuildCourseDialog>
          </div>
          {course.description && <p className="max-w-prose text-sm">{course.description}</p>}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span>
              {p.done} of {p.total} done ({p.percent}%)
            </span>
            {p.extraDone > 0 && <span>+{p.extraDone} extra</span>}
            {p.minutesLeft > 0 && <span>≈ {formatMinutes(p.minutesLeft)} left</span>}
            {course.level && <span className="capitalize">{course.level}</span>}
            <span>updated {fmtRelativeDays(course.updatedAt)}</span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Resources done"
          aria-valuenow={p.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 max-w-xl overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-success" style={{ width: `${p.percent}%` }} />
        </div>
        <nav aria-label="Modules" className="flex flex-wrap gap-1.5">
          {course.modules.map((m, i) => {
            const mp = courseProgress(m.items);
            const complete = mp.total > 0 && mp.done === mp.total;
            return (
              <a
                key={m.id}
                href={`#module-${i + 1}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs tabular-nums hover:bg-accent",
                  complete ? "border-success/40 text-success" : "text-muted-foreground",
                )}
                title={m.title}
              >
                {complete && <CircleCheck aria-hidden className="size-3" />}
                {i + 1}. <span className="max-w-40 truncate">{m.title}</span>
              </a>
            );
          })}
        </nav>
      </header>

      {next ? (
        <section
          aria-label="Up next"
          className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-xs"
        >
          <DoneToggle
            key={next.id}
            kind="item"
            id={next.id}
            done={false}
            label={`Mark “${next.title}” done`}
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              Up next · Module {nextModule + 1}
              {next.minutes ? ` · ${formatMinutes(next.minutes)}` : ""}
            </p>
            <p className="font-medium break-words">{next.title}</p>
          </div>
          <Button asChild size="sm">
            <a href={next.url} target="_blank" rel="noreferrer">
              Open <ExternalLink aria-hidden />
            </a>
          </Button>
        </section>
      ) : (
        p.total > 0 && (
          <section className="flex items-center gap-2 rounded-xl border border-success/40 p-4 text-sm">
            <CircleCheck aria-hidden className="size-5 text-success" />
            Every required resource is done. Finish the practice tasks, then write it up in your own
            words.
          </section>
        )
      )}

      {course.outcomes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">By the end you can</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {course.outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      <ol className="space-y-10">
        {course.modules.map((m, i) => {
          const mp = courseProgress(m.items);
          return (
            <li key={m.id} id={`module-${i + 1}`} className="scroll-mt-20 space-y-4">
              <div className="space-y-1 border-b pb-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Module {i + 1} · {mp.done} of {mp.total} done
                  {mp.minutesLeft > 0 && ` · ≈ ${formatMinutes(mp.minutesLeft)} left`}
                </p>
                <h2 className="text-lg font-semibold">{m.title}</h2>
                {m.goal && <p className="text-sm text-muted-foreground">{m.goal}</p>}
              </div>

              <ul className="divide-y rounded-lg border">
                {m.items.map((it) => {
                  const embed =
                    it.type === "VIDEO" || it.type === "PLAYLIST"
                      ? embedUrl(it.url, it.startSec, it.endSec)
                      : null;
                  return (
                    <li
                      key={it.id}
                      className={cn("flex gap-3 p-3", it.doneAt && "bg-muted/30")}
                      data-testid="course-item"
                    >
                      <DoneToggle
                        kind="item"
                        id={it.id}
                        done={!!it.doneAt}
                        label={`Mark “${it.title}” done`}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "block text-sm font-medium break-words hover:underline",
                            it.doneAt && "text-muted-foreground",
                          )}
                        >
                          {it.title}
                        </a>
                        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <TypeIcon type={it.type} className="size-3.5" />
                          <span>{ITEM_TYPE_LABEL[it.type]}</span>
                          <span>· {it.author ?? sourceFromUrl(it.url) ?? it.url}</span>
                          {it.minutes ? <span>· {formatMinutes(it.minutes)}</span> : null}
                          {(it.startSec != null || it.endSec != null) && (
                            <span>
                              · watch {it.startSec != null ? fmtTimestamp(it.startSec) : "0:00"}
                              {it.endSec != null ? `–${fmtTimestamp(it.endSec)}` : " onwards"}
                            </span>
                          )}
                          {!it.required && (
                            <Badge variant="outline" className="ml-1 py-0">
                              Extra
                            </Badge>
                          )}
                        </p>
                        {it.why && (
                          <p className="text-sm text-muted-foreground">
                            <InlineCode text={it.why} />
                          </p>
                        )}
                        {it.sections.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Focus on: {it.sections.join(" · ")}
                          </p>
                        )}
                        {embed && <VideoEmbed src={embed} title={it.title} />}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {m.practice.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Practice</h3>
                  <ul className="space-y-2">
                    {m.practice.map((t) => (
                      <li key={t.id} className="flex gap-3 rounded-lg border bg-muted/40 p-3">
                        <DoneToggle
                          kind="practice"
                          id={t.id}
                          done={!!t.doneAt}
                          label={`Mark practice task done: ${t.task}`}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm">
                            <StageBadge stage={t.stage} /> <InlineCode text={t.task} />
                          </p>
                          {t.doneWhen && (
                            <p className="text-xs text-muted-foreground">
                              Done when: <InlineCode text={t.doneWhen} />
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {m.checkpoints.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Checkpoint</h3>
                  <p className="text-xs text-muted-foreground">
                    Answer in your own words first, then check.
                  </p>
                  <ul className="space-y-1.5">
                    {m.checkpoints.map((c) => (
                      <li key={c.id}>
                        <details className="group rounded-lg border px-3 py-2 text-sm">
                          <summary className="cursor-pointer list-none font-medium marker:hidden">
                            <span className="flex items-start gap-2">
                              <ArrowRight
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90"
                              />
                              <InlineCode text={c.question} />
                            </span>
                          </summary>
                          <p className="mt-2 pl-6 text-muted-foreground">
                            <InlineCode text={c.answer} />
                          </p>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </li>
          );
        })}
      </ol>

      <section className="space-y-3 border-t pt-6 text-sm">
        <h2 className="font-semibold">How it was built</h2>
        <p className="text-muted-foreground">
          From “{course.subject}”,{" "}
          {course.build === "AI"
            ? `arranged by the AI for about ${formatMinutes(course.weeklyMinutes ?? 300)} a week${course.focus ? ` (focus: ${course.focus})` : ""}`
            : "grouped by topic"}
          , {fmtDateTime(course.updatedAt)}.
        </p>
        {course.gaps.length > 0 && (
          <div className="space-y-1">
            <h3 className="font-medium">Gaps</h3>
            <p className="text-xs text-muted-foreground">
              Nothing in the file covers these. Ask your LLM for resources and rebuild.
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {course.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        )}
        {course.unused.length > 0 && (
          <details>
            <summary className="cursor-pointer font-medium">
              Left out ({course.unused.length})
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {course.unused.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

function StageBadge({ stage }: { stage: LoopStage }) {
  return (
    <Badge variant="outline" className="mr-1 py-0 align-middle">
      <span aria-hidden className={cn("size-1.5 rounded-full", STAGE_INFO[stage].color)} />
      {STAGE_INFO[stage].label}
    </Badge>
  );
}
