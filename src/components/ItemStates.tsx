import { Link } from "react-router";
import { explainError, isGone } from "../data";

export function Loading({ what }: { what: string }) {
  return (
    <p role="status" className="muted">
      Loading {what}…
    </p>
  );
}

/** A failed item read: gone for good, or a retryable failure with the next step. */
export function ItemFailed({ error, what, retry }: { error: unknown; what: string; retry?: () => void }) {
  if (isGone(error)) {
    return (
      <div className="notice notice--warn">
        <h1>This {what} is not here</h1>
        <p>The link may be mistyped or replaced, or it expired after a long time without updates.</p>
        <Link className="button button--primary" to="/">
          Start a new one
        </Link>
      </div>
    );
  }
  return (
    <div className="notice notice--error" role="alert">
      <h1>Could not load this {what}</h1>
      <p>{explainError(error)}</p>
      {retry ? (
        <button type="button" className="button" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function ServiceUnavailable() {
  return (
    <div className="notice notice--error" role="alert">
      <h1>Done When cannot reach its data service</h1>
      <p>Check your connection, then reload the page.</p>
      <button type="button" className="button" onClick={() => { window.location.reload(); }}>
        Reload
      </button>
    </div>
  );
}

export function ReadOnlyNotice() {
  return (
    <p className="notice section">
      This is a view-only link: it shows everything but cannot change anything. Use the owner link to make changes.
    </p>
  );
}

export function WriteError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="field__error" role="alert">
      {explainError(error)}
    </p>
  );
}
