import { ForecastChart } from "@haakco/custd-react";
import { lazy, Suspense, useState } from "react";
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

export default function PlanExample() {
  const [preview, setPreview] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [meetingStage, setMeetingStage] = useState<"ready" | "review" | "decide" | "ended">("ready");
  const scenario = preview ? "preview" : "baseline";
  const forecast = example[scenario];
  function inspect(id: string) {
    const detail = document.querySelector<HTMLDetailsElement>(`#example-part-${CSS.escape(id)}`);
    if (!detail) return;
    detail.open = true;
    detail.querySelector("summary")?.focus();
  }

  const chance = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <div className="more__body">
      <p className="small muted">Example plan · fictional measurements</p>
      <h2>Launch the new site</h2>
      <h3>Likely done {formatDate(forecast.median)}</h3>
      <p>{chance(forecast.deadlineProbability)} chance by {formatDate(example.inputs.deadline)}</p>
      <p role="status">
        {preview ? `Likely finish moved from ${formatDate(example.baseline.median)} to ${formatDate(example.preview.median)}. Deadline chance rose from ${chance(example.baseline.deadlineProbability)} to ${chance(example.preview.deadlineProbability)}.` : ""}
      </p>
      <button type="button" className="button button--primary" onClick={() => { setPreview(!preview); }}>
        {preview ? "Reset preview" : "Preview 25 pages edited"}
      </button>
      <p>{forecast.completedParts} of {forecast.requiredParts} required parts complete</p>
      <p>Most often blocking sign-off: {names.get(example.mostFrequentSignOffBlocker[scenario])}</p>
      <PlanProgress forecast={forecast} deadline={example.inputs.deadline} />
      <ul className="item-list">
        {example.inputs.parts.map((part) => {
          const history = part.measurements?.map((value, index, values) => ({
            at: new Date(Date.parse(example.inputs.asOf) +
              (index - values.length + 1) * example.inputs.measurementIntervalDays * DAY_MS).toISOString(),
            value: preview && index === values.length - 1 ? part.previewValue ?? value : value,
          }));
          const fit = Object.entries(example.partForecasts[scenario]).find(([id]) => id === part.id)?.[1];
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
                  <p>Allow 1–2 days after pages and checks are both complete.</p>
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
      <section className="section" aria-label="Example meeting">
        <h3>Launch review</h3>
        <p>10 minutes planned · Review progress, then decide what to do next.</p>
        {meetingStage === "ready" ? <button type="button" className="button" onClick={() => { setMeetingStage("review"); }}>Start sample meeting</button> : null}
        {meetingStage === "review" ? (
          <>
            <p role="status">Review progress · 5 min left. Up next: Decide next steps. Projected finish: 10 min after start.</p>
            <button type="button" className="button" onClick={() => { setMeetingStage("decide"); }}>Finish review after 3 min</button>
          </>
        ) : null}
        {meetingStage === "decide" ? (
          <>
            <p role="status">Decide next steps · 5 min left. Review finished 2 min early. Projected finish: 8 min after start, 2 min ahead of the original plan.</p>
            <button type="button" className="button" onClick={() => { setMeetingStage("ended"); }}>Finish decisions after 8 min</button>
          </>
        ) : null}
        {meetingStage === "ended" ? (
          <div role="status">
            <p>Planned 10 min. Took 11 min. Finished 1 min late.</p>
            <p>Review progress · 5 min planned · 3 min actual</p>
            <p>Decide next steps · 5 min planned · 8 min actual</p>
            <p>Decision · Keep the launch date.</p>
            <p>Action · <a href="#example-part-pages" onClick={() => { inspect("pages"); }}>Finish editing the remaining pages</a>.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
