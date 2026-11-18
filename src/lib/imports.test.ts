import type { AppModelQuantity } from "@haakco/custd-sdk/browser";
import { describe, expect, it } from "vitest";
import { mergeQuantities, parseEstimateTable, parseMeasurementTable, parseQuantityTable } from "./imports";
import { guardFormula, parseCsvTable, toCsv } from "./table";

const errorsOf = (plan: { rows: { line: number; error: string | null }[] }) =>
  plan.rows.flatMap((row) => (row.error ? [{ line: row.line, message: row.error }] : []));

describe("parseCsvTable", () => {
  it("reads an Excel CSV: BOM, sep= line, ; separators, decimal commas and quoted line breaks", () => {
    const table = parseCsvTable('﻿sep=;\r\nValue;Time;Note\r\n"1.234,5";01/11/2026 09:30;"two\r\nlines; ""quoted"""\r\n');
    expect(table.decimalComma).toBe(true);
    expect(table.rows).toEqual([
      { line: 2, cells: ["Value", "Time", "Note"] },
      { line: 3, cells: ["1.234,5", "01/11/2026 09:30", 'two\r\nlines; "quoted"'] },
    ]);
  });

  it("finds the separator outside quotes and numbers rows after a quoted line break", () => {
    const table = parseCsvTable('name,value\n"a, b","line\nbreak"\nc,1');
    expect(table.rows.map((row) => row.line)).toEqual([1, 2, 4]);
    expect(table.rows[1]?.cells).toEqual(["a, b", "line\nbreak"]);
  });
});

describe("parseMeasurementTable", () => {
  it("finds value and time headers in either order and reads common date formats", () => {
    const plan = parseMeasurementTable(parseCsvTable("Value;Date\n12,5;2026/11/02\n13;25/11/2026 08:00\n14;2026-11-26 10:15:30"));
    expect(plan.good).toEqual([
      { measuredAt: "2026-11-02T00:00:00.000Z", value: 12.5 },
      { measuredAt: "2026-11-25T08:00:00.000Z", value: 13 },
      { measuredAt: "2026-11-26T10:15:30.000Z", value: 14 },
    ]);
    expect(plan.problem).toBeNull();
  });

  it("refuses to guess an ambiguous day/month order", () => {
    const plan = parseMeasurementTable(parseCsvTable("time,value\n03/04/2026,1"));
    expect(errorsOf(plan)).toEqual([{ line: 2, message: "“03/04/2026” could be day/month or month/day; write it as yyyy-mm-dd" }]);
  });

  it("reads month-first dates when one date shows it", () => {
    const plan = parseMeasurementTable(parseCsvTable("time,value\n03/04/2026,1\n12/31/2026,2"));
    expect(plan.good.map((row) => row.measuredAt.slice(0, 10))).toEqual(["2026-03-04", "2026-12-31"]);
  });

  it("reads thousands separators in comma files", () => {
    expect(parseMeasurementTable(parseCsvTable('2026-11-01,"1,250"')).good).toEqual([{ measuredAt: "2026-11-01T00:00:00.000Z", value: 1250 }]);
  });
});

describe("parseEstimateTable", () => {
  it("reads date, low, high and note, and explains rows it cannot use", () => {
    const csv = ["date,low,high,note", "2026-11-01,2026-12-01,2027-01-10,first", ",2026-12-05,2027-01-01,", "2026-11-03,2027-02-01,2027-01-01,backwards", `2026-11-04,2027-01-01,2027-01-02,${"x".repeat(2001)}`].join("\n");
    const plan = parseEstimateTable(parseCsvTable(csv));
    expect(plan.good).toEqual([
      { estimatedAt: "2026-11-01T00:00:00.000Z", low: "2026-12-01T00:00:00.000Z", high: "2027-01-10T00:00:00.000Z", note: "first" },
      { estimatedAt: null, low: "2026-12-05T00:00:00.000Z", high: "2027-01-01T00:00:00.000Z", note: "" },
    ]);
    expect(errorsOf(plan)).toEqual([
      { line: 4, message: "the high date is before the low date" },
      { line: 5, message: "the note is longer than 2000 characters" },
    ]);
  });
});

describe("parseQuantityTable", () => {
  const bound = { shape: "bound", source: { kind: "counter_forecast", projectUuid: "p", field: "rate_per_day" } } as const;
  const existing: AppModelQuantity[] = [
    { name: "hours", kind: "input", input: { shape: "range", low: 5, high: 10, distribution: "lognormal" } },
    { name: "rate", kind: "input", input: bound },
  ];

  it("validates shorthand, keeps a range's shape, reads guarded formulas and keeps bound inputs", () => {
    const csv = toCsv(["name", "value", "unit", "description"], [
      ["hours", "6 to 12", "h", ""],
      ["rate", "", "$/h", ""],
      ["total", "=hours * rate", "$", "Cost"],
      ["share", "3 of 10", "", ""],
      ["bad name", "1", "", ""],
      ["oops", "lots", "", ""],
      ["total", "2", "", ""],
    ]);
    expect(csv).toContain("'=hours * rate");
    const plan = parseQuantityTable(parseCsvTable(csv), existing);
    expect(plan.good).toEqual([
      { name: "hours", kind: "input", input: { shape: "range", low: 6, high: 12, distribution: "lognormal" }, unit: "h" },
      { name: "rate", kind: "input", input: bound, unit: "$/h" },
      { name: "total", kind: "formula", formula: "hours * rate", unit: "$", description: "Cost" },
      { name: "share", kind: "input", input: { shape: "proportion", successes: 3, trials: 10 } },
    ]);
    expect(errorsOf(plan).map((error) => error.line)).toEqual([6, 7, 8]);
    expect(plan.rows.map((row) => row.cells[4])).toEqual(["replaces", "replaces", "new", "new", undefined, undefined, undefined]);
    expect(mergeQuantities(existing, plan.good).map((quantity) => quantity.name)).toEqual(["hours", "rate", "total", "share"]);
  });
});

describe("guardFormula", () => {
  it("prefixes text a spreadsheet would run, and only that", () => {
    expect(["=1+1", "+44", "-x", "@SUM(A1)", "plain", "12"].map(guardFormula)).toEqual(["'=1+1", "'+44", "'-x", "'@SUM(A1)", "plain", "12"]);
  });
});
