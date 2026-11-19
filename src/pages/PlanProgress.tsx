import type { AppPlanForecast } from "@haakco/custd-sdk/browser";
import { useState } from "react";
import { formatDate, formatShortDate } from "../lib/dates";
import "../styles/plan-progress.css";

const WIDTH = 600;
const HEIGHT = 180;
const INSET = 28;
const DAY_MS = 86_400_000;

export function PlanProgress({ forecast, deadline }: { forecast: AppPlanForecast; deadline: string | undefined }) {
  const [wholeHorizon, setWholeHorizon] = useState(false);
  const actual = forecast.observedProgress ?? [];
  const projected = forecast.projectedProgress ?? [];
  if (actual.length === 0 && projected.length === 0) return null;
  const asOf = Date.parse(forecast.asOf);
  const start = Math.min(asOf, ...actual.map((point) => Date.parse(point.at)));
  const horizon = Date.parse(forecast.horizon);
  const deadlineAt = deadline ? Date.parse(deadline) : asOf;
  const forecastEnd = forecast.upper ?? forecast.median;
  const defaultEnd = Math.max(asOf + 14 * DAY_MS, deadlineAt, forecastEnd ? Date.parse(forecastEnd) + 2 * DAY_MS : asOf);
  const end = Math.min(horizon, wholeHorizon ? horizon : defaultEnd);
  const visible = projected.filter((point) => Date.parse(point.at) <= end);
  const ceiling = Math.max(1, forecast.requiredParts);
  const x = (at: string) => INSET + (WIDTH - 2 * INSET) * (Date.parse(at) - start) / (end - start);
  const y = (count: number) => HEIGHT - INSET - (HEIGHT - 2 * INSET) * count / ceiling;
  const median = visible.map((point) => `${x(point.at)},${y(point.median)}`).join(" ");
  const lower = visible.map((point) => `${x(point.at)},${y(point.lower)}`);
  const upper = [...visible].reverse().map((point) => `${x(point.at)},${y(point.upper)}`);
  const actualPath: string[] = [];
  let previouslyCompleted = 0;
  for (const point of actual) {
    actualPath.push(`${x(point.at)},${y(previouslyCompleted)}`, `${x(point.at)},${y(point.completed)}`);
    previouslyCompleted = point.completed;
  }
  if (actual.length) actualPath.push(`${x(forecast.asOf)},${y(forecast.completedParts)}`);
  return (
    <figure className="plan-progress">
      <figcaption>Required parts complete over time</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Recorded completions and projected completion count">
        <path className="plan-progress__axis" d={`M ${INSET} ${INSET} V ${HEIGHT - INSET} H ${WIDTH - INSET}`} />
        <text x={4} y={INSET + 4}>{ceiling}</text>
        <text x={10} y={HEIGHT - INSET}>0</text>
        <text x={INSET} y={HEIGHT - 6}>{formatShortDate(start)}</text>
        <text x={WIDTH - INSET} y={HEIGHT - 6} textAnchor="end">{formatShortDate(end)}</text>
        <polygon className="plan-progress__band" points={[...lower, ...upper].join(" ")} />
        <polyline className="plan-progress__projection" points={median} />
        <polyline className="plan-progress__actual" points={actualPath.join(" ")} />
        {deadline && deadlineAt >= start && deadlineAt <= end ? (
          <line className="plan-progress__deadline" x1={x(deadline)} x2={x(deadline)} y1={INSET} y2={HEIGHT - INSET} />
        ) : null}
      </svg>
      <p className="small muted">Solid line · Recorded. Dashed line · Median forecast. Shaded area · 90% range.
        {deadline ? ` Dotted marker · Deadline ${formatDate(deadline)}.` : ""}
      </p>
      {projected.length > 0 && defaultEnd < horizon ? (
        <button type="button" className="button button--quiet" onClick={() => { setWholeHorizon(!wholeHorizon); }}>
          {wholeHorizon ? "Focus on likely finish" : "Show full horizon"}
        </button>
      ) : null}
      {actual.length > 0 ? (
        <details className="more">
          <summary>Recorded completions</summary>
          <ul>{actual.map((point) => (
            <li key={point.at}>{formatDate(point.at)} · {point.completed} complete</li>
          ))}</ul>
        </details>
      ) : null}
      {visible.length > 0 ? <details className="more">
        <summary>Forecast values</summary>
        <div className="table-scroll">
          <table className="estimates">
            <thead><tr><th scope="col">Date</th><th scope="col">Lower</th><th scope="col">Median</th><th scope="col">Upper</th></tr></thead>
            <tbody>{visible.map((point) => (
              <tr key={point.at}>
                <th scope="row">{formatDate(point.at)}</th><td>{point.lower}</td><td>{point.median}</td><td>{point.upper}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details> : null}
    </figure>
  );
}
