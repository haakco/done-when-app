import { Link } from "react-router";
import { MEETING_EXAMPLE_START, meetingExample } from "../data/meeting-example";
import plan from "../data/plan-example.json";
import { formatDate } from "../lib/dates";
import { meetingLine } from "../lib/meeting";

export default function DashboardExample() {
  const meeting = meetingExample(4);
  const result = meetingLine(meeting, MEETING_EXAMPLE_START);
  return (
    <article className="item" aria-labelledby="sample-dashboard-title">
      <p className="small muted">Sample dashboard · Fictional workspace</p>
      <h1 id="sample-dashboard-title">Website launch dashboard</h1>
      <p>See the plan forecast and the launch review together in one read-only dashboard.</p>
      <ul className="card-grid dashboard-grid" aria-label="Sample dashboard items">
        <li className="card entry">
          <h2 className="entry__name">Launch the new site</h2>
          <p className="entry__headline">Likely done {formatDate(plan.baseline.median)}</p>
          <p className="small">{Math.round(plan.baseline.deadlineProbability * 100)}% chance by {formatDate(plan.inputs.deadline)}</p>
          <Link to="/examples/plan">Try the launch plan</Link>
        </li>
        <li className="card entry">
          <h2 className="entry__name">{meeting.name}</h2>
          <p className="entry__headline">{result.headline}</p>
          <Link to="/examples/meeting">Try the sample meeting</Link>
        </li>
      </ul>
      <Link className="button button--primary" to="/new/dashboard">Make your own dashboard</Link>
    </article>
  );
}
