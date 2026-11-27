import type { AppItemSettingsRequest } from "@haakco/custd-sdk/browser";
import { copyShareUrl, createCounter, expect, routeToFake, test } from "./fixtures";

test("a repeated counter keeps its item and share link, with an unusual run excluded and its pace readable", async ({ page, browser, fake }) => {
  await createCounter(page, "Weekly pages", "100", "2026-11-01T09:00:00Z,0\n2026-11-02T09:00:00Z,5\n2026-11-03T09:00:00Z,20");
  const share = await copyShareUrl(page);
  const itemUrl = page.url();
  await page.getByText("Counter runs", { exact: true }).click();
  const include = page.getByRole("checkbox", { name: "Include this run’s pace in future forecasts" });
  const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith("/item"));
  await include.uncheck();
  const changed = await saved;
  expect(changed.ok()).toBe(true);
  const update = changed.request().postDataJSON() as AppItemSettingsRequest;
  expect(update.project?.runSimilar).toBe(false);
  await expect(include).not.toBeChecked();

  await page.getByRole("button", { name: "Start again with the same target" }).click();
  await expect(page.getByLabel("New deadline (optional)")).toBeFocused();
  await expect(page.getByText("The same links will show the new run.", { exact: false })).toBeVisible();
  await expect(page).toHaveURL(itemUrl);
  await page.getByRole("button", { name: "Start new run" }).click();
  await expect(page.getByRole("list", { name: "Counter run history" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Counter runs", { exact: true })).toBeFocused();
  await expect(page).toHaveURL(itemUrl);
  expect(fake.requests.filter((request) => request.method === "POST" && request.url.endsWith("/items"))).toHaveLength(1);
  expect(fake.requests.filter((request) => request.method === "POST" && request.url.endsWith("/item/runs"))).toHaveLength(1);

  const viewer = await browser.newContext();
  await routeToFake(viewer, fake);
  const shared = await viewer.newPage();
  await shared.goto(share);
  await shared.getByText("Counter runs", { exact: true }).click();
  await shared.getByText("Previous run pace", { exact: true }).click();
  await expect(shared.getByText("10 per day", { exact: true })).toBeVisible();
  await expect(shared.getByRole("button", { name: "Start again with the same target" })).toHaveCount(0);
  await viewer.close();
});
