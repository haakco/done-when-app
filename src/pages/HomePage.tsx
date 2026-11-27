import { parseModelValue } from "@haakco/custd-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CounterForm } from "../components/CounterForm";
import { ForecastExample } from "../components/ForecastExample";
import { Field } from "../components/Field";
import { RecentList } from "../components/RecentList";
import { WithData } from "../components/WithData";
import { APP_MODEL_QUANTITY_KINDS, parseAppItemLink } from "@haakco/custd-sdk/browser";

import { WriteError } from "../components/ItemStates";
import type { DoneWhenData, ModelDraft } from "../data";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { ownerPath } from "../lib/links";

export function HomePage() {
  return (
    <>
      <h1 className="hero home-hero">See when it will be done.</h1>
      <p className="lede">Plan projects, forecast progress and run meetings. Share the whole picture from one dashboard.</p>
      <section aria-label="Planning and meetings">
        <ul className="card-grid">
          <li className="card">
            <h2>Build a plan</h2>
            <p>Connect tasks and forecast when the whole project could finish.</p>
            <div className="button-row">
              <Link className="button" to="/examples/plan">Try the launch plan</Link>
              <Link to="/new/plan">Start a plan</Link>
            </div>
          </li>
          <li className="card">
            <h2>Run a meeting</h2>
            <p>Run a timed agenda and see how early finishes and overruns affect the next item.</p>
            <div className="button-row">
              <Link className="button" to="/examples/meeting">Try a sample meeting</Link>
              <Link to="/new/meeting">Start a meeting</Link>
            </div>
          </li>
        </ul>
        <p><Link to="/examples/dashboard">See the sample dashboard</Link></p>
      </section>
      <div className="home-start">
        <section className="card card--lead" aria-labelledby="start-heading">
          <h2 id="start-heading">Start a counter</h2>
          <WithData>{({ data }) => <CounterForm data={data} />}</WithData>
        </section>
        <ForecastExample />
      </div>
      <section className="section" aria-labelledby="other-heading">
        <h2 id="other-heading">Plan and manage your work</h2>
        <ul className="card-grid">
          <li className="card">
            <h3>
              <Link to="/new/project">Track a project</Link>
            </h3>
            <p className="muted small">For a site launch, start with Dec 8–15 and narrow the estimate once testing is scheduled.</p>
          </li>
          <li className="card">
            <h3>
              <Link to="/new/model">Build a model</Link>
            </h3>
            <WithData>{({ data }) => <QuickModelForm data={data} />}</WithData>
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

function QuickModelForm({ data }: { data: DoneWhenData }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: (draft: ModelDraft) => data.createModel(draft),
    onSuccess: (created) => navigate(ownerPath("model", created.ownerToken)),
  });
  return (
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      const line = new FormData(event.currentTarget).get("model");
      if (typeof line !== "string") return;
      const separator = line.lastIndexOf(":");
      const name = line.slice(0, separator).trim();
      if (separator < 0 || !name || name.length > 255) {
        setError("Enter a model name followed by a colon and a value.");
        return;
      }
      const parsed = parseModelValue(line.slice(separator + 1));
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      if (parsed.value.kind !== APP_MODEL_QUANTITY_KINDS.input) {
        setError("Start with a number, a range like 5 to 10, or a proportion like 3 of 10.");
        return;
      }
      setError("");
      create.mutate({
        name, description: "", expiresAfterSeconds: DEFAULT_EXPIRY_SECONDS,
        quantities: [{ name: "estimate", ...parsed.value }],
      });
    }}>
      <Field label="Start with one estimate" hint="For example: Launch materials: 500 to 800" error={error}>
        {(control) => <input {...control} name="model" required onChange={() => { setError(""); }} />}
      </Field>
      <button type="submit" className="button" disabled={create.isPending}>
        {create.isPending ? "Creating…" : "Start model"}
      </button>
      <WriteError error={create.error} />
    </form>
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
