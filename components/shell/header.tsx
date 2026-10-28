import type { ProjectOption } from "@/lib/sessions";
import { SessionIndicator } from "@/components/sessions/session-indicator";
import { StartSessionDialog } from "@/components/sessions/start-session-dialog";
import type { ClientSession } from "@/components/sessions/stop-session-dialog";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { GlobalTools } from "./global-tools";
import { MobileNav } from "./mobile-nav";
import { SignOutButton } from "./sidebar";

export function Header({
  session,
  projects,
  defaults,
  dueCards,
  tagSuggestions,
  ai,
}: {
  session: ClientSession | null;
  projects: ProjectOption[];
  defaults: { projectId: string | null; topicId: string | null };
  dueCards: number;
  tagSuggestions: string[];
  /** AI features are on (a Gemini key is set). */
  ai: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-6 lg:px-8">
      <MobileNav dueCards={dueCards} footer={<SignOutButton />} />
      <span className="truncate font-semibold whitespace-nowrap lg:hidden">studee-budee</span>
      <div className="flex-1" />
      <GlobalTools tagSuggestions={tagSuggestions} />
      {session ? (
        <SessionIndicator session={session} ai={ai} />
      ) : (
        <StartSessionDialog projects={projects} defaults={defaults}>
          <Button variant="ghost" size="sm">
            <Play aria-hidden />
            Start session
          </Button>
        </StartSessionDialog>
      )}
    </header>
  );
}
