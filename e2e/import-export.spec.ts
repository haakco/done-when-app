import { readFile } from "node:fs/promises";
import readXlsxFile from "read-excel-file/node";
import { createCounter, expect, test } from "./fixtures";

const CSV = "﻿Value;Time\r\n10;2026-11-01T00:00:00Z\r\nlots;2026-11-02T00:00:00Z\r\n30,5;2026-11-03 12:00\r\n";

test("import a CSV with a bad row into a counter, then download it as Excel and read it back", async ({ page }) => {
  await createCounter(page, "Steps taken", "100");
  await page.getByText("Import measurements", { exact: true }).click();
  await page.getByLabel("Or choose a file").setInputFiles({ name: "steps.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });

  await expect(page.getByText("Line 3: “lots” is not a number")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "2 of 3 measurements ready." })).toBeVisible();
  await page.getByRole("button", { name: "Import 2 good measurements, skip 1" }).click();
  await expect(page.getByText("Imported 2 measurements.")).toBeVisible();

  const menu = page.locator("summary", { hasText: "Download" });
  await menu.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Excel (.xlsx)" })).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel (.xlsx)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^steps-taken-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const path = await download.path();
  const sheets = await readXlsxFile(path);
  expect(sheets.map((sheet) => sheet.sheet)).toEqual(["Measurements", "Forecast", "Summary"]);
  const measurements = sheets[0]?.data ?? [];
  expect(measurements[0]).toEqual(["Time", "Value"]);
  const imported = measurements.slice(1).map(([time, value]) => [(time as unknown as Date).toISOString(), value]);
  expect(imported).toEqual(expect.arrayContaining([["2026-11-01T00:00:00.000Z", 10], ["2026-11-03T12:00:00.000Z", 30.5]]));

  // The downloaded workbook imports back as it is.
  const xlsx = { name: "steps.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await readFile(path) };
  await page.getByLabel("Or choose a file").setInputFiles(xlsx);
  await expect(page.getByRole("status").filter({ hasText: `${imported.length} of ${imported.length} measurements ready.` })).toBeVisible();
});
