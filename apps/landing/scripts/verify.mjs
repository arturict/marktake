import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const baseUrl = process.env.MARKTAKE_LANDING_URL ?? "http://127.0.0.1:4175";
const browser = await chromium.launch(
  process.env.MARKTAKE_LANDING_SYSTEM_CHROME === "true" ? { channel: "chrome" } : {},
);
const diagnostics = [];

await mkdir("work/landing-verification", { recursive: true });

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });

  const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  assert.match(await page.title(), /Marktake/u);
  await page.locator("#demo").scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    `${viewport.name} layout has horizontal overflow`,
  );

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const materialViolations = accessibility.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  assert.deepEqual(materialViolations, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);

  await page.screenshot({
    path: `work/landing-verification/${viewport.name}.png`,
    fullPage: true,
  });
  diagnostics.push({
    viewport: viewport.name,
    status: response?.status(),
    seriousOrCriticalA11yViolations: materialViolations.length,
    consoleErrors: errors.length,
    failedRequests: failedRequests.length,
  });
  await context.close();
}

for (const path of ["/robots.txt", "/sitemap.xml", "/og.png", "/guest-review.png"]) {
  const response = await fetch(new URL(path, baseUrl));
  assert.equal(response.status, 200, `${path} did not return 200`);
}

await browser.close();
process.stdout.write(`${JSON.stringify(diagnostics, null, 2)}\n`);
