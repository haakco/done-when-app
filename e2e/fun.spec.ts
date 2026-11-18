import type { Browser, BrowserContext, Page } from "@playwright/test";
import { copyShareUrl, createCounter, expect, routeToFake, test } from "./fixtures";
import type { FakeCustd } from "./fake-custd";

const HISTORY = ["timestamp,value", "2026-11-01T00:00:00Z,10", "2026-11-02T00:00:00Z,20", "2026-11-03T00:00:00Z,30"].join("\n");

/** Opens a share link in a second browser, as a viewer who skips guessing. */
async function openViewer(browser: Browser, fake: FakeCustd, shareUrl: string, reducedMotion: "reduce" | "no-preference"): Promise<Page> {
  const viewer = await browser.newContext({ reducedMotion });
  await routeToFake(viewer, fake);
  const page = await viewer.newPage();
  await page.goto(shareUrl);
  await page.getByRole("button", { name: "Skip, show the forecast" }).click();
  await expect(page.getByText("Likely done")).toBeVisible();
  return page;
}

/** Closes a second browser without failing on its polls still in flight. */
async function closeViewer(context: BrowserContext): Promise<void> {
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
}

/** Records every forecast state the viewer's chart draws, so a glide shows as in-between dates. */
async function recordChart(page: Page): Promise<() => Promise<{ motions: string[]; medians: string[] }>> {
  await page.evaluate(() => {
    const figure = document.querySelector('figure[aria-label="Forecast chart"]');
    const seen = { motions: [] as string[], medians: [figure?.getAttribute("data-forecast-median") ?? ""] };
    (window as unknown as { seen: typeof seen }).seen = seen;
    new MutationObserver(() => {
      const now = document.querySelector('figure[aria-label="Forecast chart"]');
      seen.motions.push(now?.getAttribute("data-forecast-motion") ?? "");
      const median = now?.getAttribute("data-forecast-median") ?? "";
      if (seen.medians.at(-1) !== median) seen.medians.push(median);
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-forecast-motion", "data-forecast-median"] });
  });
  return () => page.evaluate(() => (window as unknown as { seen: { motions: string[]; medians: string[] } }).seen);
}

for (const motion of ["no-preference", "reduce"] as const) {
  test(`a measurement in one browser moves the forecast in another (${motion} motion)`, async ({ page, browser, fake }) => {
    await createCounter(page, "Laps run", "100", HISTORY);
    const viewer = await openViewer(browser, fake, await copyShareUrl(page), motion);
    const seen = await recordChart(viewer);

    await page.getByLabel("New value").fill("55");
    await page.getByRole("button", { name: "Add measurement" }).click();
    await expect(viewer.getByText(/^↻ Forecast moved \d+ days? (earlier|later)\.$/)).toBeVisible();
    await expect(viewer.locator('figure[aria-label="Forecast chart"]')).toHaveAttribute("data-forecast-motion", "still");

    const { motions, medians } = await seen();
    if (motion === "reduce") {
      expect(motions).not.toContain("moving");
      expect(medians).toHaveLength(2);
    } else {
      expect(motions).toContain("moving");
      expect(medians.length).toBeGreaterThan(2);
    }
    await closeViewer(viewer.context());
  });
}

test("reaching the target celebrates, and turning celebrations off stays off", async ({ page }) => {
  await createCounter(page, "Push-ups", "40", HISTORY);
  await page.getByLabel("New value").fill("40");
  await page.getByRole("button", { name: "Add measurement" }).click();
  await expect(page.locator(".moment--celebrate")).toContainText("Target reached");
  await page.getByRole("button", { name: "Turn off celebrations" }).click();
  await expect(page.locator(".moment--celebrate")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Celebrations on this device" })).not.toBeChecked();
  await page.getByRole("button", { name: "Reopen counter" }).click();
  await expect(page.getByLabel("New value")).toBeVisible();
  await page.getByLabel("New value").fill("45");
  await page.getByRole("button", { name: "Add measurement" }).click();
  // The fact still shows in plain words; only the flourish is gone.
  await expect(page.locator("[data-moment]")).toContainText("Target reached");
  await expect(page.locator(".moment--celebrate, .burst")).toHaveCount(0);
});

test("a viewer guesses first, and sees who was closest once it is done", async ({ page, browser, fake }) => {
  await createCounter(page, "Chapters", "40", HISTORY);
  const viewerContext = await browser.newContext();
  await routeToFake(viewerContext, fake);
  const viewer = await viewerContext.newPage();
  await viewer.goto(await copyShareUrl(page));
  await expect(viewer.getByText("Likely done")).toHaveCount(0);
  const today = new Date().toISOString().slice(0, 10);
  await viewer.getByLabel("Your guess").fill(today);
  await viewer.getByLabel("Your name (optional)").fill("Sam");
  await viewer.getByRole("button", { name: "Lock in guess" }).click();
  await expect(viewer.getByText(/Locked in: Sam/)).toBeVisible();
  await viewer.getByRole("button", { name: "Show the forecast" }).click();
  await expect(viewer.getByText("Likely done")).toBeVisible();

  await page.getByLabel("New value").fill("40");
  await page.getByRole("button", { name: "Add measurement" }).click();
  await expect(viewer.getByRole("heading", { name: "Who guessed closest?" })).toBeVisible();
  await expect(viewer.getByText("Sam was closest, spot on.")).toBeVisible();
  await closeViewer(viewerContext);
});

test("big-screen mode shows a dashboard with large type and no controls", async ({ page }) => {
  await createCounter(page, "Tickets closed", "100", HISTORY);
  const shareUrl = await copyShareUrl(page);
  await page.goto("/new/dashboard");
  await page.getByLabel("Links to show (optional)").fill(shareUrl);
  await page.getByRole("button", { name: "Create dashboard" }).click();
  await page.getByRole("link", { name: "Big screen" }).click();
  await expect(page).toHaveURL(/\?tv=1/);
  await expect(page.getByRole("heading", { level: 2, name: "Tickets closed" })).toBeVisible();
  await expect(page.getByText(/Likely done/)).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button").filter({ visible: true })).toHaveCount(0);
  const headline = await page.locator(".entry__headline").first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(headline).toBeGreaterThanOrEqual(25);
});
