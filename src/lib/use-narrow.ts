import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 30rem)";

function subscribe(listener: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", listener);
  return () => {
    media.removeEventListener("change", listener);
  };
}

/** True on phone-width screens, where charts draw at a smaller size so their labels stay readable. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
