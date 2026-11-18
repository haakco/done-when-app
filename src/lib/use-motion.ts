import { useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";

const REDUCED = "(prefers-reduced-motion: reduce)";

// jsdom and very old browsers have no matchMedia; motion then stays on.
const hasMatchMedia = () => typeof globalThis.matchMedia === "function";

function subscribe(listener: () => void): () => void {
  if (!hasMatchMedia()) return () => undefined;
  const media = globalThis.matchMedia(REDUCED);
  media.addEventListener("change", listener);
  return () => {
    media.removeEventListener("change", listener);
  };
}

/** True when the reader asked for less motion; then nothing moves on its own. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => hasMatchMedia() && globalThis.matchMedia(REDUCED).matches, () => true);
}

export const TV_PARAM = "tv";

/** `?tv=1`: the big-screen view for an office TV, with no controls. */
export function useTvMode(): boolean {
  const [params] = useSearchParams();
  return params.get(TV_PARAM) === "1";
}
