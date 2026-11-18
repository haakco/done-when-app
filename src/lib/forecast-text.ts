import type { AppModelRun } from "@haakco/custd-sdk/browser";
import { FORECAST_MIN_MEASUREMENTS } from "../data/source";
import type { Counter, Project } from "../data/types";
import { formatDate } from "./dates";

/** The one-line answer an item page leads with, and the detail under it. */
export type Summary = { headline: string; detail: string | null };

export function counterSummary(counter: Counter): Summary {
  if (counter.status === "completed") {
    return { headline: "Target reached", detail: `${counter.latestValue} of ${counter.targetValue}${unitText(counter.unit)}.` };
  }
  const missing = FORECAST_MIN_MEASUREMENTS - counter.measurements.length;
  if (missing > 0) {
    return {
      headline: "Forecast coming soon",
      detail: `Add ${missing} more measurement${missing === 1 ? "" : "s"} to see when you will finish.`,
    };
  }
  const forecast = counter.forecast;
  if (!forecast?.completionMedian) {
    return { headline: "No forecast yet", detail: "The forecast updates after the next measurement." };
  }
  const parts: string[] = [];
  if (forecast.completionLow && forecast.completionHigh) {
    parts.push(`90% sure: ${formatDate(forecast.completionLow)} – ${formatDate(forecast.completionHigh)}`);
  }
  if (forecast.deadlineProbability !== null && counter.deadline) {
    parts.push(`${percent(forecast.deadlineProbability)} chance by the ${formatDate(counter.deadline)} deadline`);
  }
  return { headline: `Likely done ${formatDate(forecast.completionMedian)}`, detail: parts.length > 0 ? `${parts.join(" · ")}.` : null };
}

export function projectSummary(project: Project): Summary {
  if (project.status === "completed") {
    return { headline: project.completedAt ? `Delivered ${formatDate(project.completedAt)}` : "Delivered", detail: null };
  }
  if (project.status === "canceled") {
    return { headline: "Canceled", detail: null };
  }
  const latest = project.estimates.at(-1);
  if (!latest) {
    return { headline: "No estimate yet", detail: "Add a low and high date to start the forecast." };
  }
  const parts: string[] = [];
  if (project.latest?.chanceByTarget != null && project.deliveryTarget) {
    parts.push(`${percent(project.latest.chanceByTarget)} chance by the ${formatDate(project.deliveryTarget)} target`);
  }
  const moved = project.latest?.movementDays ?? latest.movementDays;
  if (moved !== undefined) {
    parts.push(movementText(moved));
  }
  return {
    headline: `Likely ${formatDate(latest.low)} – ${formatDate(latest.high)}`,
    detail: parts.length > 0 ? `${parts.join(" · ")}.` : null,
  };
}

export function movementText(days: number): string {
  if (days === 0) return "No change since the last estimate";
  const amount = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  return days > 0 ? `${amount} later than last time` : `${amount} earlier than last time`;
}

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function unitText(unit: string): string {
  return unit ? ` ${unit}` : "";
}

/** A model's first output as one line, e.g. "total: about 22.5 (90%: 15 – 30)". */
export function modelHeadline(output: string | undefined, run: AppModelRun | null): string {
  const summary = output ? run?.quantities?.find((result) => result.name === output)?.summary : undefined;
  if (!summary || !output) return "No results yet";
  const number = (value: number) => value.toLocaleString("en", { maximumSignificantDigits: 3 });
  return `${output}: about ${number(summary.percentiles.p50)} (90%: ${number(summary.percentiles.p5)} – ${number(summary.percentiles.p95)})`;
}
