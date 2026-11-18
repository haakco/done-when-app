// "How calibrated are you?": how many of a project's 90% ranges contained the date it was done.

export type Calibration = { hits: number; total: number };

/** Compares calendar days, so a range ending on the day it was done counts as a hit. */
export function calibrationOf(estimates: readonly { low: string; high: string }[], completedAt: string): Calibration {
  const actual = completedAt.slice(0, 10);
  const hits = estimates.filter((estimate) => estimate.low.slice(0, 10) <= actual && actual <= estimate.high.slice(0, 10)).length;
  return { hits, total: estimates.length };
}

/** Fewer than this many ranges is a rough sign, not a score. */
const SMALL_SAMPLE = 10;
const GOOD_HIT_RATE = 0.9;

export type CalibrationText = { headline: string; meaning: string };

export function calibrationText({ hits, total }: Calibration): CalibrationText {
  const share = Math.round((hits / total) * 100);
  const headline = `${hits} of ${total} range${total === 1 ? "" : "s"} included the date it was done (${share}%).`;
  const verdict =
    hits / total >= GOOD_HIT_RATE
      ? "That is what 90% ranges should do."
      : "Ranges that miss more than 1 time in 10 are too narrow: give the next ones more room.";
  const sample = total < SMALL_SAMPLE ? ` With ${total} range${total === 1 ? "" : "s"} this is a rough sign, not a verdict.` : "";
  return { headline, meaning: `A 90% range should include the real date about 9 times in 10. ${verdict}${sample}` };
}
