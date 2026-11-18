import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CounterForm } from "../components/CounterForm";
import { Field } from "../components/Field";
import { WithData } from "../components/WithData";
import { parseAppItemLink } from "@haakco/custd-sdk/browser";

export function HomePage() {
  return (
    <>
      <h1 className="hero">When will it be done?</h1>
      <p className="lede">Count your progress, get an honest forecast, and share one link. No account needed.</p>
      <section className="card card--lead" aria-labelledby="start-heading">
        <h2 id="start-heading">Start a counter</h2>
        <WithData>{({ data }) => <CounterForm data={data} />}</WithData>
      </section>
      <section className="section" aria-labelledby="other-heading">
        <h2 id="other-heading">Or</h2>
        <ul className="card-grid">
          <li className="card">
            <h3>
              <Link to="/new/project">Track a project</Link>
            </h3>
            <p className="muted small">Record low and high dates and watch them close in on the day it lands.</p>
          </li>
          <li className="card">
            <h3>
              <Link to="/new/dashboard">Make a dashboard</Link>
            </h3>
            <p className="muted small">Put several counters and projects on one screen that updates itself.</p>
          </li>
        </ul>
      </section>
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
