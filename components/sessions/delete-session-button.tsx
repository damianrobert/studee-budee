"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { deleteSession } from "@/lib/actions/sessions";

export function DeleteSessionButton({ id }: { id: string }) {
  return (
    <Confirm
      title="Delete this session?"
      description="It will no longer count toward your streak or stats."
      onConfirm={() => deleteSession(id).then(() => undefined)}
    >
      <Button variant="ghost" size="icon" className="size-7" aria-label="Delete session">
        <Trash2 />
      </Button>
    </Confirm>
  );
}
