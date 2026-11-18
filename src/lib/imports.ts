// Turns an imported table into the rows Done When sends, with a reason for every row it cannot
// use. Nothing here talks to Custd: the preview shows the plan and the owner decides.

import { formatModelValue, parseModelValue, type ModelValue } from "@haakco/custd-react";
import { APP_MODEL_INPUT_SHAPES, APP_MODEL_QUANTITY_KINDS, APP_MODEL_RANGE_DISTRIBUTIONS, type AppModelQuantity, type AppModelRangeDistribution } from "@haakco/custd-sdk/browser";
import type { EstimateImport, Measurement } from "../data/types";
import { dayOrderOf, readDate, readNumber, textOf, usesDecimalComma, type DayOrder } from "./cells";
import type { CellValue, Table, TableRow } from "./table";

/** Custd keeps at most this many measurements per counter. */
export const MAX_ITEM_MEASUREMENTS = 20_000;
/** Estimates are sent one request each, so one import is kept to a bounded run. */
export const MAX_ESTIMATE_IMPORT = 500;
/** A model version holds 1 to 100 quantities. */
export const MAX_MODEL_QUANTITIES = 100;
const MAX_NOTE_LENGTH = 2000;
const QUANTITY_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export type ImportRow<T> = { line: number; cells: string[]; value: T | null; error: string | null };

/** `problem` refuses the whole file (empty, too big, unreadable); row errors only skip their row. */
export type ImportPlan<T> = { columns: string[]; rows: ImportRow<T>[]; good: T[]; problem: string | null };

type ColumnSpec = { key: string; aliases: readonly string[]; required: boolean };
type Located = { rows: TableRow[]; byKey: Map<string, number>; positional: boolean };

