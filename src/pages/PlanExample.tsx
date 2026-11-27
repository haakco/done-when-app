import { ForecastChart } from "@haakco/custd-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import example from "../data/plan-example.json";
import { formatDate, formatShortDate } from "../lib/dates";
import { PlanProgress } from "./PlanProgress";

const PlanCanvas = lazy(() => import("./PlanCanvas"));
const parts = example.inputs.parts.map((part) => ({
  itemUuid: part.id,
  required: true,
  prerequisites: part.prerequisites ?? [],
}));
const DAY_MS = 86_400_000;
const names = new Map(example.inputs.parts.map((part) => [part.id, part.name]));

function inspect(id: string) {
  const detail = document.getElementById(`example-part-${id}`);
  if (!(detail instanceof HTMLDetailsElement)) return;
  detail.open = true;
  detail.querySelector("summary")?.focus();
}

const signOff = example.inputs.parts.find((part) => part.id === "sign-off");
const baselineDuration = signOff?.durationDays?.join("–");
const previewDuration = signOff?.previewDurationDays?.join("–");
const chance = (value: number) => `${Math.round(value * 100)}%`;

export default function PlanExample() {
  const [params, setParams] = useSearchParams();
  const preview = params.get("estimate") === "long";
  const [showCanvas, setShowCanvas] = useState(false);
  const { hash } = useLocation();
  const scenario = preview ? "preview" : "baseline";
  const forecast = example[scenario];
  const duration = preview ? previewDuration : baselineDuration;

  useEffect(() => {
    if (hash.startsWith("#example-part-")) inspect(hash.slice("#example-part-".length));
  }, [hash]);

  return (
    <div className="more__body">
      <p className="small muted">Example plan · fictional tasks and measurements</p>
      <h1>Launch the new site</h1>
      <p>Editing and checks can run in parallel. Launch sign-off starts after both finish.</p>
      <section className="summary" aria-label="Overall forecast">
        <h2>Likely done {formatDate(forecast.median)}</h2>
        <p>90% forecast range · {formatDate(forecast.lower)} to {formatDate(forecast.upper)}</p>
        <p>{chance(forecast.deadlineProbability)} chance by {formatDate(example.inputs.deadline)}</p>
        <p role="status">
          {preview ? `Likely finish moved from ${formatDate(example.baseline.median)} to ${formatDate(forecast.median)}. The forecast range moved from ${formatDate(example.baseline.lower)}–${formatDate(example.baseline.upper)} to ${formatDate(forecast.lower)}–${formatDate(forecast.upper)}. Deadline chance moved from ${chance(example.baseline.deadlineProbability)} to ${chance(forecast.deadlineProbability)}.` : ""}
        </p>
      </section>
      <p>Launch sign-off estimate · {duration} days</p>
      <button type="button" className="button button--primary" onClick={() => {
        setParams((current) => {
          const next = new URLSearchParams(current);
          if (preview) next.delete("estimate");
          else next.set("estimate", "long");
          return next;
        }, { replace: true });
      }}>
        {preview ? "Reset sign-off estimate" : `Allow ${previewDuration} days for sign-off`}
      </button>
      <details className="more">
        <summary>How the simulation works</summary>
        <p>Monte Carlo simulation samples a possible duration for each task and applies the dependencies on each of {example.inputs.trials} runs. The median splits the simulated finishes in half. The 90% range shows the middle 90% of finishes, and the deadline chance counts runs that finished by the deadline.</p>
        <p><Link to="/help/forecasting">Forecasting guide</Link></p>
      </details>
      <details className="more">
        <summary>Simulated finish dates</summary>
        <table className="estimates">
          <thead><tr><th scope="col">Finish date</th><th scope="col">Runs</th></tr></thead>
          <tbody>{example.finishDates[scenario].map(({ at, count }) => (
            <tr key={at}><th scope="row">{formatDate(at)}</th><td>{count}</td></tr>
          ))}</tbody>
        </table>
      </details>
      <p>{forecast.completedParts} of {forecast.requiredParts} required parts complete</p>
      <p>Most often blocking sign-off: {names.get(example.mostFrequentSignOffBlocker[scenario])}</p>
      <PlanProgress forecast={forecast} deadline={example.inputs.deadline} />
      <ul className="item-list">
        {example.inputs.parts.map((part) => {
          const history = part.measurements?.map((value, index, values) => ({
            at: new Date(Date.parse(example.inputs.asOf) +
              (index - values.length + 1) * example.inputs.measurementIntervalDays * DAY_MS).toISOString(),
            value,
          }));
          const fit = Object.entries(example.partForecasts).find(([id]) => id === part.id)?.[1];
          return (
            <li key={part.id}>
              <details className="more" id={`example-part-${part.id}`}>
                <summary>{part.name}</summary>
                {history && fit && part.target !== undefined ? (
                  <>
                    <p>Likely done {formatDate(fit.median)} · 90% range {formatShortDate(Date.parse(fit.lower))} to {formatShortDate(Date.parse(fit.upper))}</p>
                    <ForecastChart
                      title={part.name}
                      data={{
                        observations: history,
                        target: part.target,
                        completionMedian: fit.median,
                        completionInterval: { confidence: 0.9, lower: fit.lower, upper: fit.upper },
                      }}
                      formatDate={formatShortDate}
                    />
                    <p>Measurements</p>
                    <ul>{history.map(({ at, value }) => (
                      <li key={at}>{formatShortDate(Date.parse(at))} · {value} {part.unit}</li>
                    ))}</ul>
                  </>
                ) : (
                  <p>Allow {duration} days after pages and checks are both complete.</p>
                )}
              </details>
            </li>
          );
        })}
      </ul>
      <details className="more" onToggle={(event) => { setShowCanvas(event.currentTarget.open); }}>
        <summary>Dependency canvas</summary>
        {showCanvas ? <Suspense fallback={<p>Loading canvas…</p>}><PlanCanvas parts={parts} names={names} inspect={inspect} /></Suspense> : null}
      </details>
      <p><Link className="button button--primary" to="/new/plan">Start a plan</Link></p>
      <p><Link to={`/examples/dashboard${preview ? "?estimate=long" : ""}`}>See the sample dashboard</Link></p>
    </div>
  );
}
