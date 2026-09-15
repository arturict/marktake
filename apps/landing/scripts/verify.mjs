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
  assert.equal(
    await page.locator('link[rel="canonical"]').getAttribute("href"),
    "https://marktake.vercel.app/",
  );
  assert.equal(
    await page.locator('meta[property="og:image"]').getAttribute("content"),
    "https://marktake.vercel.app/og.png",
  );
  assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
  assert.match(
    await page.locator('script[type="application/ld+json"]').textContent(),
    /SoftwareApplication/u,
  );
  await page.locator("#product").scrollIntoViewIfNeeded();
  await page
    .getByRole("heading", { name: "Feedback that lands on the frame." })
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "RUN IT YOURSELF" }).getAttribute("href"),
    "#install",
  );
  assert.equal(
    await page.getByRole("link", { name: "GET V0.1.0" }).getAttribute("href"),
    "https://github.com/arturict/marktake/releases/latest",
  );
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

  const performance = await page.evaluate(() => {
    const [navigation] = performance.getEntriesByType("navigation");
    const resources = performance.getEntriesByType("resource");
    return {
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
      loadMs: Math.round(navigation?.loadEventEnd ?? 0),
      resourceCount: resources.length + 1,
      transferBytes: Math.round(
        (navigation?.transferSize ?? 0) +
          resources.reduce((total, resource) => total + resource.transferSize, 0),
      ),
    };
  });
  assert.ok(performance.resourceCount <= 8, "initial page makes too many requests");
  assert.ok(
    performance.transferBytes <= 2_000_000,
    "initial page exceeds the 2 MB transfer budget",
  );

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
    performance,
  });
  await context.close();
}

for (const path of [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/og.png",
  "/guest-review.png",
]) {
  const response = await fetch(new URL(path, baseUrl));
  assert.equal(response.status, 200, `${path} did not return 200`);
}

await browser.close();
process.stdout.write(`${JSON.stringify(diagnostics, null, 2)}\n`);
