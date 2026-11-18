// Tables read from a pasted or chosen CSV (or an .xlsx sheet) and written as CSV. Imports and
// exports share these shapes so a downloaded file reads back in unchanged.

/** One cell: text from a CSV, or a typed value from a spreadsheet. */
export type CellValue = string | number | boolean | Date | null;

/** A record and the file line it starts on, for error messages. */
export type TableRow = { line: number; cells: CellValue[] };

/** `decimalComma` is true for `;`-separated files, where `12,5` means twelve and a half. */
export type Table = { rows: TableRow[]; decimalComma: boolean };

const BOM = "﻿";
const SEPARATORS = [",", ";", "\t"] as const;

/** Reads CSV text: a BOM, a `sep=` line, `,` `;` or tab separators, quoted fields with `""` and line breaks. */
export function parseCsvTable(input: string): Table {
  let text = input.startsWith(BOM) ? input.slice(1) : input;
  let firstLine = 1;
  let separator = sniffSeparator(text);
  const sepLine = /^sep=(.)\r?\n/i.exec(text);
  if (sepLine?.[1]) {
    separator = sepLine[1];
    text = text.slice(sepLine[0].length);
    firstLine = 2;
  }
  return { rows: tokenize(text, separator, firstLine), decimalComma: separator === ";" };
}

function sniffSeparator(text: string): string {
  const firstRecord = text.replace(/"(?:[^"]|"")*"/g, "").split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  let best: string = ",";
  let bestCount = 0;
  for (const candidate of SEPARATORS) {
    const count = firstRecord.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function tokenize(text: string, separator: string, firstLine: number): TableRow[] {
  const rows: TableRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = firstLine;
  let rowLine = firstLine;
  const endRow = () => {
    cells.push(cell.trim());
    if (cells.some((value) => value !== "")) rows.push({ line: rowLine, cells: trimTrailingEmpty(cells) });
    cells = [];
    cell = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else {
        if (char === "\n") line += 1;
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
    } else if (char === separator) {
      cells.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      endRow();
      line += 1;
      rowLine = line;
    } else if (char !== "\r") cell += char;
  }
  endRow();
  return rows;
}

function trimTrailingEmpty(cells: CellValue[]): CellValue[] {
  let end = cells.length;
  while (end > 0 && (cells[end - 1] === "" || cells[end - 1] === null)) end -= 1;
  return cells.slice(0, end);
}

/** Drops empty rows and trailing empty cells from a spreadsheet's rows, numbering them from 1. */
export function sheetTable(rows: readonly (readonly CellValue[])[]): Table {
  const table: TableRow[] = [];
  rows.forEach((cells, index) => {
    const trimmed = trimTrailingEmpty(cells.map((cell) => (typeof cell === "string" ? cell.trim() : cell)));
    if (trimmed.length > 0) table.push({ line: index + 1, cells: trimmed });
  });
  return { rows: table, decimalComma: false };
}

/** Text a spreadsheet would read as a formula starts with one of these. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Prefixes `'` so a spreadsheet opening the CSV shows the text instead of running it. */
export function guardFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** Undoes `guardFormula` on text read back from a CSV. */
export function unguardFormula(text: string): string {
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function csvCell(value: CellValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const safe = guardFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV text with a header row, CRLF line ends and ISO times. */
export function toCsv(headers: readonly string[], rows: readonly (readonly CellValue[])[]): string {
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
