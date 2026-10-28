import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// The free build ("group by topic") runs on every stack. The AI build calls the real Gemini
// API with a tiny file, so it only checks the shape of what comes back.

const AI_TIMEOUT = 180_000;
const EXAMPLE = path.join(__dirname, "../templates/resources-template.yaml");

async function aiOn(page: Page) {
  await page.goto("/settings");
  return page.getByText(/Enabled · Google Gemini/).isVisible();
}

async function openNewCourse(page: Page) {
  await page.goto("/courses");
  await page.getByRole("button", { name: /New course|Build my first course/ }).click();
  return page.getByRole("dialog");
}

test("build a course from the example file by topic, track progress, rebuild, delete", async ({
  page,
}) => {
  await login(page);
  await page.goto("/courses");

  // Step 1 happens outside the app: the prompt for your own LLM.
  await page.getByRole("button", { name: "Prompt for your LLM" }).click();
  const promptDialog = page.getByRole("dialog");
  await expect(promptDialog.getByText(/You are a research assistant/)).toBeVisible();
  await expect(promptDialog.getByRole("button", { name: "Copy prompt" })).toBeVisible();
  await page.keyboard.press("Escape");

  const dialog = await openNewCourse(page);
  // A broken file is explained and can't be built.
  await dialog.getByRole("button", { name: "or paste it" }).click();
  await dialog
    .getByLabel("Resources file contents")
    .fill("resources:\n  videos:\n    - { id: a, title: A }\n");
  await expect(dialog.getByRole("alert")).toContainText("resources › videos #1 › url: is missing");
  await expect(dialog.getByRole("button", { name: "Build course" })).toBeDisabled();

  // The example file: checked in the browser, then grouped by topic (no AI).
  await dialog.getByLabel("Resources file", { exact: true }).setInputFiles(EXAMPLE);
  await expect(dialog.getByTestId("source-ok")).toContainText("resources-template.yaml");
  await expect(dialog.getByTestId("source-ok")).toContainText("17 resources in 7 topics");
  await dialog.getByLabel(/Group by topic/).check();
  await dialog.getByRole("button", { name: "Build course" }).click();
  await page.waitForURL(/\/courses\/[a-z0-9]+$/);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kubernetes fundamentals");
  await expect(page.getByRole("navigation", { name: "Modules" }).getByRole("link")).toHaveCount(7);
  await expect(page.getByTestId("course-item")).toHaveCount(17);
  // The playground is a tool, so it's an extra and doesn't count.
  await expect(page.getByText("0 of 16 done (0%)")).toBeVisible();

  // Up next → mark it done.
  const upNext = page.getByRole("region", { name: "Up next" });
  const first = (await upNext.locator("p.font-medium").innerText()).trim();
  await upNext.getByRole("checkbox").click();
  await expect(page.getByText("1 of 16 done (6%)")).toBeVisible();
  await expect(upNext.locator("p.font-medium")).not.toHaveText(first);
  await expect(page.getByRole("checkbox", { name: `Mark “${first}” done` })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Videos play inside the page.
  await page.getByRole("button", { name: "Watch here" }).first().click();
  await expect(page.locator("iframe").first()).toHaveAttribute(
    "src",
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/X48VuDVv0do/,
  );

  // Rebuilding keeps what's done.
  await page.getByRole("button", { name: "Rebuild" }).click();
  const rebuild = page.getByRole("dialog");
  await expect(rebuild.getByTestId("source-ok")).toContainText("The file from the last build");
  await rebuild.getByRole("button", { name: "Rebuild course" }).click();
  await expect(rebuild).toBeHidden();
  await expect(page.getByText("1 of 16 done (6%)")).toBeVisible();

  // Listed with its progress; then deleted.
  await page.goto("/courses");
  await expect(page.getByRole("link", { name: /Kubernetes fundamentals/ })).toContainText(
    "1 of 16 done",
  );
  await page.getByRole("link", { name: /Kubernetes fundamentals/ }).click();
  await page.getByRole("button", { name: "Rename course" }).click();
  await page.getByRole("button", { name: "Delete course" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForURL("/courses");
  await expect(page.getByRole("link", { name: /Kubernetes fundamentals/ })).toHaveCount(0);
});

test("without a key only the free build is offered", async ({ page }) => {
  await login(page);
  test.skip(await aiOn(page), "AI is enabled on this stack");
  const dialog = await openNewCourse(page);
  await expect(dialog.getByLabel(/Arrange with AI/)).toBeDisabled();
  await expect(dialog.getByLabel(/Group by topic/)).toBeChecked();
});

test("the AI arranges a small file into modules with practice and checkpoints", async ({
  page,
}) => {
  test.setTimeout(2 * AI_TIMEOUT);
  await login(page);
  test.skip(!(await aiOn(page)), "No GOOGLE_GEMINI_API_KEY on this stack");

  const lines = readFileSync(EXAMPLE, "utf8");
  // Keep it tiny: the first two topics and the resources that belong to them.
  const small = `subject: "Kubernetes first steps"
learner: "Knows Docker, new to Kubernetes"
goal: "Understand the architecture and run a local cluster"
environment: "kind on local Docker"
topics:
  - { id: what-is-k8s, title: "What Kubernetes is" }
  - { id: local-cluster, title: "Local cluster with kind" }
resources:
  docs:
    - { id: docs-overview, title: "Overview", url: https://kubernetes.io/docs/concepts/overview/, minutes: 10, topics: [what-is-k8s] }
    - { id: docs-components, title: "Kubernetes Components", url: https://kubernetes.io/docs/concepts/overview/components/, minutes: 15, topics: [what-is-k8s] }
    - { id: docs-install-tools, title: "Install Tools", url: https://kubernetes.io/docs/tasks/tools/, minutes: 10, topics: [local-cluster] }
  guides:
    - { id: kind-quickstart, title: "kind Quick Start", url: https://kind.sigs.k8s.io/docs/user/quick-start/, minutes: 20, topics: [local-cluster] }
`;
  expect(lines).toContain("kind-quickstart");

  const dialog = await openNewCourse(page);
  await dialog.getByRole("button", { name: "or paste it" }).click();
  await dialog.getByLabel("Resources file contents").fill(small);
  await expect(dialog.getByTestId("source-ok")).toContainText("4 resources in 2 topics");
  await dialog.getByLabel(/Arrange with AI/).check();
  await dialog.getByLabel("Time you have").selectOption("120");
  await dialog.getByRole("button", { name: "Build course" }).click();
  await expect(dialog.getByRole("status")).toContainText("Arranging the resources");
  await page.waitForURL(/\/courses\/[a-z0-9]+$/, { timeout: AI_TIMEOUT });

  // Every link is one from the file.
  const hrefs = await page
    .getByTestId("course-item")
    .locator("a[target=_blank]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) expect(small).toContain(h!);

  await expect(page.getByRole("heading", { name: "Practice" }).first()).toBeVisible();
  const question = page.locator("details summary").first();
  await expect(question).toBeVisible();
  await question.click();
  await expect(page.locator("details[open] p").first()).toBeVisible();
  await expect(page.getByText(/arranged by the AI for about 2h a week/)).toBeVisible();
});
