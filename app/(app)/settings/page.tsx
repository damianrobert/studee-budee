import { cookies } from "next/headers";
import { aiConfig, braveSearchKey } from "@/lib/ai/config";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ExportData, ImportData } from "@/components/settings/data-transfer";
import { GoalsForm, ThemeSelect } from "@/components/settings/settings-forms";
import { TagManager } from "@/components/settings/tag-manager";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, jar, tags] = await Promise.all([
    getSettings(),
    cookies(),
    db.tag.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: {
          select: { notes: true, postmortems: true, readingItems: true, workObservations: true },
        },
      },
    }),
  ]);
  const ai = aiConfig();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Goals</CardTitle>
            <CardDescription>Used for streaks and the weekly progress on Today.</CardDescription>
          </CardHeader>
          <CardContent>
            <GoalsForm {...settings} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemeSelect value={parseTheme(jar.get(THEME_COOKIE)?.value)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI tutor</CardTitle>
            <CardDescription>Hints and quizzes, never full answers.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {ai ? (
              <p>
                Enabled · Google Gemini, model{" "}
                <code className="rounded bg-muted px-1">{ai.model}</code>
              </p>
            ) : (
              <p className="text-muted-foreground">
                Disabled. Set GOOGLE_GEMINI_API_KEY in .env to enable.
              </p>
            )}
            {ai && (
              <p className="mt-1 text-muted-foreground">
                {braveSearchKey()
                  ? "Roadmap resources: found with Brave Search."
                  : "Roadmap resources: suggested by the AI from memory. Set BRAVE_SEARCH_API_KEY to find real pages."}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
            <CardDescription>Rename, merge or delete tags.</CardDescription>
          </CardHeader>
          <CardContent>
            <TagManager tags={tags.map(({ _count, ...t }) => ({ ...t, ..._count }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Export</CardTitle>
            <CardDescription>Your data is yours. Take all of it, any time.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportData />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Import</CardTitle>
            <CardDescription>Move to a new machine, or restore an export.</CardDescription>
          </CardHeader>
          <CardContent>
            <ImportData />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
