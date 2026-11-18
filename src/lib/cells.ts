// Reads dates and numbers out of imported cells, accepting what spreadsheets commonly write.

import { unguardFormula, type CellValue, type Table } from "./table";

/** How a file writes `03/04/2026`: decided once per file from the dates it holds. */
export type DayOrder = "day-first" | "month-first" | "unknown" | "mixed";

export type CellRead<T> = { ok: true; value: T } | { ok: false; message: string };

const ISO_LIKE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** A cell's text: trimmed, with a CSV export's formula guard removed. */
export function textOf(cell: CellValue | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return unguardFormula(String(cell).trim());
}

/** Looks at every `dd/mm/yyyy`-style value of a column to tell which part is the day. */
export function dayOrderOf(cells: readonly (CellValue | undefined)[]): DayOrder {
  let dayFirst = false;
  let monthFirst = false;
  for (const cell of cells) {
    const match = SLASHED.exec(textOf(cell));
    if (!match) continue;
    if (Number(match[1]) > 12) dayFirst = true;
    if (Number(match[2]) > 12) monthFirst = true;
  }
  if (dayFirst && monthFirst) return "mixed";
  if (dayFirst) return "day-first";
  if (monthFirst) return "month-first";
  return "unknown";
}

/**
 * ISO dates and times, `yyyy/mm/dd`, and `dd/mm/yyyy` or `mm/dd/yyyy` as `order` says.
 * A time without a zone is read as UTC, matching how the app shows dates and writes Excel files.
 */
export function readDate(cell: CellValue | undefined, order: DayOrder): CellRead<Date> {
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? { ok: false, message: "the date cell is not a valid date" } : { ok: true, value: roundMs(cell) };
  const text = textOf(cell);
  if (text === "") return { ok: false, message: "the date is missing" };
  const iso = ISO_LIKE.exec(text);
  if (iso) return fromParts(text, [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6]], iso[7], iso[8]);
  const slashed = SLASHED.exec(text);
  if (!slashed) return notDate(text);
  if (order === "unknown") return { ok: false, message: `“${text}” could be day/month or month/day; write it as yyyy-mm-dd` };
  if (order === "mixed") return { ok: false, message: `“${text}”: this file mixes day/month and month/day dates; use yyyy-mm-dd` };
  const [day, month] = order === "day-first" ? [slashed[1], slashed[2]] : [slashed[2], slashed[1]];
  return fromParts(text, [slashed[3], month, day, slashed[4], slashed[5], slashed[6]], undefined, undefined);
}

function fromParts(text: string, parts: (string | undefined)[], fraction: string | undefined, zone: string | undefined): CellRead<Date> {
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = parts.map((part) => Number(part ?? 0));
  const ms = fraction ? Math.round(Number(fraction) * 1000) : 0;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    return notDate(text);
  }
  return { ok: true, value: new Date(utc - zoneOffsetMs(zone)) };
}

function zoneOffsetMs(zone: string | undefined): number {
  if (!zone || zone.toUpperCase() === "Z") return 0;
  const sign = zone.startsWith("-") ? -1 : 1;
  const digits = zone.slice(1).replace(":", "");
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
}

/** Spreadsheet times are floating-point days; drop the sub-millisecond noise. */
function roundMs(date: Date): Date {
  return new Date(Math.round(date.getTime()));
}

function notDate(text: string): CellRead<Date> {
  return { ok: false, message: `“${text}” is not a date` };
}

/**
 * Whether a column of a `;`-separated file writes `12,5` for twelve and a half. Only then is a dot
 * a thousands separator; a column with no commas keeps dots as decimals.
 */
export function usesDecimalComma(table: Table, cells: readonly (CellValue | undefined)[]): boolean {
  return table.decimalComma && cells.some((cell) => typeof cell === "string" && cell.includes(","));
}

/** Numbers, with thousands separators, and decimal commas when `decimalComma` says so. */
export function readNumber(cell: CellValue | undefined, decimalComma: boolean): CellRead<number> {
  if (typeof cell === "number") return Number.isFinite(cell) ? { ok: true, value: cell } : { ok: false, message: "the number is not finite" };
  const text = textOf(cell);
  if (text === "") return { ok: false, message: "the number is missing" };
  let plain = text.replace(/[\s\u00a0\u202f]/g, "");
  if (decimalComma) plain = plain.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  else if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(plain)) plain = plain.replace(/,/g, "");
  const value = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(plain) ? Number(plain) : Number.NaN;
  return Number.isFinite(value) ? { ok: true, value } : { ok: false, message: `“${text}” is not a number` };
}
