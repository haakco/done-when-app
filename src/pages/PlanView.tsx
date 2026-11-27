import { ConvergenceStory } from "@haakco/custd-react";
import type { AppItemRead, AppPlan, AppPlanUpdate } from "@haakco/custd-sdk/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { Link } from "react-router";
import { Field } from "../components/Field";
import { useSession } from "../components/Session";
import { ItemHeader } from "../components/ItemHeader";
import { WriteError } from "../components/ItemStates";
import { KeepInMyItems, LinksAndExpiry } from "../components/OwnerSettings";
import type { CreatedItem, DoneWhenData, ItemAccess, MyItem } from "../data";
import { projectOf, useCounter, useItemRead } from "../data/live";
import { itemKindOf, itemNameOf, metaOf } from "../data/mappers";
import { recentItems, rememberRecent, savedShareToken } from "../lib/device";
import { ownedItemPath, ownerPath, tokenFromPaste } from "../lib/links";
import { dateInputToRfc3339, formatShortDate } from "../lib/dates";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { LiveCounterChart } from "./CounterView";
import { PlanProgress } from "./PlanProgress";
import type { ItemViewProps } from "./view-props";

const PlanCanvas = lazy(() => import("./PlanCanvas"));

function DependencyCanvas({ parts, names, connect, inspect, access }: {
  parts: AppPlan["parts"];
  names: Map<string, string>;
  connect?: (source: string, target: string) => void;
  inspect?: (id: string) => void;
  access?: ItemAccess;
}) {
  const [shown, setShown] = useState(false);
  if (!parts.length) return null;
  return (
    <details className="more" onToggle={(event) => { setShown(event.currentTarget.open); }}>
      <summary>Dependency canvas</summary>
      {shown ? (
        <Suspense fallback={<p role="status">Loading canvas…</p>}>
          <PlanCanvas parts={parts} names={names} {...(connect ? { connect } : {})} {...(inspect ? { inspect } : {})} {...(access ? { labelFor: (id) => <PlanPartName access={access} item={id} /> } : {})} />
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
  const [selected, setSelected] = useState<string | null>(null);
  function inspect(id: string) {
    setSelected(id);
    const detail = document.getElementById(`plan-part-${id}`);
    detail?.scrollIntoView({ block: "nearest" });
    detail?.querySelector("summary")?.focus();
  }
  const forecast = useQuery({
    queryKey: ["plan-forecast", meta.itemUuid, meta.role, plan.revision],
    queryFn: () => data.planForecast(access),
    refetchInterval: 30_000,
  });
  const result = forecast.data;
  const recent = recentItems();
  const names = new Map(recent.map((item) => [item.itemUuid, item.name]));
  const session = useSession();
  const account = useQuery({ queryKey: ["my-items"], queryFn: () => data.listMyItems(), enabled: showOwnerTools && session.signedIn });
  const owned = session.signedIn ? account.data ?? [] : [];
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
            {result.previousMedian && result.median && dateLabel(result.previousMedian) !== dateLabel(result.median) ? (
              <p className="small">Likely finish moved {result.median < result.previousMedian ? "earlier" : "later"}. Previous likely finish was {dateLabel(result.previousMedian)}.</p>
            ) : null}
            {result.lower && result.upper ? <p>90% range {dateLabel(result.lower)} – {dateLabel(result.upper)}</p> : null}
            {result.deadlineProbability !== undefined && plan.deadline ? (
              <p>{Math.round(result.deadlineProbability * 100)}% chance by {dateLabel(plan.deadline)}</p>
            ) : null}
            {result.missingParts.length > 0 ? (
              <div className="notice">
                <p>{result.missingParts.length} {result.missingParts.length === 1 ? "part needs" : "parts need"} more forecast evidence</p>
                <ul>
                  {result.missingParts.map((id) => (
                    <li key={id}><a href={`#plan-part-${id}`} onClick={(event) => { event.preventDefault(); inspect(id); }}><PlanPartName access={access} item={id} /></a></li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.horizonMissFraction !== undefined && result.horizonMissFraction > 0 ? (
              <p>{Math.round(result.horizonMissFraction * 100)}% of trials did not finish by {dateLabel(result.horizon)}.</p>
            ) : null}
            <PlanProgress forecast={result} deadline={plan.deadline} />
            {result.requiredParts > 0 ? (
              <p className="small muted">
                Forecast as of <time dateTime={result.asOf}>{dateLabel(result.asOf)}</time>. Assumes each part’s estimate is independent. <a href="/help/forecasting#plans">How plan forecasts work</a>.
              </p>
            ) : null}
          </>
        ) : null}
      </section>
      <section className="section" aria-label="Plan parts">
        <h2>Work and dependencies</h2>
        {plan.parts.length === 0 ? <p>No parts have been added yet.</p> : null}
        <ol>
          {plan.parts.map((part) => (
            <li key={part.itemUuid}>
              <PlanPartDetail access={access} item={part.itemUuid} open={selected === part.itemUuid}
                owned={showOwnerTools && owned.some((item) => item.itemUuid === part.itemUuid)}
                ownerLink={showOwnerTools ? recent.find((item) => item.itemUuid === part.itemUuid && item.role === "owner")?.path : undefined}
                onToggle={(open) => { setSelected((current) => open ? part.itemUuid : current === part.itemUuid ? null : current); }} />
              {part.required ? " · Required" : " · Optional"}
              {part.prerequisites.map((id) => (
                <span key={id}> · After <PlanPartName access={access} item={id} /></span>
              ))}
            </li>
          ))}
        </ol>
        {!showOwnerTools ? <DependencyCanvas parts={plan.parts} names={names} inspect={inspect} access={access} /> : null}
      </section>
      {read.planMeetingSummaries?.length ? (
        <section className="section" aria-labelledby="plan-meeting-updates">
          <h2 id="plan-meeting-updates">Meeting updates</h2>
          <ul className="item-list">
            {read.planMeetingSummaries.map((meeting) => (
              <li className="card" key={meeting.meetingUuid}>
                <h3>{meeting.name}</h3>
                <p>{meeting.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {showOwnerTools ? (
        <>
          <PlanEditor key={plan.revision} plan={plan} names={names} inspect={inspect} data={data} access={access} account={{ items: owned, enabled: session.signedIn, pending: account.isPending, error: account.error }} save={async (update) => {
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

function PlanPartDetail({ access, item, open, onToggle, owned, ownerLink }: {
  access: ItemAccess;
  item: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  owned: boolean;
  ownerLink: string | undefined;
}) {
  const read = useItemRead(access, { item });
  const value = read.status === "ready" ? read.data : null;
  const name = value ? itemNameOf(value) : read.status === "error" ? "Unavailable part" : "Loading part…";
  const kind = value && itemKindOf(value) === "counter" ? "counter" : "project";
  const edit = owned ? ownedItemPath(kind, item) : ownerLink;
  return (
    <details className="more" id={`plan-part-${item}`} open={open} onToggle={(event) => { onToggle(event.currentTarget.open); }}>
      <summary>{name}</summary>
      {open && value ? (
        <>
          <PartForecast access={access} item={item} read={value} />
          {edit ? <p><Link to={edit}>{kind === "counter" ? "Open counter to add measurements" : "Open project to add an estimate"}</Link></p> : null}
        </>
      ) : null}
    </details>
  );
}

function PartForecast({ access, item, read }: { access: ItemAccess; item: string; read: AppItemRead }) {
  if (itemKindOf(read) === "counter") return <CounterPartForecast access={access} item={item} read={read} />;
  const project = projectOf(read);
  return (
    <ConvergenceStory estimates={project.estimates} title={`${project.name}: estimates over time`}
      formatDate={formatShortDate} {...(project.deliveryTarget ? { targetDate: project.deliveryTarget } : {})}
      labels={{ empty: "The chart appears after the first estimate." }} />
  );
}

function CounterPartForecast({ access, item, read }: { access: ItemAccess; item: string; read: AppItemRead }) {
  const counter = useCounter(access, read, { item });
  if (counter.status === "loading") return <p role="status">Loading measurements…</p>;
  if (counter.status === "error") return <WriteError error={counter.error} />;
  return <LiveCounterChart counter={counter.data} hideForecast={false} />;
}

function PlanEditor({ plan, names, inspect, data, access, account, save }: {
  plan: AppPlan;
  names: Map<string, string>;
  inspect: (id: string) => void;
  data: DoneWhenData;
  access: ItemAccess;
  account: { items: MyItem[]; enabled: boolean; pending: boolean; error: Error | null };
  save: (update: AppPlanUpdate) => Promise<void>;
}) {
  const [deadline, setDeadline] = useState(plan.deadline?.slice(0, 10) ?? "");
  const [parts, setParts] = useState<AppPlanUpdate["parts"]>(plan.parts);
  const [pasted, setPasted] = useState("");
  const [addedNames, setAddedNames] = useState(new Map<string, string>());
  const client = useQueryClient();
  const partNames = new Map([...names, ...account.items.map((item) => [item.itemUuid, item.name] as const), ...addedNames]);
  function addPart(id: string, name: string, linkToken?: string) {
    setParts((current) => current.some((part) => part.itemUuid === id)
      ? current
      : [...current, { itemUuid: id, required: true, prerequisites: [], ...(linkToken ? { linkToken } : {}) }]);
    setAddedNames((current) => new Map(current).set(id, name));
  }
  const update = useMutation({ mutationFn: save });
  const addLink = useMutation({
    mutationFn: () => data.readPlanPart(pasted),
    onSuccess: ({ item, token }) => {
      addPart(item.item.itemUuid, itemNameOf(item), token);
      setPasted("");
    },
  });
  const candidates = recentItems().flatMap((item) => {
    if (item.kind !== "counter" && item.kind !== "project") return [];
    if (parts.some((part) => part.itemUuid === item.itemUuid)) return [];
    const token = savedShareToken(item.itemUuid) ?? (item.role === "share" ? tokenFromPaste(item.path) : null);
    return token ? [{ ...item, token }] : [];
  });
  const ownedCandidates = account.items.filter((item) =>
    item.kind === "item" && !parts.some((part) => part.itemUuid === item.itemUuid),
  );
  function connect(source: string, target: string) {
    if (source === target) return;
    setParts((current) => current.map((part) =>
      part.itemUuid === target && !part.prerequisites.includes(source)
        ? { ...part, prerequisites: [...part.prerequisites, source] }
        : part,
    ));
  }
  return (
    <section className="section" aria-labelledby="edit-plan-heading">
      <h2 id="edit-plan-heading">Edit plan</h2>
      <details className="more" open={plan.parts.length === 0}>
        <summary>Create a project estimate for this plan</summary>
        <NewPlanPart data={data} added={(created, name) => {
          addPart(created.itemUuid, name, created.shareToken);
          void client.invalidateQueries({ queryKey: ["my-items"] });
        }} />
      </details>
      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        update.mutate({ expectedRevision: plan.revision, ...(deadline ? { deadline: new Date(`${deadline}T23:59:59Z`).toISOString() } : {}), parts });
      }}>
        {account.enabled ? (
          <>
            <label>
              Add from My items
              <select value="" disabled={account.pending} onChange={(event) => {
                const item = ownedCandidates.find((candidate) => candidate.itemUuid === event.target.value);
                if (item) addPart(item.itemUuid, item.name);
              }}>
                <option value="">{account.pending ? "Loading My items…" : ownedCandidates.length ? "Choose a counter or project" : "No account work to add"}</option>
                {ownedCandidates.map((item) => <option key={item.itemUuid} value={item.itemUuid}>{item.name}</option>)}
              </select>
            </label>
            <WriteError error={account.error} />
          </>
        ) : null}
        <label>Deadline <input type="date" value={deadline} onChange={(event) => { setDeadline(event.target.value); }} /></label>
        <label>
          Add recent work
          <select value="" onChange={(event) => {
            const item = candidates.find((candidate) => candidate.itemUuid === event.target.value);
            if (item) addPart(item.itemUuid, item.name, item.token);
          }}>
            <option value="">{candidates.length ? "Choose a counter or project" : "No recent shareable work"}</option>
            {candidates.map((item) => <option key={item.itemUuid} value={item.itemUuid}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Or paste a work link
          <input inputMode="url" value={pasted} onChange={(event) => { setPasted(event.target.value); }} />
        </label>
        <button type="button" className="button" disabled={addLink.isPending || !pasted.trim()} onClick={() => { addLink.mutate(); }}>
          Add linked work
        </button>
        <WriteError error={addLink.error} />
        <DependencyCanvas parts={parts} names={partNames} connect={connect} inspect={inspect} />
        {parts.map((part) => (
          <fieldset key={part.itemUuid}>
            <legend>{partNames.get(part.itemUuid) ?? <PlanPartName access={access} item={part.itemUuid} />}</legend>
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
                After {partNames.get(entry.itemUuid) ?? <PlanPartName access={access} item={entry.itemUuid} />}
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
    </section>
  );
}

function NewPlanPart({ data, added }: { data: DoneWhenData; added: (item: CreatedItem, name: string) => void }) {
  const [name, setName] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [created, setCreated] = useState<CreatedItem | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      const project = created ?? await data.createProject({
        name: name.trim(), expiresAfterSeconds: DEFAULT_EXPIRY_SECONDS,
      });
      if (!created) {
        setCreated(project);
        rememberRecent({ itemUuid: project.itemUuid, kind: "project", role: "owner", name: name.trim(), path: ownerPath("project", project.ownerToken), openedAt: new Date().toISOString() });
      }
      await data.addEstimate(project.ownerToken, { low: dateInputToRfc3339(low), high: dateInputToRfc3339(high), note: "" });
      return project;
    },
    onSuccess: (project) => {
      added(project, name.trim());
      setCreated(null);
      setName("");
      setLow("");
      setHigh("");
    },
  });
  return (
    <form className="form more__body" onSubmit={(event) => {
      event.preventDefault();
      if (name.trim() && low && high >= low) create.mutate();
    }}>
      <Field label="Part name">
        {(control) => <input {...control} required maxLength={255} value={name} readOnly={created !== null} onChange={(event) => { setName(event.target.value); }} />}
      </Field>
      <div className="field-row">
        <Field label="Earliest finish">
          {(control) => <input {...control} required type="date" value={low} onChange={(event) => { setLow(event.target.value); }} />}
        </Field>
        <Field label="Latest finish">
          {(control) => <input {...control} required type="date" min={low} value={high} onChange={(event) => { setHigh(event.target.value); }} />}
        </Field>
      </div>
      <WriteError error={create.error} />
      <button type="submit" className="button" disabled={create.isPending || !name.trim() || !low || high < low}>
        {create.isPending ? "Adding estimate…" : created ? "Retry adding estimate" : "Create project estimate"}
      </button>
    </form>
  );
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
