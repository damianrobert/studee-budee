import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("login → start session → stop with next step → see it on Today", async ({ page }) => {
  await login(page);
  const main = page.getByRole("main");

  await main.getByRole("button", { name: "Start session" }).click();
  const header = page.getByRole("banner");
  await expect(header.getByLabel("Elapsed time")).toBeVisible();

  await header.getByRole("button", { name: "Stop" }).click();
  const dialog = page.getByRole("dialog", { name: "Stop session" });
  const save = dialog.getByRole("button", { name: "Save & stop" });
  await expect(save).toBeDisabled(); // "What's next?" is required

  const nextStep = `Write the compose healthcheck ${Date.now()}`;
  await dialog.getByLabel("What did I do?").fill("Read about healthchecks");
  await dialog.getByLabel("What's next?").fill(nextStep);
  await save.click();

  await expect(dialog).toBeHidden();
  await expect(header.getByLabel("Elapsed time")).toBeHidden();
  await expect(main.getByText(nextStep)).toBeVisible();
});
