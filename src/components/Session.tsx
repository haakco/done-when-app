import type { BrowserSignIn, SignInState } from "@haakco/custd-sdk";
import { SIGN_IN_STATUSES } from "@haakco/custd-sdk";
import { useCallback, useSyncExternalStore } from "react";
import { useDoneWhen } from "../data";

export type SessionView = {
  /** False when this app has sign-in turned off. */
  available: boolean;
  signedIn: boolean;
  pending: boolean;
  failed: boolean;
  signIn: (returnTo?: string) => void;
  signOut: () => void;
};

const SIGNED_OUT: SignInState = { status: SIGN_IN_STATUSES.signedOut };
const noSubscribe = () => () => {};

function here(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** The signed-in state, or a signed-out one when sign-in is unavailable. */
export function useSession(): SessionView {
  const state = useDoneWhen();
  const client: BrowserSignIn | null = state.status === "ready" ? state.signIn : null;
  const subscribe = useCallback((listener: () => void) => (client ? client.subscribe(listener) : noSubscribe()), [client]);
  const getState = useCallback(() => (client ? client.getState() : SIGNED_OUT), [client]);
  const signInState = useSyncExternalStore(subscribe, getState, getState);
  return {
    available: client !== null,
    signedIn: signInState.status === SIGN_IN_STATUSES.signedIn,
    pending: signInState.status === SIGN_IN_STATUSES.signingIn,
    failed: signInState.status === SIGN_IN_STATUSES.error,
    signIn: (returnTo) => {
      void client?.signIn({ returnTo: returnTo ?? here() }).catch(() => undefined);
    },
    signOut: () => {
      const result = client?.signOut();
      if (result?.endSessionUrl) window.location.assign(result.endSessionUrl);
    },
  };
}
