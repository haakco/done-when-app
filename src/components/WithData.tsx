import type { ReactNode } from "react";
import { useDoneWhen, type DoneWhenState } from "../data";
import { Loading, ServiceUnavailable } from "./ItemStates";

type Ready = Extract<DoneWhenState, { status: "ready" }>;

/** Renders its children once the app's data service is ready, or says why it is not. */
export function WithData({ children }: { children: (ready: Ready) => ReactNode }) {
  const state = useDoneWhen();
  if (state.status === "loading") return <Loading what="Done When" />;
  if (state.status === "unavailable") return <ServiceUnavailable />;
  return children(state);
}
