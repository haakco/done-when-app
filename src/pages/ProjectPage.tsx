import { useState } from "react";
import { useParams } from "react-router";
import { ConvergenceStorySlot } from "../components/ChartSlots";
import { Field } from "../components/Field";
import { LinksPanel } from "../components/LinksPanel";
import { QueryState } from "../components/QueryState";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { StatusBadge } from "../components/StatusBadge";
import { data, type Access, type EstimateDraft, type ItemView, type Project } from "../data";
import { useItemMutation, useProject } from "../data/queries";
import { daysSince, formatDate } from "../lib/dates";

/** An estimate older than this is marked stale. */
const STALE_AFTER_DAYS = 14;

export function ProjectPage({ mode }: { mode: Access }) {
  const { token = "" } = useParams();
  const query = useProject(token);
  return (
    <QueryState query={query} what="project">
      {(view) => <ProjectView view={view} token={token} mode={mode} />}
    </QueryState>
  );
}

function ProjectView({ view, token, mode }: { view: ItemView<Project>; token: string; mode: Access }) {
  const project = view.item;
  return (
    <article aria-labelledby="project-name">
      <h1 id="project-name">{project.name}</h1>
      <StatusBadge status={project.status} />
      {project.completedOn ? <p>Finished {formatDate(project.completedOn)}.</p> : null}
      <h2 className="section">Done when</h2>
      <p>{project.definitionOfDone}</p>
      <p>
        Delivery target: <strong>{formatDate(project.deliveryTarget)}</strong>
      </p>
      <LatestEstimate project={project} />
      <ConvergenceStorySlot />
      <EstimateTable project={project} />
      {mode === "owner" && view.access === "share" ? <ReadOnlyNotice /> : null}
      {mode === "owner" && view.access === "owner" && view.links !== null ? (
        <>
          {project.status === "active" ? <ProjectOwnerTools token={token} /> : null}
          <LinksPanel kind="project" links={view.links} />
        </>
      ) : null}
    </article>
  );
}

function LatestEstimate({ project }: { project: Project }) {
  const latest = project.estimates.at(-1);
  if (latest === undefined) {
    return <p className="muted">No estimate yet.</p>;
  }
  const age = daysSince(latest.recordedOn);
  const previous = project.estimates.at(-2);
  return (
    <div>
      <p className="forecast-text">
        Latest estimate: {formatDate(latest.low)} – {formatDate(latest.high)}
      </p>
      {previous ? (
        <p className="small">
          Last time: {formatDate(previous.low)} – {formatDate(previous.high)}
        </p>
      ) : null}
      {project.chanceByTarget !== null ? (
        <p>
          <strong className="numeric">{Math.round(project.chanceByTarget * 100)}%</strong> chance of landing by the target.
        </p>
      ) : null}
      {project.status === "active" && age > STALE_AFTER_DAYS ? <StatusBadge status="stale" label={`Estimate is ${age} days old`} /> : null}
    </div>
  );
}

function EstimateTable({ project }: { project: Project }) {
  if (project.estimates.length === 0) {
    return null;
  }
  return (
    <section className="section table-scroll" aria-labelledby="estimates-heading">
      <h2 id="estimates-heading">Estimates</h2>
      <table className="estimates">
        <thead>
          <tr>
            <th scope="col">Recorded</th>
            <th scope="col">Low (90%)</th>
            <th scope="col">High (90%)</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {project.estimates.map((estimate) => (
            <tr key={`${estimate.recordedOn}-${estimate.low}-${estimate.high}`}>
              <td>{formatDate(estimate.recordedOn)}</td>
              <td>{formatDate(estimate.low)}</td>
              <td>{formatDate(estimate.high)}</td>
              <td>{estimate.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ProjectOwnerTools({ token }: { token: string }) {
  const [draft, setDraft] = useState<EstimateDraft>({ low: "", high: "", note: "" });
  const [completedOn, setCompletedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const add = useItemMutation("project", token, (estimate: EstimateDraft) => data.addEstimate(token, estimate));
  const complete = useItemMutation("project", token, (on: string) => data.completeProject(token, on));
  const cancel = useItemMutation("project", token, () => data.cancelProject(token));
  const rangeError = draft.low && draft.high && draft.low > draft.high ? "The low date must be on or before the high date." : null;
  return (
    <>
      <section className="section card" aria-labelledby="estimate-heading">
        <h2 id="estimate-heading">Add an estimate</h2>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (rangeError === null) {
              add.mutate(draft, { onSuccess: () => { setDraft({ low: "", high: "", note: "" }); } });
            }
          }}
        >
          <div className="field-row">
            <Field label="Low (90%)">
              {(control) => <input {...control} type="date" required value={draft.low} onChange={(event) => { setDraft({ ...draft, low: event.target.value }); }} />}
            </Field>
            <Field label="High (90%)" error={rangeError}>
              {(control) => <input {...control} type="date" required value={draft.high} onChange={(event) => { setDraft({ ...draft, high: event.target.value }); }} />}
            </Field>
          </div>
          <Field label="Note" hint="What changed since the last estimate?">
            {(control) => <input {...control} value={draft.note} onChange={(event) => { setDraft({ ...draft, note: event.target.value }); }} />}
          </Field>
          {add.error ? <p className="field__error">{add.error.message}</p> : null}
          <div className="button-row">
            <button type="submit" className="button button--primary" disabled={add.isPending}>
              Save estimate
            </button>
          </div>
        </form>
      </section>
      <section className="section card" aria-labelledby="finish-heading">
        <h2 id="finish-heading">Finish</h2>
        <form className="form" onSubmit={(event) => { event.preventDefault(); complete.mutate(completedOn); }}>
          <Field label="Actual finish date">
            {(control) => <input {...control} type="date" required value={completedOn} onChange={(event) => { setCompletedOn(event.target.value); }} />}
          </Field>
          <div className="button-row">
            <button type="submit" className="button" disabled={complete.isPending}>
              Mark complete
            </button>
            <button type="button" className="button button--quiet" disabled={cancel.isPending} onClick={() => { cancel.mutate(); }}>
              Cancel project
            </button>
          </div>
          {complete.error ?? cancel.error ? <p className="field__error">{(complete.error ?? cancel.error)?.message}</p> : null}
        </form>
      </section>
    </>
  );
}
