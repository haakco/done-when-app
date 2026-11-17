import { describe, expect, it } from "vitest";
import { formatRate, ratePerSecond, RATE_UNITS } from "./rate";

describe("ratePerSecond", () => {
  it("is null until there are two measurements over a real interval", () => {
    expect(ratePerSecond([])).toBeNull();
    expect(ratePerSecond([{ measuredAt: "2026-11-01T00:00:00Z", value: 1 }])).toBeNull();
    expect(
      ratePerSecond([
        { measuredAt: "2026-11-01T00:00:00Z", value: 1 },
        { measuredAt: "2026-11-01T00:00:00Z", value: 5 },
      ]),
    ).toBeNull();
  });

  it("uses the earliest and latest measurement whatever the input order", () => {
    const rate = ratePerSecond([
      { measuredAt: "2026-11-01T01:00:00Z", value: 40 },
      { measuredAt: "2026-11-01T00:00:00Z", value: 10 },
      { measuredAt: "2026-11-01T00:30:00Z", value: 99 },
    ]);
    expect(rate).toBeCloseTo(30 / 3600);
  });
});

describe("formatRate", () => {
  it("offers second, minute, hour and day", () => {
    expect(RATE_UNITS).toEqual(["second", "minute", "hour", "day"]);
  });

  it("scales the per-second rate and names the unit", () => {
    expect(formatRate(30 / 3600, "hour", "tasks")).toBe("30 tasks per hour");
    expect(formatRate(30 / 3600, "day")).toBe("720 per day");
    expect(formatRate(1 / 7, "second", "km")).toBe("0.143 km per second");
  });

  it("shows falling rates with a minus sign and large rates with grouping", () => {
    expect(formatRate(-2 / 86400, "day")).toBe("-2 per day");
    expect(formatRate(12345.6, "minute")).toBe("740,736 per minute");
  });
});
