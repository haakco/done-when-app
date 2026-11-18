// What each item's download holds, as plain sheets. The first sheet is the item's main table and
// uses the import's column names, so a downloaded file (Excel or CSV) imports back unchanged.

import { formatModelValue } from "@haakco/custd-react";
import { APP_MODEL_INPUT_SHAPES, APP_MODEL_QUANTITY_KINDS, type AppModelQuantity, type AppModelRun } from "@haakco/custd-sdk/browser";
import type { Counter, Model, Project } from "../data/types";
import { counterSummary, projectSummary, type Summary } from "./forecast-text";
import { ratePerSecond } from "./rate";
import { toCsv, type CellValue } from "./table";

/** `auto` picks per cell: dates as dates, numbers as numbers, the rest as text. */
export type ColumnKind = "text" | "number" | "percent" | "date" | "datetime" | "auto";
export type SheetColumn = { header: string; kind: ColumnKind; width: number };
/** A fraction shown as a percentage in a column that is not all percentages. */
export type Percent = { percent: number };
export type SheetCell = CellValue | Percent;
export type Sheet = { name: string; columns: SheetColumn[]; rows: SheetCell[][] };
export type Workbook = { sheets: Sheet[] };

/** One dashboard tile, flattened for the download. */
export type DashboardRow = { name: string; kind: string; status: string; headline: string; detail: string; updatedAt: Date | null };

const DAY_SECONDS = 86_400;

const text = (header: string, width = 24): SheetColumn => ({ header, kind: "text", width });
const number = (header: string, width = 14): SheetColumn => ({ header, kind: "number", width });
const datetime = (header: string): SheetColumn => ({ header, kind: "datetime", width: 20 });
const date = (header: string): SheetColumn => ({ header, kind: "date", width: 12 });

const asDate = (iso: string | null | undefined): Date | null => (iso ? new Date(iso) : null);

function summarySheet(fields: [string, SheetCell][]): Sheet {
  return { name: "Summary", columns: [text("Field", 26), { header: "Value", kind: "auto", width: 48 }], rows: fields };
}

function headlineText(summary: Summary): string {
  return summary.detail ? `${summary.headline}. ${summary.detail}` : summary.headline;
}

export function counterWorkbook(counter: Counter, now: Date): Workbook {
  const forecast = counter.forecast;
  const rate = ratePerSecond(counter.measurements);
  const forecastRows: SheetCell[][] = forecast
    ? [[forecast.method, asDate(forecast.forecastFrom), asDate(forecast.completionLow), asDate(forecast.completionMedian), asDate(forecast.completionHigh), forecast.deadlineProbability, rate === null ? null : rate * DAY_SECONDS, forecast.inputCount, asDate(forecast.generatedAt)]]
    : [];
  return {
    sheets: [
      { name: "Measurements", columns: [datetime("Time"), number("Value")], rows: counter.measurements.map((row) => [new Date(row.measuredAt), row.value]) },
      {
        name: "Forecast",
        columns: [text("Method", 28), date("Forecast from"), date("Completion p5"), date("Completion p50"), date("Completion p95"), { header: "Deadline probability", kind: "percent", width: 20 }, number("Observed rate per day", 20), number("Measurements used", 18), datetime("Generated at")],
        rows: forecastRows,
      },
      summarySheet([
        ["Name", counter.name],
        ["Unit", counter.unit],
        ["Target", counter.targetValue],
        ["Deadline", asDate(counter.deadline)],
        ["Status", counter.status],
        ["Start value", counter.startValue],
        ["Latest value", counter.latestValue],
        ["Measurements", counter.measurements.length],
        ["Forecast", headlineText(counterSummary(counter))],
        ...(counter.measurementsTruncated ? ([["Note", `Includes the newest ${counter.measurements.length} measurements only.`]] satisfies [string, SheetCell][]) : []),
        ["Exported at", now],
      ]),
    ],
  };
}

