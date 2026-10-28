import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { aiEnabled } from "@/lib/ai/config";
import { courseTemplates } from "@/lib/course-templates";
import { courseProgress } from "@/lib/courses";
import { db } from "@/lib/db";
import { fmtRelativeDays } from "@/lib/format";
import { formatMinutes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { BuildCourseDialog } from "@/components/courses/build-course-dialog";
import { GatherPromptDialog } from "@/components/courses/gather-prompt-dialog";

export const metadata = { title: "Courses" };

export default async function CoursesPage() {
  const ai = aiEnabled();
  const [courses, templates] = await Promise.all([
    db.course.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        updatedAt: true,
        modules: { select: { items: { select: { required: true, doneAt: true, minutes: true } } } },
      },
    }),
    courseTemplates(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Courses"
        description="Courses built from a resources file you gather with your own LLM: videos, articles, docs and tutorials in order, with progress."
        actions={
          <>
            {templates && <GatherPromptDialog templates={templates} />}
            {courses.length > 0 && <BuildCourseDialog ai={ai} />}
          </>
        }
      />
      {courses.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {courses.map((c) => {
            const p = courseProgress(c.modules.flatMap((m) => m.items));
            return (
              <li key={c.id}>
                <Link
                  href={`/courses/${c.id}`}
                  className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs transition-colors hover:border-foreground/30"
                >
                  <div className="space-y-1">
                    <h2 className="font-semibold">{c.title}</h2>
                    {c.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                    )}
                  </div>
                  <div className="mt-auto space-y-1.5">
                    <div
                      role="progressbar"
                      aria-label="Resources done"
                      aria-valuenow={p.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                    >
                      <div className="h-full bg-success" style={{ width: `${p.percent}%` }} />
                    </div>
                    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                      <span>
                        {p.done} of {p.total} done
                      </span>
                      <span>
                        {c.modules.length} module{c.modules.length === 1 ? "" : "s"}
                      </span>
                      {p.minutesLeft > 0 && <span>≈ {formatMinutes(p.minutesLeft)} left</span>}
                      <span>updated {fmtRelativeDays(c.updatedAt)}</span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<GraduationCap />}
          title="No courses yet"
          action={
            <BuildCourseDialog ai={ai}>
              <Button>Build my first course</Button>
            </BuildCourseDialog>
          }
        >
          1. Copy the prompt for your LLM and fill in what you want to learn. 2. Save its answer as
          a .yaml file. 3. Build a course from it here
          {ai ? ", arranged by the AI or grouped by topic." : ", grouped by topic."}
        </EmptyState>
      )}
    </div>
  );
}
