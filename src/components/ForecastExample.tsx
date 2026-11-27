import { ForecastChart } from "@haakco/custd-react";
import { useState } from "react";
import { formatDate, formatShortDate } from "../lib/dates";
import { ForecastKey, ForecastMove, useGlidingForecast } from "./LiveForecast";
import { Progress } from "./Progress";

const TARGET = 100;
const observations = [
  { at: "2026-11-02T00:00:00Z", value: 10 },
  { at: "2026-11-04T00:00:00Z", value: 24 },
  { at: "2026-11-06T00:00:00Z", value: 37 },
  { at: "2026-11-08T00:00:00Z", value: 61 },
];
const day = (date: number) => Date.UTC(2026, 10, date);
const initialDates = { median: day(16), low: day(14), high: day(20) };
const updatedDates = { median: day(13), low: day(12), high: day(16) };

export function ForecastExample({ onStart }: { onStart: () => void }) {
  const [added, setAdded] = useState(false);
  const dates = added ? updatedDates : initialDates;
  const { shown, moving, announcement } = useGlidingForecast(dates);
  const median = new Date(shown.median ?? dates.median).toISOString();
  const range = { confidence: 0.9, lower: new Date(shown.low ?? dates.low).toISOString(), upper: new Date(shown.high ?? dates.high).toISOString() };
  const rows = added ? observations : observations.slice(0, 3);
  return (
    <section className="card forecast-example" aria-labelledby="example-heading">
      <p className="forecast-example__label">Try a forecast</p>
      <h2 id="example-heading">Write 100 pages</h2>
      <p className="forecast-example__answer">Likely done {formatDate(new Date(dates.median).toISOString())}</p>
      <p className="muted small">90% range {formatShortDate(dates.low)}–{formatShortDate(dates.high)}</p>
      <Progress label="Example progress" current={added ? 61 : 37} start={0} target={TARGET} unit="pages" />
      <button type="button" className="button forecast-example__toggle" onClick={() => { setAdded((previous) => !previous); }}>
        {added ? "Reset example" : "Try adding 24 pages"}
      </button>
      <ForecastMove text={added ? announcement : ""} />
      {added ? (
        <p className="small">37 → 61 pages. Likely finish moved from {formatShortDate(initialDates.median)} to {formatShortDate(updatedDates.median)}. The 90% range narrowed from {formatShortDate(initialDates.low)}–{formatShortDate(initialDates.high)} to {formatShortDate(updatedDates.low)}–{formatShortDate(updatedDates.high)}.</p>
      ) : null}
      <button type="button" className="button button--quiet" onClick={onStart}>Track my own target</button>
      <figure className="chart forecast-example__chart" aria-label="Example forecast" data-forecast-motion={moving ? "moving" : "still"}>
        <ForecastChart
          data={{ observations: rows, target: TARGET, completionMedian: median, completionInterval: range }}
          title="Example: 100 pages"
          width={420}
          height={212}
          formatDate={formatShortDate}
        />
        <ForecastKey projection interval />
      </figure>
    </section>
  );
}
