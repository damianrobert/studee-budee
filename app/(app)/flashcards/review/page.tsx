import Link from "next/link";
import { ArrowLeft, CalendarCheck } from "lucide-react";
import { db } from "@/lib/db";
import { dueLabel } from "@/lib/flashcards";
import { appTz } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Review } from "@/components/flashcards/review";

export const metadata = { title: "Review" };

/** Plenty for one sitting; the rest stay due for the next one. */
const MAX_CARDS = 200;

export default async function ReviewPage() {
  const now = new Date();
  const [cards, next] = await Promise.all([
    db.flashcard.findMany({
      where: { dueAt: { lte: now } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: MAX_CARDS,
      select: {
        id: true,
        front: true,
        back: true,
        easeFactor: true,
        interval: true,
        repetitions: true,
        note: { select: { id: true, title: true } },
      },
    }),
    db.flashcard.findFirst({
      where: { dueAt: { gt: now } },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/flashcards">
            <ArrowLeft aria-hidden /> Flashcards
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Review</h1>
      </div>
      {/* Always mounted: each rating revalidates this page, and the session (including its
          "All done" summary) must survive the last due card disappearing from `cards`. */}
      <Review
        cards={cards}
        empty={
          <EmptyState
            icon={<CalendarCheck />}
            title="Nothing due"
            action={
              <Button asChild variant="outline">
                <Link href="/flashcards">All cards</Link>
              </Button>
            }
          >
            {next
              ? `You're up to date. The next card is ${dueLabel(next.dueAt, now, appTz())}.`
              : "No cards yet. Write a few on the Flashcards page, then come back here."}
          </EmptyState>
        }
      />
    </div>
  );
}
