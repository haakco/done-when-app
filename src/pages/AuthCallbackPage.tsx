import { Link } from "react-router";
import { useSession } from "../components/Session";

/** The sign-in redirect lands here; the hosted app provider finishes it and returns to the page it started on. */
export function AuthCallbackPage() {
  const session = useSession();
  if (session.failure) {
    return (
      <div className="notice notice--error" role="alert">
        <h1>Sign-in did not finish</h1>
        <p>{session.failure}</p>
        <Link className="button" to="/mine">
          Back to My items
        </Link>
      </div>
    );
  }
  return (
    <p role="status" className="muted">
      Signing you in…
    </p>
  );
}
