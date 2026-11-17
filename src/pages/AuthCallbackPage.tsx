import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { QueryState } from "../components/QueryState";
import { data } from "../data";

export function AuthCallbackPage() {
  const completion = useQuery({
    queryKey: ["sign-in-callback", window.location.href],
    queryFn: () => data.completeSignIn(window.location.href),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return (
    <QueryState query={completion} what="sign-in">
      {(result) =>
        result.status === "signed_in" ? (
          <Navigate to={result.returnTo} replace />
        ) : (
          <div className="notice notice--error" role="alert">
            <h1>Sign-in did not finish</h1>
            <p>{result.message}</p>
          </div>
        )
      }
    </QueryState>
  );
}
