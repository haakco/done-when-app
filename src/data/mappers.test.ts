import { describe, expect, it } from "vitest";
import { withConvergence } from "./mappers";
import { counterSummary, projectSummary } from "../lib/forecast-text";
import type { Counter, ItemMeta, Project } from "./types";

const META: ItemMeta = { itemUuid: "i", role: "share", ownership: "unowned", idleExpirySeconds: 60, expiresAt: "", updatedAt: "", links: [] };

describe("withConvergence", () => {
  it("orders estimates and reports width and midpoint movement", () => {
    const estimates = withConvergence([
      { estimatedAt: "2026-11-05T00:00:00Z", lowDate: "2027-01-02T00:00:00Z", highDate: "2027-01-28T00:00:00Z", note: "" },
      { estimatedAt: "2026-10-01T00:00:00Z", lowDate: "2026-12-10T00:00:00Z", highDate: "2027-03-01T00:00:00Z", note: "" },
    ]);
    expect(estimates.map(({ widthDays, movementDays }) => [widthDays, movementDays])).toEqual([
      [81, undefined],
      [26, -4],
    ]);
  });
});

describe("summaries", () => {
  const counter: Counter = {
    ...META,
    name: "Laps",
    unit: "",
    targetValue: 10,
    deadline: "2026-12-01T00:00:00Z",
    status: "active",
    measurements: [],
    startValue: 0,
    latestValue: 0,
    forecast: null,
    method: "bayesian_linear_regression",
    runSimilar: true,
    seriesRootUuid: null,
  };

  it("leads a counter with when it is done, or what is still needed", () => {
    expect(counterSummary(counter).detail).toBe("Add 3 more measurements to see when you will finish.");
    const measured = { ...counter, measurements: [1, 2, 3].map((value) => ({ measuredAt: "2026-11-01T00:00:00Z", value })) };
    const forecast = {
      method: "bayesian_linear_regression",
      generatedAt: "",
      inputCount: 3,
      completionMedian: "2026-11-20T00:00:00Z",
      completionLow: "2026-11-18T00:00:00Z",
      completionHigh: "2026-11-25T00:00:00Z",
      deadlineProbability: 0.86,
      forecastFrom: null,
      posteriorLines: [],
      histogram: null,
      pooledRunCount: 1,
      warnings: [],
    };
    expect(counterSummary({ ...measured, forecast })).toEqual({
      headline: "Likely done Nov 20, 2026",
      detail: "90% sure: Nov 18, 2026 – Nov 25, 2026 · 86% chance by the Dec 1, 2026 deadline.",
    });
    expect(counterSummary({ ...measured, status: "completed", latestValue: 10 }).headline).toBe("Target reached");
  });

  it("leads a project with its latest range, chance and change", () => {
    const project: Project = {
      ...META,
      name: "Kitchen",
      definitionOfDone: "",
      deliveryTarget: "2027-01-15T00:00:00Z",
      estimates: [{ estimatedAt: "2026-11-05T00:00:00Z", low: "2027-01-02T00:00:00Z", high: "2027-01-28T00:00:00Z", note: "", widthDays: 26, movementDays: -13 }],
      latest: { chanceByTarget: 0.5, ageDays: 1, movementDays: -13 },
      status: "active",
      completedAt: null,
    };
    expect(projectSummary(project)).toEqual({
      headline: "Likely Jan 2, 2027 – Jan 28, 2027",
      detail: "50% chance by the Jan 15, 2027 target · 13 days earlier than last time.",
    });
  });
});
