// The live forecast's motion and the moments worth marking: pure rules, so the pages only render.

const DAY_MS = 86_400_000;

/** The three dates the forecast line and band are drawn from, as epoch milliseconds. */
export type ForecastDates = { median: number | null; low: number | null; high: number | null };

export const NO_FORECAST: ForecastDates = { median: null, low: null, high: null };

export function forecastDates(forecast: { completionMedian: string | null; completionLow: string | null; completionHigh: string | null } | null): ForecastDates {
  if (!forecast) return NO_FORECAST;
  return { median: epoch(forecast.completionMedian), low: epoch(forecast.completionLow), high: epoch(forecast.completionHigh) };
}

function epoch(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function sameDates(a: ForecastDates, b: ForecastDates): boolean {
  return a.median === b.median && a.low === b.low && a.high === b.high;
}

/** Only a forecast that had and keeps the same parts can glide; anything else just appears. */
export function canGlide(from: ForecastDates, to: ForecastDates): boolean {
  const parts = (dates: ForecastDates) => [dates.median, dates.low, dates.high].map((value) => value !== null).join();
  return from.median !== null && parts(from) === parts(to);
}

/** Starts fast and settles gently. */
export function easeOut(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return 1 - (1 - clamped) ** 3;
}

export function glide(from: ForecastDates, to: ForecastDates, progress: number): ForecastDates {
  const t = easeOut(progress);
  const between = (a: number | null, b: number | null) => (a === null || b === null ? b : Math.round(a + (b - a) * t));
  return { median: between(from.median, to.median), low: between(from.low, to.low), high: between(from.high, to.high) };
}

/** "Forecast moved 2 days earlier", or null when it moved less than a day or there was nothing before. */
export function forecastMoveText(from: ForecastDates, to: ForecastDates): string | null {
  if (from.median === null || to.median === null) return null;
  const days = Math.round((to.median - from.median) / DAY_MS);
  if (days === 0) return null;
  const amount = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  return `Forecast moved ${amount} ${days < 0 ? "earlier" : "later"}`;
}

export const MOMENTS = { targetReached: "target-reached", insideDeadline: "inside-deadline" } as const;
export type MomentKind = (typeof MOMENTS)[keyof typeof MOMENTS];

/** What a counter page needs to notice a moment. */
export type CounterMoment = { status: "active" | "completed"; high: number | null; deadline: string | null };

function insideDeadline(state: CounterMoment): boolean {
  return state.deadline !== null && state.high !== null && state.high <= Date.parse(state.deadline);
}

/**
 * A moment happens when it is seen to happen: the counter completes, or the forecast's 90% range
 * moves inside the deadline, while the page is open. Opening an already-done counter is not one.
 */
export function counterMoment(before: CounterMoment, after: CounterMoment): MomentKind | null {
  if (before.status !== "completed" && after.status === "completed") return MOMENTS.targetReached;
  if (after.status === "active" && before.high !== null && !insideDeadline(before) && insideDeadline(after)) return MOMENTS.insideDeadline;
  return null;
}

export const MOMENT_TEXT: Record<MomentKind, string> = {
  [MOMENTS.targetReached]: "Target reached. Well done!",
  [MOMENTS.insideDeadline]: "Now 90% sure to finish by the deadline.",
};
