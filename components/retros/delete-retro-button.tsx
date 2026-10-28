"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { deleteRetro } from "@/lib/actions/retros";

export function DeleteRetroButton({ id }: { id: string }) {
  return (
    <Confirm
      title="Delete this retro?"
      description="It's deleted permanently, along with its goal and bottleneck."
      onConfirm={() => deleteRetro(id).then(() => undefined)}
    >
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
        <Trash2 aria-hidden /> Delete
      </Button>
    </Confirm>
  );
}
