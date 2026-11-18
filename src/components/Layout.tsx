import { NavLink, Outlet } from "react-router";
import { useSession } from "./Session";

export function Layout() {
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
