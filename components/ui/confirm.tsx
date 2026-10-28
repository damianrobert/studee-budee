"use client";

import * as React from "react";
import { AlertDialog } from "radix-ui";
import { Button, buttonVariants } from "./button";
import { cn } from "@/lib/utils";

/**
 * Wraps a trigger and asks for confirmation before running `onConfirm`.
 * All destructive actions in the app go through this.
 */
export function Confirm({
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
  onConfirm,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = React.useTransition();
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-lg">
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          {description && (
            <AlertDialog.Description asChild>
              <div className="mt-2 text-sm text-muted-foreground">{description}</div>
            </AlertDialog.Description>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className={cn(buttonVariants({ variant: destructive ? "destructive" : "default" }))}
              disabled={pending}
              onClick={() => startTransition(async () => void (await onConfirm()))}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
