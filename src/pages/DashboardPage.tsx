import { useState } from "react";
import { Link, useParams } from "react-router";
import { Field } from "../components/Field";
import { LinksPanel } from "../components/LinksPanel";
import { QueryState } from "../components/QueryState";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { data, type Access, type Dashboard, type ItemView } from "../data";
import { useDashboard, useItemMutation } from "../data/queries";
import { itemPath } from "../lib/links";

export function DashboardPage({ mode }: { mode: Access }) {
  const { token = "" } = useParams();
  const query = useDashboard(token);
  return (
    <QueryState query={query} what="dashboard">
      {(view) => <DashboardView view={view} token={token} mode={mode} />}
    </QueryState>
  );
}

function DashboardView({ view, token, mode }: { view: ItemView<Dashboard>; token: string; mode: Access }) {
  const owner = mode === "owner" && view.access === "owner";
  const remove = useItemMutation("dashboard", token, (shareToken: string) => data.removeDashboardEntry(token, shareToken));
  const { entries } = view.item;
  return (
    <article aria-labelledby="dashboard-name">
      <h1 id="dashboard-name">{view.item.name}</h1>
      {entries.length === 0 ? <p className="muted">Nothing here yet.</p> : null}
      <ul className="card-grid">
        {entries.map((entry) => (
          <li key={entry.shareToken} className="card">
            <h2>
              <Link to={itemPath(entry.kind, "share", entry.shareToken)}>{entry.name}</Link>
            </h2>
            <p className="small muted">{entry.kind === "counter" ? "Counter" : "Project"}</p>
            <p className="numeric">{entry.summary}</p>
            {owner ? (
              <button type="button" className="button button--quiet" disabled={remove.isPending} onClick={() => { remove.mutate(entry.shareToken); }}>
                Remove {entry.name}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {remove.error ? <p className="field__error">{remove.error.message}</p> : null}
      {mode === "owner" && view.access === "share" ? <ReadOnlyNotice /> : null}
      {owner && view.links !== null ? (
        <>
          <AddEntryForm token={token} />
          <LinksPanel kind="dashboard" links={view.links} />
        </>
      ) : null}
    </article>
  );
}

function AddEntryForm({ token }: { token: string }) {
  const [ref, setRef] = useState("");
  const add = useItemMutation("dashboard", token, (entryRef: string) => data.addDashboardEntry(token, entryRef));
  return (
    <section className="section card" aria-labelledby="add-entry-heading">
      <h2 id="add-entry-heading">Add a counter or project</h2>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate(ref, { onSuccess: () => { setRef(""); } });
        }}
      >
        <Field label="Link or token" hint="Paste a share link, an owner link or a token." error={add.error?.message ?? null}>
          {(control) => <input {...control} required value={ref} onChange={(event) => { setRef(event.target.value); }} />}
        </Field>
        <div className="button-row">
          <button type="submit" className="button button--primary" disabled={add.isPending}>
            Add to dashboard
          </button>
        </div>
      </form>
    </section>
  );
}
