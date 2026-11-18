// @vitest-environment node
import { readSheet } from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import type { Counter, ItemMeta, Model } from "../data/types";
import { counterWorkbook, exportFileName, modelWorkbook, workbookCsv } from "./exports";
import { parseMeasurementTable, parseQuantityTable } from "./imports";
import { parseCsvTable, sheetTable, type CellValue } from "./table";
import { toXlsxSheets, writeXlsx } from "./xlsx";

const NOW = new Date("2026-11-18T10:00:00Z");

const META: ItemMeta = { itemUuid: "i", role: "owner", ownership: "unowned", idleExpirySeconds: 60, expiresAt: "", updatedAt: "", links: [] };

const counter: Counter = {
  ...META,
  name: "Pages written",
  unit: "pages",
  targetValue: 100,
  deadline: null,
  status: "active",
  completedAt: null,
  measurements: [
    { measuredAt: "2026-11-01T09:00:00.000Z", value: 10 },
    { measuredAt: "2026-11-02T09:30:15.250Z", value: -2.5 },
    { measuredAt: "2026-11-03T23:59:59.000Z", value: 30 },
  ],
  measurementsTruncated: false,
  startValue: 10,
  latestValue: 30,
  forecast: null,
  method: "bayesian_linear_regression",
  runSimilar: true,
  seriesRootUuid: null,
};

async function xlsxFirstSheet(blob: Blob): Promise<CellValue[][]> {
  const rows = await readSheet(Buffer.from(await blob.arrayBuffer()));
  return rows.map((row) => row.map((cell) => cell as unknown as CellValue));
}

describe("counter export", () => {
  it("re-imports the same measurements from its CSV and its Excel file", async () => {
    const workbook = counterWorkbook(counter, NOW);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(["Measurements", "Forecast", "Summary"]);
    expect(parseMeasurementTable(parseCsvTable(workbookCsv(workbook))).good).toEqual(counter.measurements);

    const rows = await xlsxFirstSheet(await writeXlsx(workbook));
    expect(rows[0]).toEqual(["Time", "Value"]);
    expect(rows[1]?.[0]).toBeInstanceOf(Date);
    expect(parseMeasurementTable(sheetTable(rows)).good).toEqual(counter.measurements);
  }, 30_000);

  it("writes a bold, frozen header", () => {
    const [sheet] = toXlsxSheets(counterWorkbook(counter, NOW));
    expect(sheet?.stickyRowsCount).toBe(1);
    expect(sheet?.data[0]?.[0]).toMatchObject({ value: "Time", fontWeight: "bold" });
  });
});

describe("formula injection", () => {
  const model: Model = {
    ...META,
    name: "=HYPERLINK(\"x\")",
    description: "@risk",
    latestVersion: 1,
    version: {
      versionUuid: "v",
      versionNumber: 1,
      note: "",
      createdAt: "2026-11-18T00:00:00Z",
      quantities: [
        { name: "hours", kind: "input", input: { shape: "range", low: -5, high: 10, distribution: "normal" }, description: "+44 call" },
        { name: "total", kind: "formula", formula: "hours * 2" },
      ],
    },
    queuedRunError: null,
  };

  it("guards text in the CSV, keeps Excel text as plain strings, and both import back", async () => {
    const workbook = modelWorkbook(model, null, NOW);
    const csv = workbookCsv(workbook);
    expect(csv).toContain("'=hours * 2");
    expect(csv).toContain("'-5 to 10");
    expect(csv).toContain("'+44 call");
    expect(parseQuantityTable(parseCsvTable(csv), []).good).toEqual(model.version?.quantities);

    const blob = await writeXlsx(workbook);
    const summary = await readSheet(Buffer.from(await blob.arrayBuffer()), "Summary");
    expect(summary[1]).toEqual(["Name", "=HYPERLINK(\"x\")"]);
    const rows = await xlsxFirstSheet(blob);
    expect(rows[2]?.[1]).toBe("=hours * 2");
    expect(parseQuantityTable(sheetTable(rows), []).good).toEqual(model.version?.quantities);
  }, 30_000);
});

describe("exportFileName", () => {
  it("slugs the item name and adds the date", () => {
    expect(exportFileName("Pages / written: Q4!", NOW, "xlsx")).toBe("pages-written-q4-2026-11-18.xlsx");
    expect(exportFileName("***", NOW, "csv")).toBe("done-when-2026-11-18.csv");
  });
});
