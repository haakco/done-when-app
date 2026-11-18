import { APP_MEETING_STATUSES, type AppItemRead } from "@haakco/custd-sdk/browser";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { DownloadMenu } from "../components/DownloadMenu";
import { Field } from "../components/Field";
import { ReadOnlyNotice, WriteError } from "../components/ItemStates";
import { LiveLine } from "../components/LiveLine";
import { KeepInMyItems, LinksAndExpiry } from "../components/OwnerSettings";
import { Progress } from "../components/Progress";
import { ItemHeader } from "../components/ItemHeader";
import { StatusBadge } from "../components/StatusBadge";
import { explainError, isGone, type DashboardEntry, type DoneWhenData, type ItemAccess } from "../data";
import { dashboardOf, meetingOf, modelOf, projectOf, useCounter, useItemRead, useModelRun } from "../data/live";
import { itemKindOf, itemNameOf } from "../data/mappers";
import { MeetingStatus } from "./MeetingView";
import { modelOutputs } from "./ModelView";
import { dashboardWorkbook } from "../lib/exports";
import { counterSummary, modelHeadline, projectSummary } from "../lib/forecast-text";
import { meetingLine } from "../lib/meeting";
import { useNow } from "../lib/use-now";
import type { ItemViewProps } from "./view-props";

export function DashboardView({ data, access, read, live, showOwnerTools, ownerRoute }: ItemViewProps) {
  const dashboard = dashboardOf(read);
  const count = dashboard.entries.length;
  return (
    <article aria-labelledby="item-name" className="item">
      <ItemHeader
        data={data}
        access={access}
        kind="dashboard"
        meta={dashboard}
        title="Dashboard"
        owner={showOwnerTools}
        actions={count > 0 ? <DownloadMenu name="dashboard" build={async () => dashboardWorkbook(await data.dashboardRows(access, dashboard.entries))} /> : null}
      >
        <span className="small muted">
          {count} item{count === 1 ? "" : "s"}
        </span>
      </ItemHeader>
      {count === 0 ? (
        <p className="notice">
          Nothing here yet.{showOwnerTools ? " Paste a counter or project link below to add it." : ""}
        </p>
      ) : null}
      <ul className="card-grid dashboard-grid" aria-label="Dashboard items">
        {dashboard.entries.map((entry) => (
          <EntryCard key={entry.entryUuid} data={data} access={access} entry={entry} owner={showOwnerTools} />
        ))}
      </ul>
      <LiveLine freshness={live.freshness} lastUpdatedAt={live.lastUpdatedAt} />
      {showOwnerTools ? <AddEntryForm data={data} access={access} /> : null}
      {ownerRoute && !showOwnerTools ? <ReadOnlyNotice /> : null}
      {showOwnerTools ? (
        <details className="more section">
          <summary>Links, expiry and my items</summary>
          <div className="more__body">
            <KeepInMyItems data={data} access={access} kind="dashboard" meta={dashboard} />
            <LinksAndExpiry data={data} access={access} kind="dashboard" meta={dashboard} />
          </div>
        </details>
      ) : null}
    </article>
  );
}

type EntryProps = { data: DoneWhenData; access: ItemAccess; entry: DashboardEntry; owner: boolean };

function EntryCard({ data, access, entry, owner }: EntryProps) {
  const read = useItemRead(access, { item: entry.itemUuid });
  const remove = useMutation({ mutationFn: () => data.removeDashboardEntry(access, entry.entryUuid) });
  let body;
  let name = "Item";
  if (read.status === "loading") body = <p className="small muted">Loading…</p>;
  else if (read.status === "error") body = <p className="small muted">{isGone(read.error) ? "This item has expired or its link was replaced." : explainError(read.error)}</p>;
  else {
    name = itemNameOf(read.data);
    const kind = itemKindOf(read.data);
    if (kind === "project") body = <ProjectEntry read={read.data} />;
    else if (kind === "model") body = <ModelEntry access={access} read={read.data} item={entry.itemUuid} />;
    else if (kind === "meeting") body = <MeetingEntry read={read.data} />;
    else body = <CounterEntry access={access} read={read.data} item={entry.itemUuid} />;
  }
  return (
    <li className="card entry">
      <h2 className="entry__name">{name}</h2>
      {body}
      {owner ? (
        <>
          <button type="button" className="button button--quiet" disabled={remove.isPending} onClick={() => { remove.mutate(); }}>
            Remove<span className="visually-hidden"> {name} from the dashboard</span>
          </button>
          <WriteError error={remove.error} />
        </>
      ) : null}
    </li>
  );
}

function CounterEntry({ access, read, item }: { access: ItemAccess; read: AppItemRead; item: string }) {
  const live = useCounter(access, read, { item });
  if (live.status !== "ready") return <p className="small muted">Loading…</p>;
  const counter = live.data;
  const summary = counterSummary(counter);
  return (
    <>
      {counter.status === "completed" ? <StatusBadge status="completed" /> : null}
      <p className="entry__headline">{summary.headline}</p>
      <Progress label={`${counter.name} progress`} current={counter.latestValue} start={counter.startValue} target={counter.targetValue} unit={counter.unit} />
    </>
  );
}

function ProjectEntry({ read }: { read: AppItemRead }) {
  const project = projectOf(read);
  const summary = projectSummary(project);
  return (
    <>
      <StatusBadge status={project.status} />
      <p className="entry__headline">{summary.headline}</p>
      {summary.detail ? <p className="small">{summary.detail}</p> : null}
    </>
  );
}

function ModelEntry({ access, read, item }: { access: ItemAccess; read: AppItemRead; item: string }) {
  const model = modelOf(read);
  const run = useModelRun(access, { item });
  const output = modelOutputs(model)[0];
  return (
    <>
      <p className="small muted">Model{model.latestVersion > 0 ? ` · version ${model.latestVersion}` : ""}</p>
      <p className="entry__headline">{modelHeadline(output, run.status === "ready" ? run.data : null)}</p>
    </>
  );
}

function MeetingEntry({ read }: { read: AppItemRead }) {
  const { meeting } = meetingOf(read);
  const running = meeting.status === APP_MEETING_STATUSES.running;
  const now = useNow(running);
  const line = meetingLine(meeting, now);
  return (
    <>
      <MeetingStatus meeting={meeting} />
      <p className="entry__headline numeric">{line.headline}</p>
      {line.detail ? <p className="small">{line.detail}</p> : null}
    </>
  );
}

function AddEntryForm({ data, access }: { data: DoneWhenData; access: ItemAccess }) {
  const [pasted, setPasted] = useState("");
  const add = useMutation({ mutationFn: (value: string) => data.addDashboardEntry(access, value) });
  return (
    <section className="section card" aria-labelledby="add-entry-heading">
      <h2 id="add-entry-heading">Add a counter, project, model or meeting</h2>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate(pasted, { onSuccess: () => { setPasted(""); } });
        }}
      >
        <Field label="Paste its link" hint="A share link is best; an owner link or a token works too.">
          {(control) => <input {...control} required value={pasted} onChange={(event) => { setPasted(event.target.value); }} />}
        </Field>
        <WriteError error={add.error} />
        <div className="button-row">
          <button type="submit" className="button button--primary" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add to dashboard"}
          </button>
        </div>
      </form>
    </section>
  );
}
