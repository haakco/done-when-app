import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router";
import { WriteError } from "../components/ItemStates";
import { KIND_LABEL, RecentList } from "../components/RecentList";
import { useSession } from "../components/Session";
import { WithData } from "../components/WithData";
import type { DoneWhenData } from "../data";
import { formatDate } from "../lib/dates";
import { ownedItemPath } from "../lib/links";

export function MyItemsPage() {
  return (
    <>
      <h1>My items</h1>
      <nav className="button-row" aria-label="Create workspace items">
        <Link className="button" to="/new/counter">New counter</Link>
        <Link className="button" to="/new/project">New project estimate</Link>
        <Link className="button" to="/new/meeting">New meeting</Link>
        <Link className="button" to="/new/plan">New plan</Link>
        <Link className="button" to="/new/model">New model</Link>
        <Link className="button" to="/new/dashboard">New dashboard</Link>
      </nav>
      <WithData>{({ data }) => <MyItems data={data} />}</WithData>
    </>
  );
}

function MyItems({ data }: { data: DoneWhenData }) {
  const session = useSession();
  if (!session.available) {
    return (
      <>
        <p className="notice">Sign-in is not turned on here. Keep your owner links somewhere safe: they are how you get back to your items.</p>
        <RecentList />
      </>
    );
  }
  if (!session.signedIn) {
    return (
      <div className="notice">
        <p>Sign in to keep your counters, projects, models, meetings and dashboards in one list. Items you make while signed in are added for you; open an owner link and choose &ldquo;Add to my items&rdquo; for older ones.</p>
        <button type="button" className="button button--primary" disabled={session.pending} onClick={() => { session.signIn("/mine"); }}>
          Sign in
        </button>
        {session.failure ? <p className="field__error" role="alert">{session.failure}</p> : null}
        <RecentList />
      </div>
    );
  }
  return <ItemList data={data} />;
}

function ItemList({ data }: { data: DoneWhenData }) {
  const items = useQuery({ queryKey: ["my-items"], queryFn: () => data.listMyItems() });
  const listed = useMemo(() => new Set((items.data ?? []).map((item) => item.itemUuid)), [items.data]);
  if (items.isPending) return <p role="status" className="muted">Loading your items…</p>;
  if (items.isError) return <WriteError error={items.error} />;
  return (
    <>
      {items.data.length === 0 ? (
        <p className="notice">
          No items in your account yet. Create one above, or open a recent item below and choose &ldquo;Add to my items&rdquo;.
        </p>
      ) : (
        <ul className="item-list">
          {items.data.map((item) => {
            const kind = item.kind === "item" ? "counter" : item.kind;
            return (
              <li key={item.itemUuid} className="card row-between">
                <Link to={ownedItemPath(kind, item.itemUuid)}>{item.name || KIND_LABEL[kind]}</Link>
                <span className="small muted">
                  {KIND_LABEL[kind]} · {item.status ? `${item.status} · ` : ""}updated {formatDate(item.updatedAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <RecentList heading={items.data.length === 0 ? "Recent on this device" : "Also opened on this device"} exclude={listed} />
    </>
  );
}
