"use client";

import * as React from "react";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "Watch here": plays a YouTube/Vimeo video inside the page, loaded only when asked. */
export function VideoEmbed({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X aria-hidden /> : <Play aria-hidden />}
        {open ? "Close video" : "Watch here"}
      </Button>
      {open && (
        <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-lg border bg-black">
          <iframe
            src={src}
            title={title}
            className="size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}
