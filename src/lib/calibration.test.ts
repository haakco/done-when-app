import { describe, expect, it } from "vitest";
import { calibrationOf, calibrationText } from "./calibration";

describe("calibration", () => {
  it("counts the ranges that contained the finish day, ends included", () => {
    const estimates = [
      { low: "2026-11-01T00:00:00Z", high: "2026-12-04T00:00:00Z" },
      { low: "2026-12-05T00:00:00Z", high: "2026-12-20T00:00:00Z" },
    ];
    expect(calibrationOf(estimates, "2026-12-04T17:00:00Z")).toEqual({ hits: 1, total: 2 });
  });

  it("explains the score in plain words, with a small-sample warning", () => {
    expect(calibrationText({ hits: 1, total: 2 })).toEqual({
      headline: "1 of 2 ranges included the date it was done (50%).",
      meaning:
        "A 90% range should include the real date about 9 times in 10. Ranges that miss more than 1 time in 10 are too narrow: give the next ones more room. With 2 ranges this is a rough sign, not a verdict.",
    });
    expect(calibrationText({ hits: 10, total: 10 }).meaning).toContain("That is what 90% ranges should do.");
  });
});
