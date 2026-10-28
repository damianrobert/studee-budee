import { aiEnabled } from "@/lib/ai/config";
import { db } from "@/lib/db";
import {
  FORGOTTEN_AFTER_MIN,
  getProjectOptions,
  getRunningSession,
  getSessionDefaults,
} from "@/lib/sessions";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { ForgottenSessionBanner } from "@/components/sessions/forgotten-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [running, dueCards, projects, defaults, tags] = await Promise.all([
    getRunningSession(),
    db.flashcard.count({ where: { dueAt: { lte: new Date() } } }),
    getProjectOptions(),
    getSessionDefaults(),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const session = running && {
    id: running.id,
    startedAt: running.startedAt.toISOString(),
    project: running.project,
    topic: running.topic,
  };
  const forgotten =
    !!running && Date.now() - running.startedAt.getTime() > FORGOTTEN_AFTER_MIN * 60_000;

  return (
    <div className="flex min-h-dvh">
      <Sidebar dueCards={dueCards} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          session={session}
          projects={projects}
          defaults={defaults}
          dueCards={dueCards}
          tagSuggestions={tags.map((t) => t.name)}
          ai={aiEnabled()}
        />
        {session && forgotten && <ForgottenSessionBanner session={session} />}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
