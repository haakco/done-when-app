import { useMemo, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { forgetRecent, recentItems, subscribeDevice } from "../lib/device";
import { formatDate } from "../lib/dates";

const KIND_LABEL = { counter: "Counter", project: "Project", model: "Model", meeting: "Meeting", dashboard: "Dashboard", plan: "Plan" } as const;

function snapshot(): string {
  return JSON.stringify(recentItems());
}

/** Items opened in this browser, newest first. Owner links stay on this device only. */
export function RecentList({ heading = "Recent on this device", exclude }: { heading?: string; exclude?: ReadonlySet<string> }) {
  const raw = useSyncExternalStore(subscribeDevice, snapshot, () => "[]");
  const items = useMemo(() => (JSON.parse(raw) as ReturnType<typeof recentItems>).filter((item) => !exclude?.has(item.itemUuid)), [raw, exclude]);
  if (items.length === 0) return null;
  return (
    <section className="section" aria-labelledby="recent-heading">
      <h2 id="recent-heading">{heading}</h2>
      <ul className="item-list">
        {items.map((item) => (
          <li key={item.itemUuid} className="card row-between">
            <Link to={item.path}>{item.name}</Link>
            <span className="small muted">
              {KIND_LABEL[item.kind]} · {item.role === "owner" ? "you can edit" : "view only"} · {formatDate(item.openedAt)}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="button button--quiet small" onClick={forgetRecent}>
        Clear this list
      </button>
    </section>
  );
}
