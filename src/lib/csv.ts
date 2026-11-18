import type { Measurement } from "../data/types";
import { parseMeasurementTable } from "./imports";
import { parseCsvTable } from "./table";

export type CsvRowError = { line: number; message: string };
export type CsvParseResult = { measurements: Measurement[]; errors: CsvRowError[] };

/** Reads pasted measurement history: every row must be good, or the caller adds nothing. */
export function parseMeasurementCsv(text: string): CsvParseResult {
  const plan = parseMeasurementTable(parseCsvTable(text));
  const errors = plan.rows.flatMap((row) => (row.error === null ? [] : [{ line: row.line, message: row.error }]));
  if (plan.problem) errors.unshift({ line: 0, message: plan.problem });
  return { measurements: plan.good, errors };
}
