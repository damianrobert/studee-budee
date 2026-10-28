"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "./global-search";
import { QuickCapture } from "./quick-capture";

type Open = "search" | "capture" | null;

/** Header buttons + global shortcuts: Ctrl/Cmd+K searches, Ctrl/Cmd+J captures. */
export function GlobalTools({ tagSuggestions }: { tagSuggestions: string[] }) {
  const [open, setOpen] = React.useState<Open>(null);
  const [mod, setMod] = React.useState("Ctrl");

  React.useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘");
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      const target: Open = key === "k" ? "search" : key === "j" ? "capture" : null;
      if (!target) return;
      e.preventDefault();
      // Same shortcut again closes; the other one switches.
      setOpen((cur) => (cur === target ? null : target));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggle = (which: Exclude<Open, null>) => (o: boolean) =>
    setOpen((cur) => (o ? which : cur === which ? null : cur));

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen("search")}
        aria-keyshortcuts="Control+K Meta+K"
        className="w-9 shrink-0 px-0 text-muted-foreground sm:w-56 sm:justify-start sm:px-3"
      >
        <Search aria-hidden />
        <span className="sr-only sm:not-sr-only sm:flex-1 sm:text-left">Search…</span>
        <kbd className="hidden rounded border px-1 text-[10px] sm:inline">{mod} K</kbd>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen("capture")}
        aria-keyshortcuts="Control+J Meta+J"
        title={`Quick capture (${mod} J)`}
        className="w-9 shrink-0 px-0 sm:w-auto sm:px-3"
      >
        <Plus aria-hidden />
        <span className="sr-only sm:not-sr-only">Capture</span>
      </Button>
      <GlobalSearch open={open === "search"} onOpenChange={toggle("search")} />
      <QuickCapture
        open={open === "capture"}
        onOpenChange={toggle("capture")}
        tagSuggestions={tagSuggestions}
        mod={mod}
      />
    </>
  );
}
