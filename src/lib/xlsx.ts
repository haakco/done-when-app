// Excel files, written and read in the browser. The libraries load only when someone downloads
// or imports an .xlsx, so the main bundle does not carry them.

import type { Sheet as XlsxSheet, CellObject } from "write-excel-file/browser";
import type { ColumnKind, Sheet, SheetCell, Workbook } from "./exports";
import { sheetTable, type CellValue, type Table } from "./table";

const DAY_MS = 86_400_000;
const UNIX_EPOCH_SERIAL = 25_569;

/**
 * Excel's date number: days since 1900, in UTC. Half a millisecond is added because readers turn
 * the floating-point day back into whole milliseconds by truncating, so the exact time survives.
 */
function excelSerial(date: Date): number {
  return (date.getTime() + 0.5) / DAY_MS + UNIX_EPOCH_SERIAL;
}

/**
 * One cell as write-excel-file takes it. Text is always a string cell, never a formula, so a
 * value such as `=hours * rate` shows as typed and Excel does not run it.
 */
function xlsxCell(cell: SheetCell, kind: ColumnKind): CellObject | null {
  if (cell === null) return null;
  if (typeof cell === "object" && "percent" in cell) return { value: cell.percent, type: Number, format: "0%" };
  if (cell instanceof Date) return { value: excelSerial(cell), type: Number, format: kind === "date" ? "yyyy-mm-dd" : "yyyy-mm-dd hh:mm:ss" };
  if (typeof cell === "number") return { value: cell, type: Number, ...(kind === "percent" ? { format: "0%" } : {}) };
  if (typeof cell === "boolean") return { value: cell, type: Boolean };
  return { value: cell, type: String };
}

/** The sheets in write-excel-file's shape: bold frozen header row, set column widths. */
export function toXlsxSheets(workbook: Workbook): XlsxSheet<Blob>[] {
  return workbook.sheets.map((sheet: Sheet) => ({
    sheet: sheet.name,
    stickyRowsCount: 1,
    columns: sheet.columns.map((column) => ({ width: column.width })),
    data: [
      sheet.columns.map((column): CellObject => ({ value: column.header, type: String, fontWeight: "bold" })),
      ...sheet.rows.map((row) => row.map((cell, index) => xlsxCell(cell, sheet.columns[index]?.kind ?? "auto"))),
    ],
  }));
}

export async function writeXlsx(workbook: Workbook): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  return writeXlsxFile(toXlsxSheets(workbook)).toBlob();
}

/** The first sheet of an .xlsx file, as the import reads it. */
export async function readXlsx(file: Blob): Promise<Table> {
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  // read-excel-file types a date cell as `typeof Date`; at run time it is a Date instance.
  return sheetTable(rows.map((row) => row.map((cell) => cell as unknown as CellValue)));
}

export function isXlsxFile(file: File): boolean {
  return /\.xlsx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

/** Hands the browser a file to save. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click is handled, or some browsers cancel the download.
  setTimeout(() => { URL.revokeObjectURL(url); }, 0);
}