function normalize(header: CellValue | undefined): string {
  return textOf(header).toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Finds each column by its header, in any order. Without a recognised header the columns are
 * read in the documented order, skipping a first row that `headerLike` says is a title row.
 */
function locate(table: Table, specs: readonly ColumnSpec[], headerLike: (row: TableRow) => boolean): Located {
  const [first, ...rest] = table.rows;
  if (!first) return { rows: [], byKey: new Map(), positional: true };
  const names = first.cells.map(normalize);
  const byKey = new Map<string, number>();
  for (const spec of specs) {
    const index = names.findIndex((name) => spec.aliases.includes(name));
    if (index >= 0) byKey.set(spec.key, index);
  }
  if (specs.every((spec) => !spec.required || byKey.has(spec.key))) return { rows: rest, byKey, positional: false };
  const positional = new Map(specs.map((spec, index) => [spec.key, index]));
  return { rows: headerLike(first) ? rest : table.rows, byKey: positional, positional: true };
}

function columnCountError(row: TableRow, specs: readonly ColumnSpec[]): string | null {
  const required = specs.filter((spec) => spec.required).length;
  if (row.cells.length >= required && row.cells.length <= specs.length) return null;
  const expected = required === specs.length ? `${required}` : `${required} to ${specs.length}`;
  return `expected ${expected} columns, found ${row.cells.length}`;
}

function cellOf(row: TableRow, located: Located, key: string): CellValue | undefined {
  const index = located.byKey.get(key);
  return index === undefined ? undefined : row.cells[index];
}

const startsWithText = (row: TableRow) => !/^\d/.test(textOf(row.cells[0]));

function plan<T>(columns: string[], rows: ImportRow<T>[], problem: string | null = null): ImportPlan<T> {
  const good = rows.flatMap((row) => (row.value === null ? [] : [row.value]));
  return { columns, rows, good, problem: problem ?? (rows.length === 0 ? "The file has no rows to import." : null) };
}

function rawCells(row: TableRow): string[] {
  return row.cells.map((cell) => textOf(cell));
}

function failed<T>(row: TableRow, error: string): ImportRow<T> {
  return { line: row.line, cells: rawCells(row), value: null, error };
}

/** `2026-11-01 09:00` in UTC, as the preview shows a date it read. */
export function previewTime(date: Date): string {
  const iso = date.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : `${iso.slice(0, 16).replace("T", " ")}${iso.slice(16, 19) === ":00" ? "" : iso.slice(16, 19)}`;
}

const MEASUREMENT_COLUMNS: ColumnSpec[] = [
  { key: "time", aliases: ["time", "timestamp", "date", "datetime", "date time", "when", "measured at", "observed at", "recorded"], required: true },
  { key: "value", aliases: ["value", "count", "total", "amount", "measurement"], required: true },
];

/** Measurements: time and value, by header in either order, or time then value. */
export function parseMeasurementTable(table: Table): ImportPlan<Measurement> {
  const located = locate(table, MEASUREMENT_COLUMNS, startsWithText);
  const order = dayOrderOf(located.rows.map((row) => cellOf(row, located, "time")));
  const decimalComma = usesDecimalComma(table, located.rows.map((row) => cellOf(row, located, "value")));
  const rows = located.rows.map((row): ImportRow<Measurement> => {
    const countError = located.positional ? columnCountError(row, MEASUREMENT_COLUMNS) : null;
    if (countError) return failed(row, countError);
    const time = readDate(cellOf(row, located, "time"), order);
    if (!time.ok) return failed(row, time.message);
    const value = readNumber(cellOf(row, located, "value"), decimalComma);
    if (!value.ok) return failed(row, value.message);
    return { line: row.line, cells: [previewTime(time.value), String(value.value)], value: { measuredAt: time.value.toISOString(), value: value.value }, error: null };
  });
  const tooMany = rows.length > MAX_ITEM_MEASUREMENTS ? `A counter holds at most ${MAX_ITEM_MEASUREMENTS.toLocaleString("en")} measurements; this file has ${rows.length.toLocaleString("en")}.` : null;
  return plan(["Time (UTC)", "Value"], rows, tooMany);
}

const ESTIMATE_COLUMNS: ColumnSpec[] = [
  { key: "date", aliases: ["date", "recorded", "estimated", "estimated at", "estimatedat", "when"], required: false },
  { key: "low", aliases: ["low", "earliest", "low date", "lowdate"], required: true },
  { key: "high", aliases: ["high", "latest", "high date", "highdate"], required: true },
  { key: "note", aliases: ["note", "notes", "comment"], required: false },
];
const ESTIMATE_POSITIONAL: ColumnSpec[] = ESTIMATE_COLUMNS.map((spec) => (spec.key === "date" ? { ...spec, required: true } : spec));

/** Estimates: date recorded (blank means now), low, high and an optional note. */
export function parseEstimateTable(table: Table): ImportPlan<EstimateImport> {
  const located = locate(table, ESTIMATE_COLUMNS, startsWithText);
  const dates = located.rows.flatMap((row) => ["date", "low", "high"].map((key) => cellOf(row, located, key)));
  const order = dayOrderOf(dates);
  const rows = located.rows.map((row) => estimateRow(row, located, order));
  const tooMany = rows.length > MAX_ESTIMATE_IMPORT ? `Import at most ${MAX_ESTIMATE_IMPORT} estimates at a time; this file has ${rows.length}.` : null;
  return plan(["Recorded", "Low", "High", "Note"], rows, tooMany);
}

function estimateRow(row: TableRow, located: Located, order: DayOrder): ImportRow<EstimateImport> {
  const countError = located.positional ? columnCountError(row, ESTIMATE_POSITIONAL) : null;
  if (countError) return failed(row, countError);
  const dateCell = cellOf(row, located, "date");
  const recorded = textOf(dateCell) === "" ? null : readDate(dateCell, order);
  if (recorded && !recorded.ok) return failed(row, recorded.message);
  const low = readDate(cellOf(row, located, "low"), order);
  if (!low.ok) return failed(row, `low: ${low.message}`);
  const high = readDate(cellOf(row, located, "high"), order);
  if (!high.ok) return failed(row, `high: ${high.message}`);
  if (high.value < low.value) return failed(row, "the high date is before the low date");
  const note = textOf(cellOf(row, located, "note"));
  if (note.length > MAX_NOTE_LENGTH) return failed(row, `the note is longer than ${MAX_NOTE_LENGTH} characters`);
  const value: EstimateImport = {
    estimatedAt: recorded ? recorded.value.toISOString() : null,
    low: low.value.toISOString(),
    high: high.value.toISOString(),
    note,
  };
  return { line: row.line, cells: [recorded ? previewTime(recorded.value) : "now", previewTime(low.value), previewTime(high.value), note], value, error: null };
}

const QUANTITY_COLUMNS: ColumnSpec[] = [
  { key: "name", aliases: ["name", "quantity"], required: true },
  { key: "value", aliases: ["value", "shorthand", "formula"], required: true },
  { key: "unit", aliases: ["unit", "units"], required: false },
  { key: "description", aliases: ["description", "notes", "note"], required: false },
];

/** The quantity list a version saves: imported rows replace same-named quantities, new names are added. */
export function mergeQuantities(existing: readonly AppModelQuantity[], imported: readonly AppModelQuantity[]): AppModelQuantity[] {
  const byName = new Map(imported.map((quantity) => [quantity.name, quantity]));
  const kept = existing.map((quantity) => byName.get(quantity.name) ?? quantity);
  const known = new Set(existing.map((quantity) => quantity.name));
  return [...kept, ...imported.filter((quantity) => !known.has(quantity.name))];
}

/**
 * Quantities: name, value shorthand (a number, `5 to 10`, `3 of 10`, `=formula`), unit and
 * description. A blank value keeps an existing quantity's value, so a bound input survives.
 */
export function parseQuantityTable(table: Table, existing: readonly AppModelQuantity[]): ImportPlan<AppModelQuantity> {
  const located = locate(table, QUANTITY_COLUMNS, () => false);
  const current = new Map(existing.map((quantity) => [quantity.name, quantity]));
  const seen = new Set<string>();
  const rows = located.rows.map((row) => quantityRow(row, located, current, seen));
  const imported = rows.flatMap((row) => (row.value ? [row.value] : []));
  const total = mergeQuantities(existing, imported).length;
  const tooMany = total > MAX_MODEL_QUANTITIES ? `A model holds at most ${MAX_MODEL_QUANTITIES} quantities; this import would make ${total}.` : null;
  return plan(["Name", "Value", "Unit", "Description", "Change"], rows, tooMany);
}

function quantityRow(row: TableRow, located: Located, current: Map<string, AppModelQuantity>, seen: Set<string>): ImportRow<AppModelQuantity> {
  const countError = located.positional ? columnCountError(row, QUANTITY_COLUMNS) : null;
  if (countError) return failed(row, countError);
  const name = textOf(cellOf(row, located, "name"));
  if (!QUANTITY_NAME.test(name)) return failed(row, `“${name}” is not a quantity name: start with a letter or _, then letters, digits or _`);
  if (seen.has(name)) return failed(row, `“${name}” is already in this file`);
  seen.add(name);
  const previous = current.get(name);
  const text = textOf(cellOf(row, located, "value"));
  const unit = textOf(cellOf(row, located, "unit"));
  const description = textOf(cellOf(row, located, "description"));
  const extra = { ...(unit ? { unit } : {}), ...(description ? { description } : {}) };
  let value: ModelValue;
  if (text === "" && previous) value = previous;
  else {
    const parsed = parseModelValue(text, distributionOf(previous));
    if (!parsed.ok) return failed(row, parsed.message);
    value = parsed.value;
  }
  const quantity: AppModelQuantity = value.kind === APP_MODEL_QUANTITY_KINDS.formula
    ? { name, kind: value.kind, formula: value.formula, ...extra }
    : { name, kind: value.kind, input: value.input, ...extra };
  const shown = quantity.kind === APP_MODEL_QUANTITY_KINDS.input && quantity.input.shape === APP_MODEL_INPUT_SHAPES.bound ? "linked (kept)" : formatModelValue(quantity);
  return { line: row.line, cells: [name, shown, unit, description, previous ? "replaces" : "new"], value: quantity, error: null };
}

/** A range keeps the shape it already has, so a round trip does not change it. */
function distributionOf(quantity: AppModelQuantity | undefined): AppModelRangeDistribution {
  if (quantity?.kind === APP_MODEL_QUANTITY_KINDS.input && quantity.input.shape === APP_MODEL_INPUT_SHAPES.range) return quantity.input.distribution;
  return APP_MODEL_RANGE_DISTRIBUTIONS.normal;
}
