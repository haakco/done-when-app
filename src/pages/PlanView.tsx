import type { AppPlan, AppPlanUpdate } from "@haakco/custd-sdk/browser";
import { useMutation, useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { ItemHeader } from "../components/ItemHeader";
import { WriteError } from "../components/ItemStates";
import { KeepInMyItems, LinksAndExpiry } from "../components/OwnerSettings";
import type { ItemAccess } from "../data";
import { useItemRead } from "../data/live";
import { itemNameOf, metaOf } from "../data/mappers";
import { recentItems, savedShareToken } from "../lib/device";
import { tokenFromPaste } from "../lib/links";
import type { ItemViewProps } from "./view-props";

const PlanCanvas = lazy(() => import("./PlanCanvas"));

function DependencyCanvas({ parts, names, connect }: {
  parts: AppPlan["parts"];
  names: Map<string, string>;
  connect?: (source: string, target: string) => void;
}) {
  const [shown, setShown] = useState(false);
  if (!parts.length) return null;
  return (
    <details className="more" onToggle={(event) => { setShown(event.currentTarget.open); }}>
      <summary>Dependency canvas</summary>
      {shown ? (
        <Suspense fallback={<p role="status">Loading canvas…</p>}>
          <PlanCanvas parts={parts} names={names} {...(connect ? { connect } : {})} />
        </Suspense>
      ) : null}
    </details>
  );
}

export function PlanView(props: ItemViewProps) {
  const plan = props.read.plan;
  if (!plan) return <p role="alert">Plan details are unavailable.</p>;
  return <PlanContent {...props} plan={plan} />;
}

function PlanContent({ data, access, read, live, showOwnerTools, plan }: ItemViewProps & { plan: AppPlan }) {
  const meta = metaOf(read);
  const forecast = useQuery({
    queryKey: ["plan-forecast", meta.itemUuid, meta.role, plan.revision],
    queryFn: () => data.planForecast(access),
    refetchInterval: 30_000,
  });
  const result = forecast.data;
  const names = new Map(recentItems().map((item) => [item.itemUuid, item.name]));
  return (
    <article aria-labelledby="item-name" className="item">
      <ItemHeader data={data} access={access} kind="plan" meta={meta} title={itemNameOf(read)} owner={showOwnerTools} />
      <section className="card" aria-label="Overall forecast">
        <h2>{result?.median ? `Likely done ${dateLabel(result.median)}` : "Overall forecast"}</h2>
        {forecast.isPending ? <p>Loading forecast…</p> : null}
        <WriteError error={forecast.error} />
        {result ? (
          <>
            <p>{result.completedParts} of {result.requiredParts} required parts complete</p>
            {result.lower && result.upper ? <p>90% range {dateLabel(result.lower)} – {dateLabel(result.upper)}</p> : null}
            {result.deadlineProbability !== undefined && plan.deadline ? (
              <p>{Math.round(result.deadlineProbability * 100)}% chance by {dateLabel(plan.deadline)}</p>
            ) : null}
            {result.missingParts.length ? <p>Add evidence for {result.missingParts.length} more {result.missingParts.length === 1 ? "part" : "parts"}.</p> : null}
            {result.requiredParts > 0 ? <p className="small muted">Assumes each part’s estimate is independent.</p> : null}
          </>
        ) : null}
      </section>
      <section className="section" aria-label="Plan parts">
        <h2>Work and dependencies</h2>
        {plan.parts.length === 0 ? <p>No parts have been added yet.</p> : null}
        <ol>
          {plan.parts.map((part) => (
            <li key={part.itemUuid}>
              <PlanPartName access={access} item={part.itemUuid} />
              {part.required ? " · Required" : " · Optional"}
              {part.prerequisites.map((id) => (
                <span key={id}> · After <PlanPartName access={access} item={id} /></span>
              ))}
            </li>
          ))}
        </ol>
        {!showOwnerTools ? <DependencyCanvas parts={plan.parts} names={names} /> : null}
      </section>
      {showOwnerTools ? (
        <>
          <PlanEditor key={plan.revision} plan={plan} names={names} save={async (update) => {
            await data.updatePlan(access, update);
            live.refresh();
          }} />
          <details className="more section">
            <summary>Links, expiry and my items</summary>
            <div className="more__body">
              <KeepInMyItems data={data} access={access} kind="plan" meta={meta} />
              <LinksAndExpiry data={data} access={access} kind="plan" meta={meta} />
            </div>
          </details>
        </>
      ) : null}
    </article>
  );
}

function PlanPartName({ access, item }: { access: ItemAccess; item: string }) {
  const read = useItemRead(access, { item });
  return <span>{read.status === "ready" ? itemNameOf(read.data) : read.status === "loading" ? "Loading part…" : "Unavailable part"}</span>;
}

function PlanEditor({ plan, names, save }: {
  plan: AppPlan;
  names: Map<string, string>;
  save: (update: AppPlanUpdate) => Promise<void>;
}) {
  const [deadline, setDeadline] = useState(plan.deadline?.slice(0, 10) ?? "");
  const [parts, setParts] = useState<AppPlanUpdate["parts"]>(plan.parts);
  const update = useMutation({ mutationFn: save });
  const candidates = recentItems().flatMap((item) => {
    if (item.kind !== "counter" && item.kind !== "project") return [];
    if (parts.some((part) => part.itemUuid === item.itemUuid)) return [];
    const token = savedShareToken(item.itemUuid) ?? (item.role === "share" ? tokenFromPaste(item.path) : null);
    return token ? [{ ...item, token }] : [];
  });
  function connect(source: string, target: string) {
    if (source === target) return;
    setParts((current) => current.map((part) =>
      part.itemUuid === target && !part.prerequisites.includes(source)
        ? { ...part, prerequisites: [...part.prerequisites, source] }
        : part,
    ));
  }
  return (
    <form className="form section" onSubmit={(event) => {
      event.preventDefault();
      update.mutate({ expectedRevision: plan.revision, ...(deadline ? { deadline: new Date(`${deadline}T23:59:59Z`).toISOString() } : {}), parts });
    }}>
      <h2>Edit plan</h2>
      <label>Deadline <input type="date" value={deadline} onChange={(event) => { setDeadline(event.target.value); }} /></label>
      <label>
        Add recent work
        <select value="" onChange={(event) => {
          const item = candidates.find((candidate) => candidate.itemUuid === event.target.value);
          if (item) setParts([...parts, { itemUuid: item.itemUuid, required: true, prerequisites: [], linkToken: item.token }]);
        }}>
          <option value="">{candidates.length ? "Choose a counter or project" : "No recent shareable work"}</option>
          {candidates.map((item) => <option key={item.itemUuid} value={item.itemUuid}>{item.name}</option>)}
        </select>
      </label>
      <DependencyCanvas parts={parts} names={names} connect={connect} />
      {parts.map((part, index) => (
        <fieldset key={part.itemUuid}>
          <legend>{names.get(part.itemUuid) ?? `Part ${index + 1}`}</legend>
          <label>
            <input type="checkbox" checked={part.required} onChange={(event) => {
              setParts(parts.map((entry) => entry === part ? { ...entry, required: event.target.checked } : entry));
            }} />
            Required to finish the plan
          </label>
          {parts.filter((entry) => entry !== part).map((entry) => (
            <label key={entry.itemUuid}>
              <input type="checkbox" checked={part.prerequisites.includes(entry.itemUuid)} onChange={(event) => {
                const prerequisites = event.target.checked ? [...part.prerequisites, entry.itemUuid] : part.prerequisites.filter((id) => id !== entry.itemUuid);
                setParts(parts.map((other) => other === part ? { ...part, prerequisites } : other));
              }} />
              After {names.get(entry.itemUuid) ?? `part ${parts.indexOf(entry) + 1}`}
            </label>
          ))}
          <button type="button" className="button button--quiet" onClick={() => {
            setParts(parts.filter((entry) => entry !== part).map((entry) => ({
              ...entry, prerequisites: entry.prerequisites.filter((id) => id !== part.itemUuid),
            })));
          }}>Remove part</button>
        </fieldset>
      ))}
      <WriteError error={update.error} />
      <button type="submit" className="button button--primary" disabled={update.isPending}>Save plan</button>
    </form>
  );
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
