import { Link, useSearchParams } from "react-router";
import { MEETING_EXAMPLE_START, meetingExample, meetingExampleStep, meetingExampleSteps } from "../data/meeting-example";
import plan from "../data/plan-example.json";
import { formatDate } from "../lib/dates";
import { meetingLine } from "../lib/meeting";
import { DashboardTile } from "./DashboardView";
import { modelExampleBaseline, modelExampleName } from "./ModelExample";
import { projectExampleBaseline, projectExampleName } from "./ProjectExample";

export default function DashboardExample() {
  const [params] = useSearchParams();
  const step = meetingExampleStep(params.get("meetingStep"), 5);
  const meeting = meetingExample(step);
  const result = meetingLine(meeting, MEETING_EXAMPLE_START + meetingExampleSteps[step].minute * 60_000);
  const forecast = params.get("estimate") === "long" ? plan.preview : plan.baseline;
  const search = params.toString();
  return (
    <article className="item" aria-labelledby="sample-dashboard-title">
      <p className="small muted">Sample dashboard · Fictional workspace</p>
      <h1 id="sample-dashboard-title">Website launch dashboard</h1>
      <p>See the launch forecast, review, site checks and materials budget together.</p>
      {!search ? <p className="small muted">Showing the baseline plan and finished launch review.</p> : null}
      <ul className="card-grid dashboard-grid" aria-label="Sample dashboard items">
        <DashboardTile name="Launch the new site" kind="Plan">
          <p className="entry__headline">Likely done {formatDate(forecast.median)}</p>
          <p className="small">{Math.round(forecast.deadlineProbability * 100)}% chance by {formatDate(plan.inputs.deadline)}</p>
          <Link to={{ pathname: "/examples/plan", search }}>Try the launch plan</Link>
        </DashboardTile>
        <DashboardTile name={meeting.name} kind="Meeting">
          <p className="entry__headline">{result.headline}</p>
          {result.detail ? <p className="small">{result.detail}</p> : null}
          <Link to={{ pathname: "/examples/meeting", search }}>Try the sample meeting</Link>
        </DashboardTile>
        <DashboardTile name={projectExampleName} kind="Project estimate">
          <p className="entry__headline">Likely {projectExampleBaseline}</p>
          <Link to="/examples/project">Try the project estimate</Link>
        </DashboardTile>
        <DashboardTile name={modelExampleName} kind="Model">
          <p className="entry__headline">{modelExampleBaseline}</p>
          <Link to="/examples/model">Try the cost model</Link>
        </DashboardTile>
      </ul>
      <Link className="button button--primary" to="/new/dashboard">Make your own dashboard</Link>
    </article>
  );
}
