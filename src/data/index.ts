import type { BrowserSignIn } from "@haakco/custd-sdk";
import { HOSTED_APP_STATUSES, type HostedApp } from "@haakco/custd-sdk/browser";
import { CUSTD_HOSTED_APP_LOADING, useCustdHostedApp } from "@haakco/custd-react";
import { useMemo } from "react";
import { createDoneWhenData, type DoneWhenData } from "./source";

export { explainError, isGone, isStaleMeetingStep, FORECAST_MIN_MEASUREMENTS, type DoneWhenData } from "./source";
export type * from "./types";

export type DoneWhenState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; data: DoneWhenData; signIn: BrowserSignIn | null; app: HostedApp };

const CUSTOM_EVENT = "custom-event";

function dataFor(app: HostedApp): DoneWhenData | null {
  return app.appItems ? createDoneWhenData(app.appItems, (event) => { void app.trackAppEvent(CUSTOM_EVENT, { name: event, tag: event }); }) : null;
}

/** The app's data, once the hosted app has read its discovery file. */
export function useDoneWhen(): DoneWhenState {
  const hosted = useCustdHostedApp();
  const app = hosted.status === HOSTED_APP_STATUSES.ready ? hosted.app : null;
  const data = useMemo(() => (app ? dataFor(app) : null), [app]);
  if (hosted.status === CUSTD_HOSTED_APP_LOADING) return { status: "loading" };
  if (!app || !data) return { status: "unavailable" };
  return { status: "ready", data, signIn: app.signIn ?? null, app };
}
