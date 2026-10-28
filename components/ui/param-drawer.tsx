"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Right-side drawer whose open state lives in the `?<param>=` search param. */
export function ParamDrawer({
  param,
  title,
  srTitle = true,
  className,
  children,
}: {
  param: string;
  title: string;
  /** Hide the title visually (the content shows its own heading). */
  srTitle?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete(param);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent side="right" aria-describedby={undefined} className={className}>
        <DialogTitle className={srTitle ? "sr-only" : undefined}>{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
