"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Siren, Trash2, Undo2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryParams } from "@/components/use-query-params";
import { deleteExperiment, setExperimentDone } from "@/lib/actions/chaos";
import { ExperimentFormDialog } from "./experiment-form-dialog";

export type Experiment = {
  id: string;
  title: string;
  description: string | null;
  hypothesis: string | null;
  category: string | null;
  difficulty: number;
  completedAt: Date | null;
  postmortems: number;
};

/**
 * Marks an experiment done, then prompts for the (pre-linked, deliberate) postmortem.
 * The prompt is driven by `?done=<id>` (see DonePrompt): the button itself may unmount
 * once the list refreshes, e.g. when done experiments are filtered out.
 */
export function MarkDoneButton({
  experiment,
  ...props
}: Omit<ButtonProps, "onClick"> & { experiment: Pick<Experiment, "id" | "postmortems"> }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <>
      <Button
        {...props}
        disabled={pending || props.disabled}
        onClick={() =>
          startTransition(async () => {
            const res = await setExperimentDone(experiment.id, true);
            if (!res.ok) return setError(res.error);
            setError(null);
            if (experiment.postmortems > 0) return;
            const params = new URLSearchParams(window.location.search);
            params.set("done", experiment.id);
            router.replace(`?${params}`, { scroll: false });
          })
        }
      >
        <Check aria-hidden /> {pending ? "Saving…" : "Mark done"}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </>
  );
}

export function DonePrompt({ experiment }: { experiment: { id: string; title: string } }) {
  const { update } = useQueryParams();
  return (
    <Dialog open onOpenChange={(o) => !o && update({ done: null })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You broke it. Now write it up.</DialogTitle>
          <DialogDescription>
            “{experiment.title}” is done. A short postmortem while it&apos;s fresh turns the
            breakage into proof: what you saw, how you found the cause, what you learned.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => update({ done: null })}>
            Later
          </Button>
          <Button asChild>
            <Link href={`/postmortems/new?chaosId=${experiment.id}`}>
              <Siren aria-hidden /> Write postmortem
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExperimentActions({
  experiment,
  categories,
}: {
  experiment: Experiment;
  categories: string[];
}) {
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {experiment.completedAt ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => void (await setExperimentDone(experiment.id, false)))
          }
        >
          <Undo2 aria-hidden /> Not done
        </Button>
      ) : (
        <MarkDoneButton size="sm" experiment={experiment} />
      )}
      <Button asChild variant="outline" size="sm">
        <Link href={`/postmortems/new?chaosId=${experiment.id}`}>
          <Siren aria-hidden /> Write postmortem
        </Link>
      </Button>
      <ExperimentFormDialog experiment={experiment} categories={categories}>
        <Button variant="ghost" size="sm">
          <Pencil aria-hidden /> Edit
        </Button>
      </ExperimentFormDialog>
      <Confirm
        title="Delete this experiment?"
        description={
          experiment.postmortems
            ? "Its postmortems are kept, but lose the link to it."
            : "It's deleted permanently."
        }
        onConfirm={() => deleteExperiment(experiment.id).then(() => undefined)}
      >
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 aria-hidden /> Delete
        </Button>
      </Confirm>
    </div>
  );
}
