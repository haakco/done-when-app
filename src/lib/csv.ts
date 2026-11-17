import type { Measurement } from "../data/types";

export type CsvRowError = { line: number; message: string };
export type CsvParseResult = { measurements: Measurement[]; errors: CsvRowError[] };

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** Parses a two-column CSV of ISO timestamp and value. A header row is allowed as the first row only. */
export function parseMeasurementCsv(text: string): CsvParseResult {
  const result: CsvParseResult = { measurements: [], errors: [] };
  const lines = text.split(/\r?\n/);
  let firstRow = true;
  lines.forEach((raw, index) => {
    if (raw.trim() === "") {
      return;
    }
    const isFirstRow = firstRow;
    firstRow = false;
    const row = parseRow(raw, index + 1);
    if ("message" in row) {
      if (!(isFirstRow && looksLikeHeader(raw))) {
        result.errors.push(row);
      }
      return;
    }
    result.measurements.push(row);
  });
  if (result.measurements.length === 0 && result.errors.length === 0) {
    result.errors.push({ line: 0, message: "no rows found" });
  }
  return result;
}

function parseRow(raw: string, line: number): Measurement | CsvRowError {
  const cells = raw.split(",").map(unquote);
  if (cells.length !== 2) {
    return { line, message: `expected 2 columns, found ${cells.length}` };
  }
  const [timestamp = "", valueText = ""] = cells;
  const time = ISO_TIMESTAMP.test(timestamp) ? Date.parse(timestamp) : Number.NaN;
  if (Number.isNaN(time)) {
    return { line, message: `“${timestamp}” is not an ISO timestamp` };
  }
  const value = valueText === "" ? Number.NaN : Number(valueText);
  if (!Number.isFinite(value)) {
    return { line, message: `“${valueText}” is not a number` };
  }
  return { measuredAt: new Date(time).toISOString(), value };
}

function looksLikeHeader(raw: string): boolean {
  const [first = ""] = raw.split(",").map(unquote);
  return !/^\d/.test(first);
}

function unquote(cell: string): string {
  const trimmed = cell.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1).trim() : trimmed;
}
