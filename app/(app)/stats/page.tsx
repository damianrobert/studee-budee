import Link from "next/link";
import { AlertTriangle, ArrowRight, Flame } from "lucide-react";
import { STAGE_INFO } from "@/lib/stages";
import {
  dayShortLabel,
  getStats,
  LOOP_BALANCE_MIN_SESSIONS,
  LOOP_BALANCE_MIN_SHARE,
  monthShortLabel,
  STATS_WEEKS,
} from "@/lib/stats";
import { addDays } from "@/lib/time";
import { monthLabel } from "@/lib/artifacts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatBarChart, type BarRow } from "@/components/stats/bar-chart";
import { Heatmap } from "@/components/stats/heatmap";

export const metadata = { title: "Stats" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function monthRows(rows: { month: string; count: number }[], word: string): BarRow[] {
  return rows.map((r) => ({
    label: monthShortLabel(r.month),
    title: monthLabel(r.month),
    value: r.count,
    text: plural(r.count, word),
  }));
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function StatsPage() {
  const s = await getStats();
  const weekTitle = (w: string) => `Week of ${dayShortLabel(w)} – ${dayShortLabel(addDays(w, 6))}`;

  const sessionRows: BarRow[] = s.weekly.map((w) => ({
    label: dayShortLabel(w.week),
    title: weekTitle(w.week),
    value: w.sessions,
    text: plural(w.sessions, "session"),
    detail: w.sessions ? `${w.minutes} min` : undefined,
  }));
  const outputRows: BarRow[] = s.weekly.map((w) => ({
    label: dayShortLabel(w.week),
    title: weekTitle(w.week),
    value: w.outputPct,
    text: w.outputPct === null ? "No sessions" : `${w.outputPct}% with output`,
    detail: w.sessions ? `${w.withOutput} of ${w.sessions}` : undefined,
  }));
  const weeksOnTarget = s.weekly.filter((w) => w.sessions >= s.weeklyTarget).length;
  const recentSessions = s.weekly.reduce((n, w) => n + w.sessions, 0);
  const recentOutput = s.weekly.reduce((n, w) => n + w.withOutput, 0);
  const artifactsTotal = s.artifactsByMonth.reduce((n, m) => n + m.count, 0);
  const readingTotal = s.readingByMonth.reduce((n, m) => n + m.count, 0);
  const weakLabels = s.loop.weak.map((st) => STAGE_INFO[st].label.toLowerCase());
  const topShare = Math.max(...s.loop.rows.map((r) => r.share), 0);

  return (
    <>
      <PageHeader
        title="Stats"
        description="Proof, not hours: days you showed up, things you finished, things you shipped."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/sessions">
              Session history <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Activity + streaks */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle>Activity, last 365 days</CardTitle>
              <CardDescription>
                {plural(s.countedLastYear, "counted day")} · {plural(s.sessionsLastYear, "session")}
              </CardDescription>
            </div>
            <div className="flex gap-8">
              <Stat
                label="Current streak"
                value={
                  <span className="flex items-center gap-1.5">
                    <Flame className="size-5 text-warning" aria-hidden />
                    {plural(s.streaks.current, "day")}
                  </span>
                }
              />
              <Stat label="Longest streak" value={plural(s.streaks.longest, "day")} />
            </div>
          </CardHeader>
          <CardContent>
            <Heatmap weeks={s.heatmap} minMinutes={s.minMinutes} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Sessions per week</CardTitle>
              <CardDescription>
                Target met in {weeksOnTarget} of the last {STATS_WEEKS} weeks (target{" "}
                {s.weeklyTarget}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatBarChart
                data={sessionRows}
                caption={`Sessions per week, last ${STATS_WEEKS} weeks`}
                valueHeading="Sessions"
                target={s.weeklyTarget}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sessions with visible output</CardTitle>
              <CardDescription>
                {recentSessions
                  ? `${Math.round((recentOutput / recentSessions) * 100)}% over the last ${STATS_WEEKS} weeks (${recentOutput} of ${recentSessions}).`
                  : "A commit, a note, a diagram: anything someone else could see."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatBarChart
                data={outputRows}
                caption={`Share of sessions with visible output per week, last ${STATS_WEEKS} weeks`}
                valueHeading="With output"
                max={100}
                unit="%"
              />
            </CardContent>
          </Card>

          {/* Loop balance */}
          <Card>
            <CardHeader>
              <CardTitle>Loop balance</CardTitle>
              <CardDescription>
                Sessions per stage, last {STATS_WEEKS} weeks
                {s.loop.untagged > 0 && ` (${s.loop.untagged} without a stage not shown)`}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {weakLabels.length > 0 && (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  You&apos;re building but not {weakLabels.join(" or ")}ing — under{" "}
                  {LOOP_BALANCE_MIN_SHARE * 100}% of your sessions.
                </p>
              )}
              {s.loop.tagged === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Pick a loop stage when you stop a session and the balance shows up here.
                </p>
              ) : (
                <ul className="space-y-2.5" aria-label="Sessions per stage">
                  {s.loop.rows.map((r) => (
                    <li
                      key={r.stage}
                      className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-3 text-sm"
                    >
                      <span className="flex items-center gap-1.5">
                        {STAGE_INFO[r.stage].label}
                        {r.low && (
                          <AlertTriangle className="size-3.5 text-warning" aria-label="under 15%" />
                        )}
                      </span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn("block h-full rounded-full", STAGE_INFO[r.stage].color)}
                          style={{ width: `${topShare ? (r.share / topShare) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="text-right text-muted-foreground tabular-nums">
                        {r.count} · {Math.round(r.share * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s.loop.tagged > 0 && s.loop.tagged < LOOP_BALANCE_MIN_SESSIONS && (
                <p className="text-xs text-muted-foreground">
                  Balance warnings start after {LOOP_BALANCE_MIN_SESSIONS} sessions with a stage.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Postmortems */}
          <Card>
            <CardHeader>
              <CardTitle>Postmortems written</CardTitle>
              <CardDescription>Failure is the curriculum.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-8">
                <Stat label="Total" value={s.postmortems.total} />
                <Stat label="Deliberate (chaos)" value={s.postmortems.deliberate} />
                <Stat label="Real incidents" value={s.postmortems.real} />
              </div>
              <Link
                href="/postmortems"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
              >
                All postmortems <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Topics completed</CardTitle>
              <CardDescription>
                {plural(s.topicsDone.total, "topic")} reached Done in total. Per month, last 12
                months.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatBarChart
                data={monthRows(s.topicsDone.byMonth, "topic")}
                caption="Topics that reached Done per month"
                valueHeading="Topics"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Artifacts published</CardTitle>
              <CardDescription>
                {plural(artifactsTotal, "artifact")} in the last 12 months. Aim for one a month.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatBarChart
                data={monthRows(s.artifactsByMonth, "artifact")}
                caption="Artifacts published per month"
                valueHeading="Artifacts"
                target={1}
                targetLabel="1 / month"
              />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Reading items read</CardTitle>
              <CardDescription>
                {plural(readingTotal, "item")} in the last 12 months. Input, not output — it
                doesn&apos;t count toward the streak.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatBarChart
                data={monthRows(s.readingByMonth, "item")}
                caption="Reading items read per month"
                valueHeading="Items read"
                height={160}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
