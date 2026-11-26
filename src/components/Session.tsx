import type { BrowserSignIn, SignInState } from "@haakco/custd-sdk";
import { SIGN_IN_ERROR_CODES, SIGN_IN_STATUSES } from "@haakco/custd-sdk";
import { useCallback, useSyncExternalStore } from "react";
import { useDoneWhen } from "../data";

export type SessionView = {
  /** False when this app has sign-in turned off. */
  available: boolean;
  signedIn: boolean;
  pending: boolean;
  failure: string | null;
  /** What the account settings button needs; null when signed out or sign-in is off. */
  account: SessionAccount | null;
  signIn: (returnTo?: string) => void;
  signOut: () => void;
};

export type SessionAccount = {
  issuer: string;
  /** A current access token, refreshed first when it is about to expire. */
  accessToken: () => Promise<string>;
};

/** Refresh this long before expiry, so the issuer never receives a token that lapses in flight. */
const ACCESS_TOKEN_MARGIN_MS = 30_000;

const SIGNED_OUT: SignInState = { status: SIGN_IN_STATUSES.signedOut };
const noSubscribe = () => () => {};

function here(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function failureMessage(state: SignInState): string | null {
  if (state.status !== SIGN_IN_STATUSES.error) return null;
  switch (state.error.code) {
    case SIGN_IN_ERROR_CODES.issuerMismatch:
      return "Done When couldn’t verify its sign-in service. You can still open existing items from their links.";
    case SIGN_IN_ERROR_CODES.missingPendingSignIn:
    case SIGN_IN_ERROR_CODES.stateMismatch:
      return "Start sign-in again and finish it in the same browser tab.";
    default:
      return "Try signing in again from My items.";
  }
}

function sessionAccount(client: BrowserSignIn, issuer: string): SessionAccount {
  return {
    issuer,
    accessToken: async () => {
      const current = client.currentSession();
      if (current && current.expiresAtMs - ACCESS_TOKEN_MARGIN_MS > Date.now()) return current.accessToken;
      return (await client.refreshSession()).accessToken;
    },
  };
}

/** The signed-in state, or a signed-out one when sign-in is unavailable. */
export function useSession(): SessionView {
  const state = useDoneWhen();
  const client: BrowserSignIn | null = state.status === "ready" ? state.signIn : null;
  const subscribe = useCallback((listener: () => void) => (client ? client.subscribe(listener) : noSubscribe()), [client]);
  const getState = useCallback(() => (client ? client.getState() : SIGNED_OUT), [client]);
  const signInState = useSyncExternalStore(subscribe, getState, getState);
  const issuer = state.status === "ready" ? state.app.discovery.signIn?.issuer : undefined;
  return {
    available: client !== null,
    signedIn: signInState.status === SIGN_IN_STATUSES.signedIn,
    pending: signInState.status === SIGN_IN_STATUSES.signingIn,
    failure: failureMessage(signInState),
    account:
      client && issuer && signInState.status === SIGN_IN_STATUSES.signedIn ? sessionAccount(client, issuer) : null,
    signIn: (returnTo) => {
      void client?.signIn({ returnTo: returnTo ?? here() }).catch(() => undefined);
    },
    signOut: () => {
      const result = client?.signOut();
      if (result?.endSessionUrl) window.location.assign(result.endSessionUrl);
    },
  };
}
