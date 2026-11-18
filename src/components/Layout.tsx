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
  return (
    <li>
      {session.signedIn ? (
        <button type="button" className="link-button" onClick={session.signOut}>
          Sign out
        </button>
      ) : (
        <button type="button" className="link-button" disabled={session.pending} onClick={() => { session.signIn(); }}>
          Sign in
        </button>
      )}
    </li>
  );
}
