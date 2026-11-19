import { copyShareUrl, createCounter, expect, routeToFake, test } from "./fixtures";
import type { Page } from "@playwright/test";

const MINUTE = 60_000;

/** Builds Check-in 5, Planning 10, Demo 10, then moves Demo above Planning by keyboard. */
async function buildAgenda(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Run a meeting" }).click();
  await page.getByLabel("Meeting name").fill("Weekly sync");
  for (const [index, [title, minutes]] of [["Check-in", "5"], ["Planning", "10"], ["Demo", "10"]].entries()) {
    if (index > 0) await page.getByRole("button", { name: "Add block" }).click();
    await page.getByLabel(`Block ${index + 1} title`).fill(title ?? "");
    await page.getByLabel("Minutes").nth(index).fill(minutes ?? "");
  }
  await page.getByRole("button", { name: "Move block 3 up" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Block 2 title")).toHaveValue("Demo");
  await expect(page.getByRole("button", { name: "Move block 2 up" })).toBeFocused();
  await expect(page.getByText("Total 25 min · 3 blocks")).toBeVisible();
  await page.getByRole("button", { name: "Create meeting" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Weekly sync" })).toBeVisible();
}

test("run a meeting: an overrun rebalances the rest, a share link follows it, and the summary compares plan and actual", async ({ page, browser, fake }) => {
  test.slow();
  await page.clock.install();
  await buildAgenda(page);
  await expect(page.getByText("25 min planned")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Planning" })).toContainText("10 min · starts 15 min in");

  await page.getByRole("button", { name: "Start meeting" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Check-in" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(/^[45]:\d\d left$/);

  // Check-in runs 2 minutes over: Demo and Planning each give up a minute.
  fake.advanceClock(7 * MINUTE);
  await page.clock.fastForward(7 * MINUTE);
  await expect(page.getByRole("timer")).toHaveText(/^! 2:0\d over$/);
  await expect(page.getByText("Over time. The blocks after this one are shrinking to fit.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Demo" })).toContainText(/9 min \(was 10 min\)/);
  await expect(page.getByRole("listitem").filter({ hasText: "Planning" })).toContainText(/9 min \(was 10 min\)/);

  // The share link shows the meeting read-only and follows it live.
  const shareUrl = await copyShareUrl(page);
  expect(shareUrl).toMatch(/\/meet\/[A-Za-z0-9_-]{43}$/);
  const viewer = await browser.newContext();
  await routeToFake(viewer, fake);
  const viewerPage = await viewer.newPage();
  await viewerPage.goto(shareUrl);
  await expect(viewerPage.getByRole("heading", { level: 2, name: "Check-in" })).toBeVisible();
  await expect(viewerPage.getByRole("button", { name: /Next block|End meeting/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Next block: Demo" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Demo" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Check-in" })).toContainText("Took 7 min (planned 5 min)");
  await expect(viewerPage.getByRole("heading", { level: 2, name: "Demo" })).toBeVisible();
  await viewer.close();

  // A double-click finishes Demo only.
  await page.getByRole("button", { name: "Next block: Planning" }).dblclick();
  await expect(page.getByRole("heading", { level: 2, name: "Planning" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish last block" })).toBeVisible();
  expect(fake.requests.filter((request) => request.url.endsWith("/meeting/advance"))).toHaveLength(2);

  await page.getByRole("button", { name: "End meeting" }).click();
  await page.getByRole("button", { name: "End now" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Planned and actual" })).toBeVisible();
  await expect(page.getByText(/^Finished \d+ minutes early; “Check-in” took longest\.$/)).toBeVisible();
  const checkIn = page.getByRole("row", { name: /Check-in/ });
  await expect(checkIn).toContainText("5 min");
  await expect(checkIn).toContainText("7 min");
  await expect(checkIn).toContainText("+2 min");
  await expect(page.getByRole("row", { name: /Total/ })).toContainText("25 min");
});

test("a stale Next from a second owner tab refreshes quietly", async ({ page, context }) => {
  await buildAgenda(page);
  await page.getByRole("button", { name: "Start meeting" }).click();
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByRole("heading", { level: 2, name: "Check-in" })).toBeVisible();
  // Hold the other tab's reads while this tab moves two blocks on.
  const itemRead = "**/__custd/api/v1/app/item";
  await other.route(itemRead, (route) => route.abort());
  await page.getByRole("button", { name: "Next block: Demo" }).click();
  await page.getByRole("button", { name: "Next block: Planning" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Planning" })).toBeVisible();
  await other.unroute(itemRead);
  await other.getByRole("button", { name: "Next block: Demo" }).click();
  await expect(other.getByRole("heading", { level: 2, name: "Planning" })).toBeVisible();
  await expect(other.getByRole("alert")).toHaveCount(0);
});

test("save private minutes with an action linked to a plan part", async ({ page, browser, fake }) => {
  await createCounter(page, "Pages edited", "20");
  await expect(page.getByRole("heading", { name: "Pages edited", exact: true })).toBeVisible();
  await page.goto("/new/plan");
  await page.getByLabel("Plan name").fill("Launch the new site");
  await page.getByRole("button", { name: "Create plan" }).click();
  await page.getByLabel("Add recent work").selectOption({ label: "Pages edited" });
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("0 of 1 required parts complete")).toBeVisible();

  const planShareUrl = await copyShareUrl(page);
  await buildAgenda(page);
  const shareUrl = await copyShareUrl(page);
  await page.getByText("Private meeting minutes", { exact: true }).click();
  await page.getByLabel("Minutes", { exact: true }).fill("Review the launch checklist");
  await page.getByLabel("Decisions").fill("Publish after sign-off");
  await page.getByLabel("Related plan").selectOption({ label: "Launch the new site" });
  await page.getByLabel("Summary for plan viewers").fill("The launch checklist is ready for review.");
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByLabel("Description").fill("Finish the edited pages");
  await expect(page.getByRole("option", { name: "Pages edited" })).toBeAttached();
  await page.getByLabel("Plan part").selectOption({ label: "Pages edited" });
  await page.getByRole("button", { name: "Save minutes" }).click();
  await expect(page.getByText("Minutes saved.")).toBeVisible();
  await page.reload();
  await page.getByText("Private meeting minutes", { exact: true }).click();
  await expect(page.getByLabel("Decisions")).toHaveValue("Publish after sign-off");

  const viewer = await browser.newContext();
  try {
    await routeToFake(viewer, fake);
    const display = await viewer.newPage();
    await display.goto(`${shareUrl}?tv=1`);
    await expect(display.getByRole("heading", { name: "Weekly sync" })).toBeVisible();
    await expect(display.getByText("Private meeting minutes")).toHaveCount(0);
    await expect(display.getByText("Publish after sign-off")).toHaveCount(0);
    await display.goto(planShareUrl);
    await expect(display.getByText("The launch checklist is ready for review.")).toBeVisible();
    await expect(display.getByText("Publish after sign-off")).toHaveCount(0);
  } finally {
    await viewer.close();
  }
});
