import { ConvergenceStory } from "@haakco/custd-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "react-router";
import { AlertsPanel } from "../components/AlertsPanel";
import type { CreatedState } from "../components/CounterForm";
import { Field } from "../components/Field";
import { ReadOnlyNotice, WriteError } from "../components/ItemStates";
import { LiveLine } from "../components/LiveLine";
import { KeepInMyItems, LinksAndExpiry } from "../components/OwnerSettings";
import { ShareBox } from "../components/ShareBox";
import { StatusBadge } from "../components/StatusBadge";
import type { DoneWhenData, EstimateDraft, ItemAccess, Project } from "../data";
import { projectOf } from "../data/live";
import { dateInputToRfc3339, formatDate, formatShortDate, rfc3339ToDateInput, todayDateInput } from "../lib/dates";
import { useNarrow } from "../lib/use-narrow";
import { projectSummary } from "../lib/forecast-text";
import type { ItemViewProps } from "./view-props";

/** An estimate older than this is marked stale. */
export const STALE_AFTER_DAYS = 14;

export function ProjectView({ data, access, read, live, showOwnerTools, ownerRoute }: ItemViewProps) {
  const project = projectOf(read);
  const location = useLocation();
  const justCreated = (location.state as Partial<CreatedState> | null)?.created === true;
  const summary = projectSummary(project);
  const narrow = useNarrow();
  const stale = project.status === "active" && project.latest !== null && project.latest.ageDays > STALE_AFTER_DAYS;
  return (
    <article aria-labelledby="item-name" className="item">
      <header className="item__head">
        <h1 id="item-name">{project.name}</h1>
        <StatusBadge status={project.status} />
        {stale && project.latest ? <StatusBadge status="stale" label={`Estimate is ${Math.floor(project.latest.ageDays)} days old`} /> : null}
      </header>
      {justCreated && showOwnerTools ? (
        <p className="notice notice--done" role="status">
          Your project is ready. Bookmark this page: its address is your owner link. Add your first estimate below.
        </p>
      ) : null}
      <section className="summary" aria-label="Summary">
        <p className="summary__headline">{summary.headline}</p>
        {summary.detail ? <p className="summary__detail">{summary.detail}</p> : null}
        <p className="small">
          {project.deliveryTarget ? (
            <>
              Promised for <strong>{formatDate(project.deliveryTarget)}</strong>.{" "}
            </>
          ) : null}
          <span className="muted">Done when: {project.definitionOfDone || "not written yet"}</span>
        </p>
      </section>
      {showOwnerTools ? <ShareBox data={data} access={access} kind="project" meta={project} /> : null}
      {showOwnerTools && project.status === "active" ? <EstimateForm data={data} access={access} /> : null}
      <figure className="chart" aria-label="Estimate convergence">
        <ConvergenceStory
          estimates={project.estimates}
          {...(project.deliveryTarget ? { targetDate: project.deliveryTarget } : {})}
          title={`${project.name}: estimates over time`}
          staleAfterDays={STALE_AFTER_DAYS}
          labels={{ empty: "The chart appears after the first estimate." }}
          formatDate={formatShortDate}
          {...(narrow ? { width: 380, height: 240 } : {})}
        />
      </figure>
      <LiveLine freshness={live.freshness} lastUpdatedAt={live.lastUpdatedAt} />
      <EstimateTable project={project} />
      {ownerRoute && !showOwnerTools ? <ReadOnlyNotice /> : null}
      {showOwnerTools ? <ProjectOwnerTools data={data} access={access} project={project} /> : null}
    </article>
  );
}

