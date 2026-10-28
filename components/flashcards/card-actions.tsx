"use client";

import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { deleteFlashcard, resetFlashcard } from "@/lib/actions/flashcards";
import { CardFormDialog } from "./card-form-dialog";

export function CardActions({ card }: { card: { id: string; front: string; back: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <CardFormDialog card={card}>
        <Button variant="ghost" size="sm">
          <Pencil aria-hidden /> Edit
        </Button>
      </CardFormDialog>
      <Confirm
        title="Start this card over?"
        description="Its schedule is reset and it's due now, like a new card."
        confirmLabel="Start over"
        destructive={false}
        onConfirm={() => resetFlashcard(card.id).then(() => undefined)}
      >
        <Button variant="ghost" size="sm" aria-label="Start over">
          <RotateCcw aria-hidden />
        </Button>
      </Confirm>
      <Confirm
        title="Delete this card?"
        description="It's deleted permanently, with its review history."
        onConfirm={() => deleteFlashcard(card.id).then(() => undefined)}
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label="Delete"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden />
        </Button>
      </Confirm>
    </div>
  );
}
