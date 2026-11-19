import { lazy, Suspense, useState } from "react";
import example from "../data/plan-example.json";
import { formatDate } from "../lib/dates";
import { PlanProgress } from "./PlanProgress";

const PlanCanvas = lazy(() => import("./PlanCanvas"));
const parts = example.inputs.parts.map((part) => ({
  itemUuid: part.id,
  required: true,
  prerequisites: part.prerequisites ?? [],
}));
const names = new Map(example.inputs.parts.map((part) => [part.id, part.name]));

export default function PlanExample() {
  const [preview, setPreview] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [meetingStage, setMeetingStage] = useState<"ready" | "review" | "decide" | "ended">("ready");
  const forecast = preview ? example.preview : example.baseline;
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
      <PlanProgress forecast={forecast} deadline={example.inputs.deadline} />
      <ul className="item-list">
        {example.inputs.parts.map((part) => (
          <li key={part.id}>
            <details className="more">
              <summary>{part.name}</summary>
              {part.measurements ? (
                <p>Recorded {part.measurements.map((value, index) =>
                  preview && index === part.measurements.length - 1 && part.previewValue !== undefined ? part.previewValue : value,
                ).join(", ")} {part.unit}. Target {part.target} {part.unit}.</p>
              ) : (
                <p>Allow 1–2 days after pages and checks are both complete.</p>
              )}
            </details>
          </li>
        ))}
      </ul>
      <details className="more" onToggle={(event) => { setShowCanvas(event.currentTarget.open); }}>
        <summary>Dependency canvas</summary>
        {showCanvas ? <Suspense fallback={<p>Loading canvas…</p>}><PlanCanvas parts={parts} names={names} /></Suspense> : null}
      </details>
      <section className="section" aria-label="Example meeting">
        <h3>Launch review</h3>
        <p>10 minutes planned · Review progress, then decide what to do next.</p>
        {meetingStage === "ready" ? <button type="button" className="button" onClick={() => { setMeetingStage("review"); }}>Start sample meeting</button> : null}
        {meetingStage === "review" ? (
          <>
            <p role="status">Review progress · 5 min planned</p>
            <button type="button" className="button" onClick={() => { setMeetingStage("decide"); }}>Finish review after 3 min</button>
          </>
        ) : null}
        {meetingStage === "decide" ? (
          <>
            <p role="status">Decide next steps · 5 min planned. Review finished 2 min early.</p>
            <button type="button" className="button" onClick={() => { setMeetingStage("ended"); }}>Finish decisions after 8 min</button>
          </>
        ) : null}
        {meetingStage === "ended" ? (
          <div role="status">
            <p>Planned 10 min. Took 11 min. Finished 1 min late.</p>
            <p>Review progress · 5 min planned · 3 min actual</p>
            <p>Decide next steps · 5 min planned · 8 min actual</p>
            <p>Action · Finish editing the remaining pages.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
