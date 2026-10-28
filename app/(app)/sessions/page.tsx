import { History, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getProjectOptions, getSessionDefaults } from "@/lib/sessions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LogSessionDialog } from "@/components/sessions/log-session-dialog";
import { SessionList } from "@/components/sessions/session-list";
import { ProjectFilter } from "@/components/sessions/project-filter";

export const metadata = { title: "Sessions" };

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  const where = project === "none" ? { projectId: null } : project ? { projectId: project } : {};
  const [sessions, projects, defaults] = await Promise.all([
    db.session.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 200,
      include: {
        project: { select: { id: true, name: true } },
        topic: { select: { id: true, title: true } },
      },
    }),
    getProjectOptions(),
    getSessionDefaults(),
  ]);

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Every session ends with what's next."
        actions={
          <>
            <ProjectFilter projects={projects} value={project ?? ""} />
            <LogSessionDialog projects={projects} defaults={defaults}>
              <Button variant="outline">
                <Plus aria-hidden /> Log past session
              </Button>
            </LogSessionDialog>
          </>
        }
      />
      {sessions.length ? (
        <SessionList sessions={sessions} />
      ) : (
        <EmptyState icon={<History />} title="No sessions here yet">
          Sessions are your daily reps. Start one from the header; ten minutes counts toward your
          streak.
        </EmptyState>
      )}
    </>
  );
}
