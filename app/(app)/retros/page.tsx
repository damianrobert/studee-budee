import Link from "next/link";
import { CalendarCheck, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import {
  BOTTLENECK_LABEL,
  countBottlenecks,
  openRetroWeeks,
  retroWeekKey,
  weekLabel,
} from "@/lib/retros";
import { appTz, todayKey, weekStartKey } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { BottleneckChart } from "@/components/retros/bottleneck-chart";

export const metadata = { title: "Retros" };

export default async function RetrosPage() {
  const tz = appTz();
  const today = todayKey(tz);
  const thisWeek = weekStartKey(today);
  const retros = await db.weeklyRetro.findMany({ orderBy: { weekStart: "desc" } });
  const rows = retros.map((r) => ({ ...r, week: retroWeekKey(r.weekStart, tz) }));
  const current = rows.find((r) => r.week === thisWeek);
  const open = openRetroWeeks(today, new Set(rows.map((r) => r.week)));
  const bottlenecks = countBottlenecks(retros, today, 12, tz);

  return (
    <>
      <PageHeader
        title="Retros"
        description="15 minutes a week: what shipped, what got in the way, one goal for next week."
        actions={
          open.length > 0 && (
            <Button asChild variant={current ? "outline" : "default"}>
              <Link href="/retros/new">
                <Plus aria-hidden /> {current ? "Backfill a week" : "Write this week's retro"}
              </Link>
            </Button>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck />}
          title="No retros yet"
          action={
            <Button asChild>
              <Link href="/retros/new">Write this week&apos;s retro</Link>
            </Button>
          }
        >
          A weekly retro turns a week of sessions into one clear goal, and over time shows the
          constraint that keeps coming back.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {!current && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>This week · {weekLabel(thisWeek)}</CardTitle>
                <CardDescription>No retro yet. It takes 15 minutes.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm">
                  <Link href={`/retros/new?week=${thisWeek}`}>Write this week&apos;s retro</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {bottlenecks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Bottlenecks, last 12 weeks</CardTitle>
                <CardDescription>
                  {bottlenecks[0]!.count > 1
                    ? `“${bottlenecks[0]!.label}” keeps coming back — that's the constraint to work on.`
                    : "The recurring constraint shows up here as the weeks add up."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BottleneckChart
                  data={bottlenecks.map((b) => ({ label: b.label, count: b.count }))}
                />
              </CardContent>
            </Card>
          )}

          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
                    <CardTitle>
                      {r.week === thisWeek ? "This week" : "Week"} · {weekLabel(r.week)}
                    </CardTitle>
                    <Badge variant="outline">{BOTTLENECK_LABEL[r.bottleneck]}</Badge>
                    {r.energy && (
                      <span className="text-xs text-muted-foreground">Energy {r.energy}/5</span>
                    )}
                    <Button asChild variant="ghost" size="sm" className="ml-auto">
                      <Link
                        href={`/retros/${r.id}/edit`}
                        aria-label={`Edit retro ${weekLabel(r.week)}`}
                      >
                        <Pencil aria-hidden /> Edit
                      </Link>
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                    <div className="space-y-1">
                      <h3 className="text-xs font-medium text-muted-foreground">Shipped</h3>
                      <p className="whitespace-pre-wrap">{r.shipped}</p>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xs font-medium text-muted-foreground">Slowed down by</h3>
                      <p className="whitespace-pre-wrap">{r.slowedDown}</p>
                    </div>
                    <p className="sm:col-span-2">
                      <span className="text-muted-foreground">Goal for next week:</span>{" "}
                      {r.nextWeekGoal}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
