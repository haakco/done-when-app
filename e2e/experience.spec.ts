import type { BrowserContext } from "@playwright/test";
import { copyShareUrl, createCounter, expect, routeToFake, test } from "./fixtures";

async function denyClipboard(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new DOMException("Clipboard denied", "NotAllowedError")) },
    });
  });
}

test("share preserves existing viewers until deliberate replacement and offers a manual copy", async ({ page, browser, fake, context }) => {
  await createCounter(page, "Pages finished", "24");
  const ownerUrl = page.url();
  const viewerUrl = await copyShareUrl(page);
  const shareWrites = () => fake.requests.filter(({ method, url }) => method === "POST" && url.endsWith("/rotate"));

  await denyClipboard(context);
  await page.reload();
  await page.getByRole("button", { name: "Share view-only link" }).click();
  await expect(page.getByText("Select and copy the view-only link below.")).toBeVisible();
  await expect(page.locator("header").getByText(viewerUrl, { exact: true })).toBeVisible();
  expect(shareWrites()).toHaveLength(0);

  const freshOwner = await browser.newContext();
  const viewer = await browser.newContext();
  try {
    await routeToFake(freshOwner, fake);
    await routeToFake(viewer, fake);
    await denyClipboard(viewer);
    const viewerPage = await viewer.newPage();
    await viewerPage.goto(viewerUrl);
    await viewerPage.getByRole("button", { name: "Share view-only link" }).click();
    await expect(viewerPage.getByText(viewerUrl, { exact: true })).toBeVisible();
    await expect(viewerPage.getByRole("button", { name: "Replace view-only link" })).toHaveCount(0);

    const freshPage = await freshOwner.newPage();
    await freshPage.goto(ownerUrl);
    await freshPage.getByRole("button", { name: "Share view-only link" }).click();
    await expect(freshPage.getByText("The old link will stop working.", { exact: false })).toBeVisible();
    expect(shareWrites()).toHaveLength(0);
    await viewerPage.reload();
    await expect(viewerPage.getByRole("heading", { name: "Pages finished" })).toBeVisible();

    await freshPage.getByRole("button", { name: "Replace view-only link" }).click();
    await expect(freshPage.getByText("View-only link replaced. You can copy the new link.")).toBeVisible();
    expect(shareWrites()).toHaveLength(1);
    const replacement = await copyShareUrl(freshPage);
    expect(replacement).not.toBe(viewerUrl);
    expect(new URL(replacement).hash).toBe("");
    await viewerPage.reload();
    await expect(viewerPage.getByRole("heading", { name: /is not here/ })).toBeVisible();
    await viewerPage.goto(replacement);
    await expect(viewerPage.getByRole("heading", { name: "Pages finished" })).toBeVisible();
  } finally {
    await Promise.all([freshOwner.close(), viewer.close()]);
  }
});

test("starter model labels previous results and a mixed dashboard recovers its failed card", async ({ page, browser, fake }) => {
  await createCounter(page, "Pages finished", "24");
  const counterUrl = await copyShareUrl(page);
  await page.goto("/new/model");
  await page.getByLabel("What are you working out?").fill("Launch print budget");
  await page.getByRole("checkbox", { name: "Start with a printing and delivery cost model" }).check();
  await page.getByLabel("Printing high estimate ($)").fill("550");
  await page.getByLabel("Printing low estimate ($)").fill("350");
  await page.getByRole("button", { name: "Create model" }).click();
  await page.getByRole("button", { name: "Run model", exact: true }).click();
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary).toContainText("total: about 550 $ (90%:");
  const modelUrl = await copyShareUrl(page);
  const viewer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await routeToFake(viewer, fake);
    const display = await viewer.newPage();
    await display.goto(modelUrl);
    await display.getByText("What drives the result?", { exact: true }).click();
    await expect(display.getByText("printing", { exact: true })).toBeVisible();

    await page.getByText("Edit quantities", { exact: true }).click();
    await page.getByLabel("Value", { exact: true }).first().fill("450 to 650");
    await page.getByRole("button", { name: "Save version" }).click();
    const stale = "These results are from version 1. The model is now on version 2.";
    await expect(summary.getByText(stale)).toBeVisible();
    await display.reload();
    await expect(display.getByText(stale)).toBeVisible();
    await expect(display.getByRole("button", { name: "Run model", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Run model", exact: true }).click();
    await expect(summary).toContainText("total: about 650 $ (90%:");
    await expect(summary.getByText(stale)).toHaveCount(0);
    await display.reload();
    await expect(display.getByRole("region", { name: "Summary" })).toContainText("total: about 650 $ (90%:");

    let failModel = true;
    await page.route((url) => url.pathname.endsWith("/app/models/latest") && url.searchParams.has("item"), async (route) => {
      if (failModel) {
        await route.fulfill({ status: 503, json: { status: 503, title: "Service unavailable" } });
      } else await route.fallback();
    });
    await page.goto("/new/dashboard");
    await page.getByLabel("Links to show (optional)").fill(`${counterUrl}\n${modelUrl}`);
    await page.getByRole("button", { name: "Create dashboard" }).click();
    const tiles = page.getByRole("list", { name: "Dashboard items" }).getByRole("listitem");
    const modelTile = tiles.filter({ has: page.getByRole("heading", { name: "Launch print budget" }) });
    const counterTile = tiles.filter({ has: page.getByRole("heading", { name: "Pages finished" }) });
    const retry = modelTile.getByRole("button", { name: "Retry item" });
    await expect(retry).toBeVisible();
    await expect(counterTile.getByText("Counter", { exact: true })).toBeVisible();
    await expect(counterTile.getByRole("progressbar")).toBeVisible();
    await expect(counterTile.getByRole("button", { name: "Retry item" })).toHaveCount(0);
    failModel = false;
    await retry.click();
    await expect(modelTile).toContainText("total: about 650");
    await expect(retry).toHaveCount(0);
    const dashboardUrl = await copyShareUrl(page);
    await display.goto(dashboardUrl);
    await display.getByRole("link", { name: "Open Launch print budget" }).click();
    await expect(display).toHaveURL(modelUrl);
    await expect(display.getByRole("button", { name: "Run model", exact: true })).toHaveCount(0);
  } finally {
    await viewer.close();
  }
});
