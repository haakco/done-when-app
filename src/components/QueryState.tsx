import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ItemNotFoundError } from "../data";

type QueryStateProps<TData> = { query: UseQueryResult<TData>; what: string; children: (data: TData) => ReactNode };

/** Loading, not-found and error states for one item read, with a next action for each. */
export function QueryState<TData>({ query, what, children }: QueryStateProps<TData>) {
  if (query.isPending) {
    return <p role="status">Loading {what}…</p>;
  }
  if (query.isError) {
    if (query.error instanceof ItemNotFoundError) {
      return (
        <div className="notice notice--warn">
          <h1>This {what} is not here</h1>
          <p>The link may be mistyped, or the {what} expired after a long time without updates.</p>
          <Link to="/">Start a new one</Link>
        </div>
      );
    }
    return (
      <div className="notice notice--error" role="alert">
        <h1>Could not load this {what}</h1>
        <p>{query.error.message}</p>
        <button type="button" className="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  return children(query.data);
}
