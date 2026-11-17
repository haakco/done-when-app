import { describe, expect, it } from "vitest";
import { parseMeasurementCsv } from "./csv";

describe("parseMeasurementCsv", () => {
  it("reads timestamp,value rows and skips a header and blank lines", () => {
    const result = parseMeasurementCsv(
      "timestamp,value\r\n2026-11-01T00:00:00Z,10\r\n\r\n2026-11-02,12.5\n",
    );
    expect(result).toEqual({
      measurements: [
        { measuredAt: "2026-11-01T00:00:00.000Z", value: 10 },
        { measuredAt: "2026-11-02T00:00:00.000Z", value: 12.5 },
      ],
      errors: [],
    });
  });

  it("accepts offsets and quoted fields", () => {
    const result = parseMeasurementCsv('"2026-11-01T02:00:00+02:00","7"');
    expect(result.measurements).toEqual([{ measuredAt: "2026-11-01T00:00:00.000Z", value: 7 }]);
  });

  it("reports each bad row with its line number and keeps the good ones", () => {
    const result = parseMeasurementCsv(
      ["2026-11-01T00:00:00Z,1", "yesterday,2", "2026-11-03T00:00:00Z,lots", "2026-11-04T00:00:00Z,4,extra", "2026-13-01,5"].join("\n"),
    );
    expect(result.measurements).toEqual([{ measuredAt: "2026-11-01T00:00:00.000Z", value: 1 }]);
    expect(result.errors).toEqual([
      { line: 2, message: "“yesterday” is not an ISO timestamp" },
      { line: 3, message: "“lots” is not a number" },
      { line: 4, message: "expected 2 columns, found 3" },
      { line: 5, message: "“2026-13-01” is not an ISO timestamp" },
    ]);
  });

  it("treats only the first row as a possible header", () => {
    const result = parseMeasurementCsv("2026-11-01T00:00:00Z,1\ntimestamp,value");
    expect(result.errors).toEqual([{ line: 2, message: "“timestamp” is not an ISO timestamp" }]);
  });

  it("reports empty input", () => {
    expect(parseMeasurementCsv(" \n")).toEqual({
      measurements: [],
      errors: [{ line: 0, message: "no rows found" }],
    });
  });
});
