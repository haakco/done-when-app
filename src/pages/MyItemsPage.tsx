import { Link } from "react-router";
import { QueryState } from "../components/QueryState";
import { useMyItems, useSignInState } from "../data/queries";
import { formatDate } from "../lib/dates";
import { itemPath } from "../lib/links";

export function MyItemsPage() {
  const signIn = useSignInState();
  return (
    <>
      <h1>My items</h1>
      <QueryState query={signIn} what="sign-in state">
        {(state) => (state.status === "signed_in" ? <ItemList /> : <SignedOut />)}
      </QueryState>
    </>
  );
}

function SignedOut() {
  return (
    <div className="notice">
      <p>Sign in to keep your counters, projects and dashboards in one list and claim items you made by link.</p>
      <p className="small muted">Sign-in is coming soon. Until then, keep your owner links somewhere safe.</p>
    </div>
  );
}

function ItemList() {
  const items = useMyItems();
  return (
    <QueryState query={items} what="items">
      {(list) =>
        list.length === 0 ? (
          <p className="muted">
            Nothing yet. <Link to="/new/counter">Start a counter</Link>.
          </p>
        ) : (
          <ul className="item-list">
            {list.map((item) => (
              <li key={item.ownerToken} className="card">
                <Link to={itemPath(item.kind, "owner", item.ownerToken)}>{item.name}</Link>
                <span className="small muted">
                  {item.kind} · updated {formatDate(item.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}
