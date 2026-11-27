import { useState } from "react";
import { Link } from "react-router";
import type { ProjectEstimate } from "../data";
import { formatDate } from "../lib/dates";
import { EstimateTable } from "./ProjectView";

const estimates = [
  { estimatedAt: "2026-12-01T00:00:00Z", low: "2026-12-08T00:00:00Z", high: "2026-12-15T00:00:00Z", widthDays: 7, note: "Testing dates are still open." },
  { estimatedAt: "2026-12-04T00:00:00Z", low: "2026-12-10T00:00:00Z", high: "2026-12-12T00:00:00Z", widthDays: 2, note: "The test slot is confirmed." },
] satisfies [ProjectEstimate, ProjectEstimate];

export const projectExampleName = "Finish the site checks";
export const projectExampleBaseline = range(estimates[0]);

function range(estimate: ProjectEstimate) {
  return `${formatDate(estimate.low)} – ${formatDate(estimate.high)}`;
}

export default function ProjectExample() {
  const [confirmed, setConfirmed] = useState(false);
  const [initial, revised] = estimates;
  return (
    <article className="item">
      <p className="small muted">Sample project estimate</p>
      <h1>{projectExampleName}</h1>
      <p>Start with one range for the whole job. Update it when testing has a date.</p>
      <section className="summary" aria-label="Finish estimate" aria-live="polite">
        <p className="summary__headline">Likely {range(confirmed ? revised : initial)}</p>
        {confirmed ? <p className="summary__detail">The range narrowed from {range(initial)} after the test slot was confirmed.</p> : null}
      </section>
      <button type="button" className="button" onClick={() => { setConfirmed(!confirmed); }}>
        {confirmed ? "Reset estimate" : "Confirm the test slot"}
      </button>
      <EstimateTable estimates={confirmed ? estimates : [initial]} />
      <p className="button-row"><Link className="button button--primary" to="/new/project">Start a project estimate</Link></p>
    </article>
  );
}
