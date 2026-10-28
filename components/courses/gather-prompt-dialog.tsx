"use client";

import * as React from "react";
import { Check, Copy, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Step 1, outside the app: the prompt that has your own LLM gather the resources file. */
export function GatherPromptDialog({
  templates,
}: {
  templates: { prompt: string; example: string };
}) {
  const [copied, setCopied] = React.useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([templates.example], { type: "text/yaml" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "resources-example.yaml",
    });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText aria-hidden /> Prompt for your LLM
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gather the resources</DialogTitle>
          <DialogDescription>
            Paste this into ChatGPT, Claude or Gemini (ideally with web search or research on),
            after filling in the <code>&lt;…&gt;</code> parts. Save its answer as a{" "}
            <code>.yaml</code> file and build a course from it here.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[50vh] overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
          {templates.prompt}
        </pre>
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" onClick={download}>
            <Download aria-hidden /> Example file
          </Button>
          <Button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(templates.prompt);
              } catch {
                // No clipboard API over plain http on another machine: copy the old way.
                const ta = Object.assign(document.createElement("textarea"), {
                  value: templates.prompt,
                });
                document.body.append(ta);
                ta.select();
                document.execCommand("copy");
                ta.remove();
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
