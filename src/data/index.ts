import { placeholderData } from "./placeholder";
import type { DoneWhenData } from "./source";

export { ItemNotFoundError, ReadOnlyLinkError, type DoneWhenData } from "./source";
export type * from "./types";

/** The one data source the app uses. Swap in the Custd SDK source here when the link routes ship. */
export const data: DoneWhenData = placeholderData;
