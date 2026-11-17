import { expect, test } from "@playwright/test";

test("create a counter from CSV history and see owner tools", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "New counter" }).first().click();
  await page.getByLabel("What are you counting?").fill("Pages written");
  await page.getByLabel("Target").fill("100");
  await page.getByLabel("History (optional)").fill("timestamp,value\n2026-11-01T00:00:00Z,10\n2026-11-02T00:00:00Z,20");
  await page.getByRole("button", { name: "Create counter" }).click();
  await expect(page.getByRole("heading", { name: "Pages written" })).toBeVisible();
  await expect(page.getByText("10 per day")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add measurement" })).toBeVisible();
});

test("a share link is read-only", async ({ page }) => {
  await page.goto("/c/demo-counter");
  await expect(page.getByRole("heading", { name: "Chapters drafted" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add measurement" })).toHaveCount(0);
});

test("bad CSV rows are listed by line and nothing is created", async ({ page }) => {
  await page.goto("/new/counter");
  await page.getByLabel("What are you counting?").fill("Bad import");
  await page.getByLabel("Target").fill("5");
  await page.getByLabel("History (optional)").fill("2026-11-01T00:00:00Z,1\nnot-a-date,2");
  await page.getByRole("button", { name: "Create counter" }).click();
  await expect(page.getByText("Line 2: “not-a-date” is not an ISO timestamp")).toBeVisible();
  await expect(page).toHaveURL(/\/new\/counter$/);
});

test("a missing link shows the not-found state without waiting on retries", async ({ page }) => {
  await page.goto("/p/missing");
  await expect(page.getByRole("heading", { name: "This project is not here" })).toBeVisible({ timeout: 2000 });
});
