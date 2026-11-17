import { Link } from "react-router";
import { exampleShareTokens } from "../data";
import { itemPath } from "../lib/links";

const STARTS = [
  { to: "/new/counter", title: "Counter", text: "Count toward a number and get a forecast for when you reach it." },
  { to: "/new/project", title: "Project", text: "Record low and high estimates and watch them converge on a date." },
  { to: "/new/dashboard", title: "Dashboard", text: "Gather counters and projects on one self-updating screen." },
] as const;

export function HomePage() {
  return (
    <>
      <h1 className="hero">When will it be done?</h1>
      <p className="lede">
        Track progress, get an honest forecast, and share a link anyone can open. No account needed.
      </p>
      <h2 className="section">Start something</h2>
      <ul className="card-grid">
        {STARTS.map((start) => (
          <li key={start.to} className="card">
            <h3>
              <Link to={start.to}>New {start.title.toLowerCase()}</Link>
            </h3>
            <p className="muted">{start.text}</p>
          </li>
        ))}
      </ul>
      <h2 className="section">See an example</h2>
      <ul>
        <li>
          <Link to={itemPath("counter", "share", exampleShareTokens.counter)}>A counter: chapters drafted</Link>
        </li>
        <li>
          <Link to={itemPath("project", "share", exampleShareTokens.project)}>A project: kitchen renovation</Link>
        </li>
        <li>
          <Link to={itemPath("dashboard", "share", exampleShareTokens.dashboard)}>A dashboard: autumn goals</Link>
        </li>
      </ul>
    </>
  );
}
