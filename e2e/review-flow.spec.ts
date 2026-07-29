import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const administratorPassword =
  process.env.MARKTAKE_E2E_ADMIN_PASSWORD ?? "container-smoke-password";
const fixture =
  process.env.MARKTAKE_E2E_FIXTURE ??
  path.resolve("work", "fixtures", "marktake-test.mp4");

test.setTimeout(60_000);

test("creator and guest complete a real review journey", async ({
  browser,
  browserName,
  page,
}) => {
  const projectTitle = process.env.MARKTAKE_CAPTURE_SCREENSHOTS
    ? "Midnight campaign cut"
    : `Review flow ${browserName} ${String(Date.now())}`;

  await page.goto("/");
  await page.getByLabel("Administrator password").fill(administratorPassword);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  await page.getByPlaceholder("Project title").fill(projectTitle);
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();

  await page.locator("#video-upload").setInputFiles(fixture);
  await page.getByLabel("Version label").fill("Client review");
  await page.getByRole("button", { name: "Add version" }).click();
  await expect(page.getByText("Client review", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create private link" }).click();
  const guestUrl = await page.locator(".share-result code").innerText();
  expect(guestUrl).toContain("/#/review/");

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(guestUrl);
  await expect(
    guestPage.getByRole("heading", { name: "One name, then straight to the cut." }),
  ).toBeVisible();
  await guestPage.getByLabel("Your name").fill("Casey Reviewer");
  await guestPage.getByRole("button", { name: "Open review" }).click();
  await expect(guestPage.getByText(projectTitle, { exact: true })).toBeVisible();
  await expect(guestPage.locator("video")).toHaveJSProperty("readyState", 4);

  const annotationLayer = guestPage.locator(".annotation-layer");
  await annotationLayer.click({ position: { x: 200, y: 120 } });
  await guestPage
    .getByPlaceholder("Pause, mark the frame, and describe the change…")
    .fill("Please hold this title card for two more frames.");
  await guestPage.getByRole("button", { name: "Add frame note" }).click();
  await expect(
    guestPage.getByText("Please hold this title card for two more frames."),
  ).toBeVisible();
  await expect(guestPage.getByText("1 on-frame")).toBeVisible();

  await guestPage.getByRole("button", { name: "Approve version" }).click();
  await expect(guestPage.locator(".stage-status .decision")).toHaveText("approved");
  if (process.env.MARKTAKE_CAPTURE_SCREENSHOTS) {
    await guestPage.screenshot({
      path: "docs/assets/guest-review.png",
      fullPage: true,
    });
  }

  await page.getByRole("button", { name: "Open review" }).click();
  await expect(page.getByText(projectTitle, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Please hold this title card for two more frames."),
  ).toBeVisible();
  await page.getByPlaceholder("Reply…").fill("Updated in the next cut.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Updated in the next cut.")).toBeVisible();
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.locator(".comment-thread .status")).toHaveText("resolved");
  if (process.env.MARKTAKE_CAPTURE_SCREENSHOTS) {
    await page.screenshot({
      path: "docs/assets/owner-review.png",
      fullPage: true,
    });
  }

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);

  await guestContext.close();
});
