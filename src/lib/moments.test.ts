import { describe, expect, it } from "vitest";
import { canGlide, counterMoment, forecastDates, forecastMoveText, glide, MOMENTS, NO_FORECAST } from "./moments";

const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dates = (median: string, low: string, high: string) => ({ median: day(median), low: day(low), high: day(high) });

describe("live forecast", () => {
  it("glides from the old dates to the new ones and lands exactly", () => {
    const from = dates("2026-12-10", "2026-12-01", "2026-12-20");
    const to = dates("2026-12-08", "2026-12-02", "2026-12-14");
    expect(glide(from, to, 0)).toEqual(from);
    expect(glide(from, to, 1)).toEqual(to);
    const middle = glide(from, to, 0.5).median ?? 0;
    expect(middle).toBeLessThan(from.median);
    expect(middle).toBeGreaterThan(to.median);
  });

  it("glides only between forecasts with the same parts", () => {
    expect(canGlide(NO_FORECAST, dates("2026-12-10", "2026-12-01", "2026-12-20"))).toBe(false);
    expect(canGlide({ median: day("2026-12-10"), low: null, high: null }, dates("2026-12-10", "2026-12-01", "2026-12-20"))).toBe(false);
    expect(canGlide(dates("2026-12-10", "2026-12-01", "2026-12-20"), dates("2026-12-11", "2026-12-01", "2026-12-21"))).toBe(true);
  });

  it("says how far the forecast moved in whole days, and nothing for the first forecast or a small move", () => {
    const before = dates("2026-12-10", "2026-12-01", "2026-12-20");
    expect(forecastMoveText(before, dates("2026-12-08", "2026-12-01", "2026-12-20"))).toBe("Forecast moved 2 days earlier");
    expect(forecastMoveText(before, dates("2026-12-11", "2026-12-01", "2026-12-20"))).toBe("Forecast moved 1 day later");
    expect(forecastMoveText(before, { ...before, median: before.median + 3_600_000 })).toBeNull();
    expect(forecastMoveText(NO_FORECAST, before)).toBeNull();
  });

  it("reads a forecast's dates and ignores a missing one", () => {
    expect(forecastDates(null)).toEqual(NO_FORECAST);
    expect(forecastDates({ completionMedian: "2026-12-10T00:00:00Z", completionLow: null, completionHigh: null })).toEqual({ median: day("2026-12-10"), low: null, high: null });
  });
});

describe("moments", () => {
  const deadline = "2026-12-15T00:00:00Z";
  it("marks the target being reached while the page is open", () => {
    expect(counterMoment({ status: "active", high: null, deadline: null }, { status: "completed", high: null, deadline: null })).toBe(MOMENTS.targetReached);
    expect(counterMoment({ status: "completed", high: null, deadline: null }, { status: "completed", high: null, deadline: null })).toBeNull();
  });

  it("marks the 90% range moving inside the deadline, once", () => {
    const outside = { status: "active" as const, high: day("2026-12-20"), deadline };
    const inside = { status: "active" as const, high: day("2026-12-14"), deadline };
    expect(counterMoment(outside, inside)).toBe(MOMENTS.insideDeadline);
    expect(counterMoment(inside, inside)).toBeNull();
    expect(counterMoment({ ...outside, high: null }, inside)).toBeNull();
    expect(counterMoment(outside, { ...inside, deadline: null })).toBeNull();
  });
});
