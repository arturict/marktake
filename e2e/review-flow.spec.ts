import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const administratorPassword =
  process.env.MARKTAKE_E2E_ADMIN_PASSWORD ?? "container-smoke-password";
const fixture =
  process.env.MARKTAKE_E2E_FIXTURE ??
  path.resolve("work", "fixtures", "marktake-test.mp4");

test.setTimeout(60_000);

test("a new owner reaches a saved note through the local example", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "The generated example only needs one engine.");
  const startedAt = Date.now();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await page.getByLabel("Administrator password").fill(administratorPassword);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: /^(Open example review|Try local example)$/,
    })
    .click();

  const video = page.locator("video");
  await expect(video).toHaveJSProperty("readyState", 4);
  await video.evaluate(async (element: HTMLVideoElement) => {
    await element.play();
    element.pause();
  });
  const annotation = page.locator(".annotation-layer");
  await annotation.focus();
  await annotation.press("Enter");
  await page
    .getByPlaceholder("Pause, mark the frame, and describe the change…")
    .fill("Practice note saved without uploading a file.");
  await page.getByRole("button", { name: "Add frame note" }).click();
  await expect(page.getByText("Saved and sent")).toBeVisible();
  await expect(
    page.getByText("Practice note saved without uploading a file."),
  ).toBeVisible();

  expect(Date.now() - startedAt).toBeLessThan(60_000);
  expect(consoleErrors).toEqual([]);
});

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

  await guestPage.locator("video").evaluate(async (element: HTMLVideoElement) => {
    await element.play();
    element.pause();
  });
  await guestPage.locator(".annotation-layer").click({ position: { x: 200, y: 120 } });
  await guestPage
    .getByPlaceholder("Pause, mark the frame, and describe the change…")
    .fill("Please hold this title card for two more frames.");
  await expect(guestPage.getByText("Draft saved in this browser")).toBeVisible();
  await guestPage.reload();
  await expect(guestPage.getByText("Draft restored.")).toBeVisible();
  await expect(
    guestPage.getByPlaceholder("Pause, mark the frame, and describe the change…"),
  ).toHaveValue("Please hold this title card for two more frames.");
  await expect(guestPage.getByText("1 markups")).toBeVisible();

  await guestPage.route("**/api/versions/*/comments", (route) => route.abort());
  await guestPage.getByRole("button", { name: "Add frame note" }).click();
  await expect(guestPage.getByText("Not saved")).toBeVisible();
  await guestPage.unroute("**/api/versions/*/comments");
  await guestPage.getByRole("button", { name: "Retry note" }).click();
  await expect(guestPage.getByText("Saved and sent")).toBeVisible();
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

  if (browserName === "chromium") {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    const mobileErrors: string[] = [];
    mobilePage.on("console", (message) => {
      if (message.type() === "error") mobileErrors.push(message.text());
    });
    mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
    await mobilePage.goto(guestUrl);
    await mobilePage.getByLabel("Your name").fill("Mobile Reviewer");
    await mobilePage.getByRole("button", { name: "Open review" }).click();
    await expect(mobilePage.getByText("Mobile review uses playback")).toBeVisible();
    await expect(mobilePage.getByRole("button", { name: "Pin" })).toHaveCount(0);
    await mobilePage
      .getByPlaceholder("Describe the change at this playback time…")
      .fill("Readable mobile text feedback.");
    await mobilePage.getByRole("button", { name: "Add frame note" }).click();
    await expect(mobilePage.getByText("Saved and sent")).toBeVisible();
    expect(
      await mobilePage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(mobileErrors).toEqual([]);
    await mobileContext.close();
  }

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
