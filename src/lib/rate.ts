import type { Measurement } from "../data/types";

export const RATE_UNITS = ["second", "minute", "hour", "day"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

const SECONDS_PER_UNIT: Record<RateUnit, number> = { second: 1, minute: 60, hour: 3600, day: 86400 };

const rateNumber = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });
const largeRateNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Average change per second between the earliest and latest measurement, or null when unknown. */
export function ratePerSecond(measurements: readonly Measurement[]): number | null {
  if (measurements.length < 2) {
    return null;
  }
  const ordered = [...measurements].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  const first = ordered[0];
  const last = ordered.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  const seconds = (Date.parse(last.measuredAt) - Date.parse(first.measuredAt)) / 1000;
  return seconds > 0 ? (last.value - first.value) / seconds : null;
}

export function formatRate(perSecond: number, unit: RateUnit, valueUnit?: string): string {
  const scaled = perSecond * SECONDS_PER_UNIT[unit];
  const number = Math.abs(scaled) >= 1000 ? largeRateNumber.format(scaled) : rateNumber.format(scaled);
  return valueUnit ? `${number} ${valueUnit} per ${unit}` : `${number} per ${unit}`;
}