export function projectWorkbook(project: Project, now: Date): Workbook {
  return {
    sheets: [
      {
        name: "Estimates",
        columns: [datetime("Date"), date("Low"), date("High"), text("Note", 40), number("Width (days)"), number("Moved (days)")],
        rows: project.estimates.map((estimate) => [new Date(estimate.estimatedAt), new Date(estimate.low), new Date(estimate.high), estimate.note, estimate.widthDays, estimate.movementDays ?? null]),
      },
      summarySheet([
        ["Name", project.name],
        ["Done when", project.definitionOfDone],
        ["Delivery target", asDate(project.deliveryTarget)],
        ["Status", project.status],
        ["Completed at", asDate(project.completedAt)],
        ["Chance by target", project.latest?.chanceByTarget == null ? null : { percent: project.latest.chanceByTarget }],
        ["Estimates", project.estimates.length],
        ["Forecast", headlineText(projectSummary(project))],
        ["Exported at", now],
      ]),
    ],
  };
}

function quantityKind(quantity: AppModelQuantity): string {
  if (quantity.kind === APP_MODEL_QUANTITY_KINDS.formula) return "formula";
  return quantity.input.shape === APP_MODEL_INPUT_SHAPES.bound ? "linked" : "input";
}

export function modelWorkbook(model: Model, run: AppModelRun | null, now: Date): Workbook {
  const results = new Map((run?.quantities ?? []).map((result) => [result.name, result]));
  const quantities = model.version?.quantities ?? [];
  const sensitivity = [...(run?.sensitivity?.inputs ?? [])].sort((a, b) => Math.abs(b.rankCorrelation) - Math.abs(a.rankCorrelation));
  return {
    sheets: [
      {
        name: "Quantities",
        columns: [text("Name", 18), text("Value", 22), text("Unit", 12), text("Description", 36), text("Kind", 10), ...["Mean", "SD", "P5", "P25", "P50", "P75", "P95"].map((header) => number(header, 12)), text("Error", 30)],
        rows: quantities.map((quantity) => {
          const result = results.get(quantity.name);
          const summary = result?.summary;
          const stats = summary ? [summary.mean, summary.stdDev, summary.percentiles.p5, summary.percentiles.p25, summary.percentiles.p50, summary.percentiles.p75, summary.percentiles.p95] : [null, null, null, null, null, null, null];
          return [quantity.name, formatModelValue(quantity), quantity.unit ?? "", quantity.description ?? "", quantityKind(quantity), ...stats, result?.error ? result.error.detail : ""];
        }),
      },
      {
        name: "Sensitivity",
        columns: [number("Rank", 8), text("Input", 18), number("Rank correlation", 18), { header: "Share", kind: "percent", width: 10 }],
        rows: sensitivity.map((input, index) => [index + 1, input.name, input.rankCorrelation, input.share]),
      },
      summarySheet([
        ["Name", model.name],
        ["Description", model.description],
        ["Version", model.latestVersion],
        ["Last run", asDate(run?.createdAt)],
        ["Simulated trials", run?.sampleCount ?? null],
        ["Sensitivity of", run?.sensitivity?.output ?? ""],
        ["Exported at", now],
      ]),
    ],
  };
}

export function dashboardWorkbook(rows: DashboardRow[]): Workbook {
  return {
    sheets: [
      {
        name: "Items",
        columns: [text("Name", 28), text("Kind", 10), text("Status", 12), text("Headline", 40), text("Detail", 48), datetime("Updated at")],
        rows: rows.map((row) => [row.name, row.kind, row.status, row.headline, row.detail, row.updatedAt]),
      },
    ],
  };
}

/** The main table as CSV: the first sheet, which is also what the import reads. */
export function workbookCsv(workbook: Workbook): string {
  const [main] = workbook.sheets;
  if (!main) return "";
  return toCsv(main.columns.map((column) => column.header), main.rows.map((row) => row.map(plainCell)));
}

export function plainCell(cell: SheetCell): CellValue {
  return cell !== null && typeof cell === "object" && "percent" in cell ? cell.percent : cell;
}

/** `<item-name>-<yyyy-mm-dd>.<ext>`, safe as a file name whatever the item is called. */
export function exportFileName(name: string, now: Date, extension: "xlsx" | "csv"): string {
  const slug = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "done-when";
  return `${slug}-${now.toISOString().slice(0, 10)}.${extension}`;
}