function EstimateTable({ project }: { project: Project }) {
  if (project.estimates.length === 0) return null;
  return (
    <details className="more section">
      <summary>All estimates ({project.estimates.length})</summary>
      <div className="table-scroll more__body">
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
            {[...project.estimates].reverse().map((estimate) => (
              <tr key={`${estimate.estimatedAt}-${estimate.low}-${estimate.high}`}>
                <td>{formatDate(estimate.estimatedAt)}</td>
                <td>{formatDate(estimate.low)}</td>
                <td>{formatDate(estimate.high)}</td>
                <td>{estimate.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const EMPTY_ESTIMATE: EstimateDraft = { low: "", high: "", note: "" };

function EstimateForm({ data, access }: { data: DoneWhenData; access: ItemAccess }) {
  const [draft, setDraft] = useState(EMPTY_ESTIMATE);
  const add = useMutation({ mutationFn: (estimate: EstimateDraft) => data.addEstimate(access, estimate) });
  const rangeError = draft.low && draft.high && draft.low > draft.high ? "The low date must be on or before the high date." : null;
  return (
    <section className="card section" aria-labelledby="estimate-heading">
      <h2 id="estimate-heading">Add an estimate</h2>
      <p className="small muted">Pick dates you are 90% sure it lands between.</p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (rangeError !== null) return;
          add.mutate(
            { low: dateInputToRfc3339(draft.low), high: dateInputToRfc3339(draft.high), note: draft.note.trim() },
            { onSuccess: () => { setDraft(EMPTY_ESTIMATE); } },
          );
        }}
      >
        <div className="field-row">
          <Field label="Earliest (low)">
            {(control) => <input {...control} type="date" required value={draft.low} onChange={(event) => { setDraft({ ...draft, low: event.target.value }); }} />}
          </Field>
          <Field label="Latest (high)" error={rangeError}>
            {(control) => <input {...control} type="date" required value={draft.high} onChange={(event) => { setDraft({ ...draft, high: event.target.value }); }} />}
          </Field>
        </div>
        <Field label="Note" hint="Optional: what changed since last time?">
          {(control) => <input {...control} value={draft.note} onChange={(event) => { setDraft({ ...draft, note: event.target.value }); }} />}
        </Field>
        <WriteError error={add.error} />
        <div className="button-row">
          <button type="submit" className="button button--primary" disabled={add.isPending}>
            {add.isPending ? "Saving…" : "Save estimate"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ProjectOwnerTools({ data, access, project }: { data: DoneWhenData; access: ItemAccess; project: Project }) {
  const [target, setTarget] = useState(project.deliveryTarget ? rfc3339ToDateInput(project.deliveryTarget) : "");
  const [completedOn, setCompletedOn] = useState(todayDateInput);
  const saveTarget = useMutation({ mutationFn: (date: string) => data.setDeliveryTarget(access, dateInputToRfc3339(date)) });
  const complete = useMutation({ mutationFn: (date: string) => data.completeProject(access, dateInputToRfc3339(date)) });
  const cancel = useMutation({ mutationFn: () => data.cancelProject(access) });
  const [confirmCancel, setConfirmCancel] = useState(false);
  return (
    <section className="section owner-tools" aria-labelledby="owner-heading">
      <h2 id="owner-heading">Owner tools</h2>
      {project.status === "active" ? (
        <>
          <details className="more">
            <summary>Change the delivery target</summary>
            <form className="form more__body" onSubmit={(event) => { event.preventDefault(); saveTarget.mutate(target); }}>
              <Field label="Delivery target" hint="The date you have told people. It shows as a line on the chart.">
                {(control) => <input {...control} type="date" required value={target} onChange={(event) => { setTarget(event.target.value); }} />}
              </Field>
              <div className="button-row">
                <button type="submit" className="button" disabled={saveTarget.isPending}>
                  Save target
                </button>
                {saveTarget.isSuccess ? <span role="status">Saved.</span> : null}
              </div>
              <WriteError error={saveTarget.error} />
            </form>
          </details>
          <details className="more">
            <summary>Finish or cancel</summary>
            <form className="form more__body" onSubmit={(event) => { event.preventDefault(); complete.mutate(completedOn); }}>
              <Field label="Date it was done">
                {(control) => <input {...control} type="date" required value={completedOn} onChange={(event) => { setCompletedOn(event.target.value); }} />}
              </Field>
              <div className="button-row">
                <button type="submit" className="button button--primary" disabled={complete.isPending}>
                  Mark as done
                </button>
                {confirmCancel ? (
                  <>
                    <span>Cancel this project for good?</span>
                    <button type="button" className="button button--danger" disabled={cancel.isPending} onClick={() => { cancel.mutate(); }}>
                      Yes, cancel it
                    </button>
                    <button type="button" className="button button--quiet" onClick={() => { setConfirmCancel(false); }}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button type="button" className="button button--quiet" onClick={() => { setConfirmCancel(true); }}>
                    Cancel project…
                  </button>
                )}
              </div>
              <WriteError error={complete.error ?? cancel.error} />
            </form>
          </details>
        </>
      ) : null}
      <details className="more">
        <summary>Alerts</summary>
        <div className="more__body">
          <AlertsPanel data={data} access={access} kind="project" />
        </div>
      </details>
      <details className="more">
        <summary>Links, expiry and my items</summary>
        <div className="more__body">
          <KeepInMyItems data={data} access={access} kind="project" meta={project} />
          <LinksAndExpiry data={data} access={access} kind="project" meta={project} />
        </div>
      </details>
    </section>
  );
}
