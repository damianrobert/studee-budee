import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getWeekFacts, retroWeekKey, weekLabel } from "@/lib/retros";
import { appTz } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { DeleteRetroButton } from "@/components/retros/delete-retro-button";
import { RetroForm } from "@/components/retros/retro-form";
import { WeekFactsPanel } from "@/components/retros/week-facts";

export const metadata = { title: "Edit retro" };

export default async function EditRetroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const retro = await db.weeklyRetro.findUnique({ where: { id } });
  if (!retro) notFound();
  const tz = appTz();
  const week = retroWeekKey(retro.weekStart, tz);
  const facts = await getWeekFacts(week, tz);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/retros">
              <ArrowLeft aria-hidden /> Retros
            </Link>
          </Button>
          <DeleteRetroButton id={retro.id} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Retro · {weekLabel(week)}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <RetroForm
          week={week}
          retro={{
            id: retro.id,
            shipped: retro.shipped,
            slowedDown: retro.slowedDown,
            bottleneck: retro.bottleneck,
            nextWeekGoal: retro.nextWeekGoal,
            energy: retro.energy,
          }}
        />
        <WeekFactsPanel facts={facts} label={weekLabel(week)} />
      </div>
    </div>
  );
}
