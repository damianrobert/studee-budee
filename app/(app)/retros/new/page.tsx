import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import {
  defaultRetroWeek,
  getWeekFacts,
  openRetroWeeks,
  retroWeekKey,
  weekLabel,
} from "@/lib/retros";
import { appTz, todayKey, weekStartKey } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { RetroForm } from "@/components/retros/retro-form";
import { WeekFactsPanel } from "@/components/retros/week-facts";

export const metadata = { title: "Weekly retro" };

export default async function NewRetroPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: asked } = await searchParams;
  const tz = appTz();
  const today = todayKey(tz);
  const retros = await db.weeklyRetro.findMany({ select: { id: true, weekStart: true } });
  const byWeek = new Map(retros.map((r) => [retroWeekKey(r.weekStart, tz), r.id]));

  // A week that already has a retro is edited, not written twice.
  const askedKey = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? weekStartKey(asked) : undefined;
  if (askedKey && byWeek.has(askedKey)) redirect(`/retros/${byWeek.get(askedKey)}/edit`);
  const open = openRetroWeeks(today, new Set(byWeek.keys()));
  const week = askedKey && open.includes(askedKey) ? askedKey : defaultRetroWeek(today, open);
  if (!week) redirect(`/retros/${byWeek.get(weekStartKey(today))}/edit`);

  const facts = await getWeekFacts(week, tz);
  const thisWeek = weekStartKey(today);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/retros">
            <ArrowLeft aria-hidden /> Retros
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {week === thisWeek ? "This week's retro" : `Retro · ${weekLabel(week)}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          Fifteen minutes. Use the facts on the side — you did more than you think.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <RetroForm
          week={week}
          weekOptions={open.map((w) => [
            w,
            w === thisWeek ? `This week (${weekLabel(w)})` : weekLabel(w),
          ])}
        />
        <WeekFactsPanel facts={facts} label={weekLabel(week)} />
      </div>
    </div>
  );
}
