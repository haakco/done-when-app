import { DEMO_LINKS, placeholderData } from "./placeholder";
import type { DoneWhenData } from "./source";

export { ItemNotFoundError, ReadOnlyLinkError, type DoneWhenData } from "./source";
export type * from "./types";

/** The one data source the app uses. Swap in the Custd SDK source here when the link routes ship. */
export const data: DoneWhenData = placeholderData;

/** Share tokens of the example items linked from the home page. */
export const exampleShareTokens = {
  counter: DEMO_LINKS.counter.shareToken,
  project: DEMO_LINKS.project.shareToken,
  dashboard: DEMO_LINKS.dashboard.shareToken,
} as const;
