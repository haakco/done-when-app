import { CustdAccountMenuItem } from "@haakco/custd-react";
import { NavLink, Outlet, useLocation } from "react-router";
import { TV_PARAM, useTvMode } from "../lib/use-motion";
import { CelebrationsToggle } from "./Moments";
import { useSession } from "./Session";

export function Layout() {
  const tv = useTvMode();
  if (tv) return <BigScreenLayout />;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <NavLink className="wordmark" to="/">
            Done When<span className="wordmark__tick">?</span>
          </NavLink>
          <nav className="site-nav" aria-label="Main">
            <ul>
              <li>
                <NavLink to="/new/counter">New counter</NavLink>
              </li>
              <li>
                <NavLink to="/new/project">New project</NavLink>
              </li>
              <li>
                <NavLink to="/mine">My items</NavLink>
              </li>
              <li>
                <NavLink to="/api">API</NavLink>
              </li>
              <AccountLink />
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" className="page" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <CelebrationsToggle />
      </footer>
    </>
  );
}

/** `?tv=1`: no header, footer or controls; one link appears only when focused, to leave. */
function BigScreenLayout() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.delete(TV_PARAM);
  const query = params.toString();
  return (
    <>
      <a className="tv-exit" href={`${location.pathname}${query ? `?${query}` : ""}${location.hash}`}>
        Leave big screen
      </a>
      <main id="main" className="page page--tv" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}

function AccountLink() {
  const session = useSession();
  if (!session.available) return null;
  if (!session.signedIn) {
    return (
      <li>
        <button type="button" className="link-button" disabled={session.pending} onClick={() => { session.signIn(); }}>
          Sign in
        </button>
      </li>
    );
  }
  return (
    <>
      {session.account && (
        <li>
          <CustdAccountMenuItem
            className="link-button"
            issuer={session.account.issuer}
            accessToken={session.account.accessToken}
            returnPath="/mine"
            onError={() => {
              // Still reach settings when the issuer refuses a ticket; only the link back is lost.
              if (session.account) window.location.assign(new URL("/settings", session.account.issuer));
            }}
          />
        </li>
      )}
      <li>
        <button type="button" className="link-button" onClick={session.signOut}>
          Sign out
        </button>
      </li>
    </>
  );
}
