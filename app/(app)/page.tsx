import Link from "next/link";
import type { LoopStage } from "@prisma/client";
import { ArrowRight, Flame, Footprints, Plus, Target } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate, fmtRelativeDays } from "@/lib/format";
import { getNudges } from "@/lib/nudges";
import {
  currentWeekRange,
  getLastNextStep,
  getProjectOptions,
  getRunningSession,
  getSessionDefaults,
  getStreakSummary,
} from "@/lib/sessions";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StageBar } from "@/components/projects/stage-bar";
import { LogSessionDialog } from "@/components/sessions/log-session-dialog";
import { QuickStartButton } from "@/components/sessions/quick-start-button";
import { StartSessionDialog } from "@/components/sessions/start-session-dialog";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const week = currentWeekRange();
  const [next, running, streak, settings, weekSessions, retro, active, projects, defaults, nudges] =
    await Promise.all([
      getLastNextStep(),
      getRunningSession(),
      getStreakSummary(),
      getSettings(),
      db.session.count({
        where: { endedAt: { not: null }, startedAt: { gte: week.start, lt: week.end } },
      }),
      db.weeklyRetro.findFirst({
        orderBy: { weekStart: "desc" },
        select: { nextWeekGoal: true, weekStart: true },
      }),
      db.project.findFirst({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, goal: true, topics: { select: { stage: true } } },
      }),
      getProjectOptions(),
      getSessionDefaults(),
      getNudges(),
    ]);

  const counts: Partial<Record<LoopStage, number>> = {};
  for (const t of active?.topics ?? []) counts[t.stage] = (counts[t.stage] ?? 0) + 1;
  const target = settings.weeklyTarget;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="sr-only">Today</h1>

      {/* 1. Next step */}
      <Card className="border-foreground/15">
        <CardHeader className="pb-2">
          <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Footprints className="size-4" aria-hidden /> Next step
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {next?.nextStep ? (
            <>
              <p className="text-xl leading-snug font-medium whitespace-pre-wrap">
                {next.nextStep}
              </p>
              <p className="text-sm text-muted-foreground">
                {next.project && (
                  <Link href={`/projects/${next.project.id}`} className="hover:underline">
                    {next.project.name}
                  </Link>
                )}
                {next.topic && ` · ${next.topic.title}`}
                {next.endedAt && ` · written ${fmtRelativeDays(next.endedAt)}`}
              </p>
            </>
          ) : (
            <p className="text-xl font-medium">Start your first session.</p>
          )}
        </CardContent>
      </Card>

      {/* 2. Start */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {running ? (
          <p className="rounded-lg border bg-success/10 px-4 py-3 text-sm">
            A session is running{running.project && ` on ${running.project.name}`}. Stop it from the
            header when you&apos;re done.
          </p>
        ) : (
          <>
            <QuickStartButton size="lg" className="sm:min-w-56" />
            <StartSessionDialog projects={projects} defaults={defaults}>
              <Button variant="ghost">Choose project / topic…</Button>
            </StartSessionDialog>
          </>
        )}
        <span className="flex-1" />
        <LogSessionDialog projects={projects} defaults={defaults}>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Plus aria-hidden /> Log past session
          </Button>
        </LogSessionDialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 3. Streak */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="size-4 text-warning" aria-hidden /> Streak
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-6">
              <p>
                <span className="text-3xl font-semibold tabular-nums">{streak.current}</span>{" "}
                <span className="text-sm text-muted-foreground">
                  day{streak.current === 1 ? "" : "s"}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">Longest: {streak.longest}</p>
            </div>
            <ol className="flex justify-between gap-1" aria-label="Last 7 days">
              {streak.last7.map((d) => (
                <li key={d.day} className="flex flex-col items-center gap-1">
                  <span
                    title={`${d.day}: ${d.minutes} min`}
                    className={cn(
                      "size-6 rounded-full border-2",
                      d.counted
                        ? "border-success bg-success"
                        : d.minutes > 0
                          ? "border-success/50"
                          : "border-border",
                      d.day === streak.today && "ring-2 ring-ring ring-offset-2 ring-offset-card",
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-GB", {
                      weekday: "narrow",
                      timeZone: "UTC",
                    })}
                  </span>
                  <span className="sr-only">
                    {d.day} {d.counted ? "counted" : "not counted"}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              A day counts at {streak.minMinutes}+ minutes.
            </p>
          </CardContent>
        </Card>

        {/* 4. This week */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4" aria-hidden /> This week
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {retro?.nextWeekGoal ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Goal:</span> {retro.nextWeekGoal}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No goal yet.{" "}
                <Link href="/retros" className="underline">
                  Your weekly retro
                </Link>{" "}
                sets one.
              </p>
            )}
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span>Sessions</span>
                <span className="tabular-nums">
                  {weekSessions} / {target}
                </span>
              </div>
              <div className="flex gap-1" aria-hidden>
                {Array.from({ length: Math.max(target, weekSessions) }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-2 flex-1 rounded-full",
                      i < weekSessions ? "bg-success" : "bg-muted",
                    )}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Week of {fmtDate(week.start, { day: "numeric", month: "short" })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 5. Active project */}
      <Card>
        <CardHeader>
          <CardTitle>Active project</CardTitle>
        </CardHeader>
        <CardContent>
          {active ? (
            <Link href={`/projects/${active.id}`} className="group block space-y-3">
              <div>
                <p className="font-medium group-hover:underline">{active.name}</p>
                {active.goal && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{active.goal}</p>
                )}
              </div>
              <StageBar counts={counts} />
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                Open board <ArrowRight className="size-3" aria-hidden />
              </p>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active project.{" "}
              <Link href="/projects" className="underline">
                Pick one
              </Link>{" "}
              — one at a time keeps you finishing things.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 6. Nudges (max 2) */}
      {nudges.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {nudges.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 text-sm hover:bg-accent/50"
              >
                <span>{n.text}</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {n.cta} <ArrowRight className="size-3" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
