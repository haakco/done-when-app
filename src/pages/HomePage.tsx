import { lazy, Suspense, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CounterForm } from "../components/CounterForm";
import { ForecastExample } from "../components/ForecastExample";
import { Field } from "../components/Field";
import { RecentList } from "../components/RecentList";
import { WithData } from "../components/WithData";
import { parseAppItemLink } from "@haakco/custd-sdk/browser";

const PlanExample = lazy(() => import("./PlanExample"));

export function HomePage() {
  const [exampleOpen, setExampleOpen] = useState(false);
  return (
    <>
      <h1 className="hero home-hero">See when it will be done.</h1>
      <p className="lede">Plan projects, forecast progress and run meetings. Share the whole picture from one dashboard.</p>
      <div className="home-start">
        <section className="card card--lead" aria-labelledby="start-heading">
          <h2 id="start-heading">Start a counter</h2>
          <WithData>{({ data }) => <CounterForm data={data} />}</WithData>
        </section>
        <ForecastExample />
      </div>
      <details className="more section" onToggle={(event) => { setExampleOpen(event.currentTarget.open); }}>
        <summary>Try the launch plan</summary>
        {exampleOpen ? <Suspense fallback={<p role="status">Loading example…</p>}><PlanExample /></Suspense> : null}
      </details>
      <section className="section" aria-labelledby="other-heading">
        <h2 id="other-heading">Plan and manage your work</h2>
        <ul className="card-grid">
          <li className="card">
            <h3>
              <Link to="/new/project">Track a project</Link>
            </h3>
            <p className="muted small">Record low and high dates and watch them close in on the day it lands.</p>
          </li>
          <li className="card">
            <h3>
              <Link to="/new/model">Build a model</Link>
            </h3>
            <p className="muted small">Put ranges on what you are unsure of and see the range of the answer.</p>
          </li>
          <li className="card">
            <h3>
              <Link to="/new/meeting">Run a meeting</Link>
            </h3>
            <p className="muted small">Give each part of the agenda a time, run it live, and see planned against actual.</p>
          </li>
          <li className="card">
            <h3>
              <Link to="/new/plan">Build a plan</Link>
            </h3>
            <p className="muted small">Connect work that depends on other parts and see when the whole plan could finish.</p>
          </li>
          <li className="card">
            <h3>
              <Link to="/new/dashboard">Make a dashboard</Link>
            </h3>
            <p className="muted small">Put counters, projects, models and meetings on one screen that updates itself.</p>
          </li>
        </ul>
      </section>
      <RecentList />
      <OpenLink />
    </>
  );
}

/** Paste any Done When link to open it. */
function OpenLink() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="section" aria-labelledby="open-heading">
      <h2 id="open-heading">Have a link?</h2>
      <form
        className="form form--inline"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = parseAppItemLink(value);
          if (parsed === null) {
            setError("That is not a Done When link. Paste the whole link someone sent you.");
            return;
          }
          const kind = parsed.kindPath ?? "c";
          void navigate(parsed.role === "owner" ? `/edit/${kind}#${parsed.token}` : `/${kind}/${parsed.token}`);
        }}
      >
        <Field label="Paste a link to open it" error={error}>
          {(control) => <input {...control} required value={value} onChange={(event) => { setValue(event.target.value); setError(null); }} />}
        </Field>
        <div className="button-row">
          <button type="submit" className="button">
            Open
          </button>
        </div>
      </form>
    </section>
  );
}
