import type { AppItemRead } from "@haakco/custd-sdk/browser";
import type { DoneWhenData, ItemAccess } from "../data";
import type { LiveView } from "../data/live";

export type ItemViewProps = {
  data: DoneWhenData;
  access: ItemAccess;
  read: AppItemRead;
  live: Extract<LiveView<AppItemRead>, { status: "ready" }>;
  /** The owner link (or signed-in owner) opened the owner page. */
  showOwnerTools: boolean;
  /** The owner route was opened, perhaps with a share link. */
  ownerRoute: boolean;
};
