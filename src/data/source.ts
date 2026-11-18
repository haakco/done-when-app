import {
  APP_ITEM_ERROR_CODES,
  APP_ITEM_KINDS,
  AppItemError,
  type AppItemRead,
  type AppItemsClient,
  type AppMeasurementBulkResponse,
} from "@haakco/custd-sdk/browser";
import { rememberShareToken } from "../lib/device";
import { tokenFromPaste } from "../lib/links";
import { ALERT_ERROR_CODES, type AlertDeliveryList, type AlertRule, type AlertRuleSpec, type AlertSettings, type AlertSubscription, type AlertsClient, type AlertWebhookCreated } from "./alerts";
import { counterCreateRequest, projectCreateRequest } from "./mappers";
import type {
  CounterDraft,
  CreatedItem,
  DashboardDraft,
  EstimateDraft,
  ForecastSettings,
  ItemAccess,
  Measurement,
  MeasurementsAdded,
  MyItem,
  ProjectDraft,
} from "./types";

/** A forecast needs this many measurements. */
export const FORECAST_MIN_MEASUREMENTS = 3;
/** Custd takes at most this many measurements per request. */
const MEASUREMENT_BATCH = 1000;

/**
 * Every write the app makes, and the reads that are not live. Live item reads go through the
 * SDK's self-refreshing hooks in `live.ts`. Each access is an owner link token, a share link
 * token, or `{ item }` for an item the signed-in user owns.
 */
export type DoneWhenData = {
  /** `rejected` counts start or history rows Custd refused. */
  createCounter(draft: CounterDraft, forecast: ForecastSettings): Promise<CreatedItem & { rejected: number }>;
  addMeasurements(owner: ItemAccess, rows: Measurement[], forecast: ForecastSettings, totalAfter: number): Promise<MeasurementsAdded>;
  setForecast(owner: ItemAccess, forecast: ForecastSettings): Promise<void>;
  setRunSimilar(owner: ItemAccess, similar: boolean): Promise<void>;
  reopenCounter(owner: ItemAccess): Promise<void>;

  createProject(draft: ProjectDraft): Promise<CreatedItem>;
  addEstimate(owner: ItemAccess, estimate: EstimateDraft): Promise<void>;
  setDeliveryTarget(owner: ItemAccess, deliveryTarget: string): Promise<void>;
  completeProject(owner: ItemAccess, completedAt: string): Promise<void>;
  cancelProject(owner: ItemAccess): Promise<void>;

  createDashboard(draft: DashboardDraft): Promise<CreatedItem>;
  addDashboardEntry(owner: ItemAccess, pasted: string): Promise<void>;
  removeDashboardEntry(owner: ItemAccess, entryUuid: string): Promise<void>;

  setExpiry(owner: ItemAccess, seconds: number): Promise<void>;
  /** Replaces the share link; the old one stops working. Returns the new token. */
  replaceShareLink(owner: ItemAccess, itemUuid: string, linkUuid: string): Promise<string>;
  claim(ownerToken: string): Promise<void>;
  listMyItems(): Promise<MyItem[]>;

  alertSettings(owner: ItemAccess): Promise<AlertSettings>;
  alertDeliveries(owner: ItemAccess): Promise<AlertDeliveryList>;
  addAlertRule(owner: ItemAccess, rule: AlertRuleSpec): Promise<AlertRule>;
  removeAlertRule(owner: ItemAccess, ruleUuid: string): Promise<void>;
  addWebhook(owner: ItemAccess, endpoint: string): Promise<AlertWebhookCreated>;
  removeWebhook(owner: ItemAccess, webhookUuid: string): Promise<void>;
  subscribeEmail(owner: ItemAccess): Promise<AlertSubscription>;
  unsubscribeEmail(owner: ItemAccess): Promise<void>;
};

export function createDoneWhenData(items: AppItemsClient, alerts: AlertsClient): DoneWhenData {
  const created = (kind: CreatedItem["kind"], result: { item: AppItemRead; ownerToken: string; shareToken: string }): CreatedItem => {
    rememberShareToken(result.item.item.itemUuid, result.shareToken);
    return { kind, itemUuid: result.item.item.itemUuid, ownerToken: result.ownerToken, shareToken: result.shareToken };
  };
  const runForecast = async (owner: ItemAccess, forecast: ForecastSettings) => {
    await items.runForecast(owner, { method: forecast.method, ...(forecast.forecastFrom ? { forecastFrom: forecast.forecastFrom } : {}) });
  };
  const addRows = async (owner: ItemAccess, rows: Measurement[]): Promise<MeasurementsAdded> => {
    const added: MeasurementsAdded = { accepted: 0, rejected: 0, targetReached: false };
    for (let start = 0; start < rows.length; start += MEASUREMENT_BATCH) {
      const batch = rows.slice(start, start + MEASUREMENT_BATCH);
      const response: AppMeasurementBulkResponse = await items.addMeasurements(owner, {
        rows: batch.map((row) => ({ observedAt: row.measuredAt, value: row.value })),
      });
      added.accepted += response.accepted;
      added.rejected += response.rejected;
      added.targetReached ||= response.completedTargetUuid !== undefined;
    }
    return added;
  };
  return {
    async createCounter(draft, forecast) {
      const result = await items.createItem(counterCreateRequest(draft));
      const rows = draft.history.length > 0 ? draft.history : [{ measuredAt: draft.startedAt, value: draft.startValue }];
      const added = await addRows(result.ownerToken, rows);
      if (added.accepted >= FORECAST_MIN_MEASUREMENTS) await runForecast(result.ownerToken, forecast);
      return { ...created("counter", result), rejected: added.rejected };
    },
    async addMeasurements(owner, rows, forecast, totalAfter) {
      const added = await addRows(owner, rows);
      if (added.accepted > 0 && totalAfter >= FORECAST_MIN_MEASUREMENTS) await runForecast(owner, forecast);
      return added;
    },
    async setForecast(owner, forecast) {
      await items.updateSettings(owner, { project: { forecastMethod: forecast.method } });
      await runForecast(owner, forecast);
    },
    async setRunSimilar(owner, similar) {
      await items.updateSettings(owner, { project: { runSimilar: similar } });
    },
    async reopenCounter(owner) {
      await items.reopen(owner);
    },

    async createProject(draft) {
      const result = await items.createItem(projectCreateRequest(draft));
      await items.updateSettings(result.ownerToken, {
        project: { definitionOfDone: draft.definitionOfDone, deliveryTargetDate: draft.deliveryTarget },
      });
      return created("project", result);
    },
    async addEstimate(owner, estimate) {
      await items.createEstimate(owner, { lowDate: estimate.low, highDate: estimate.high, ...(estimate.note ? { note: estimate.note } : {}) });
    },
    async setDeliveryTarget(owner, deliveryTarget) {
      await items.updateSettings(owner, { project: { deliveryTargetDate: deliveryTarget } });
    },
    async completeProject(owner, completedAt) {
      await items.complete(owner, { completedAt });
    },
    async cancelProject(owner) {
      await items.cancel(owner);
    },

    async createDashboard(draft) {
      const result = await items.createItem({ kind: APP_ITEM_KINDS.linkCollection, idleExpirySeconds: draft.expiresAfterSeconds });
      for (const pasted of draft.entryRefs) {
        await items.addEntry(result.ownerToken, { token: pastedToken(pasted) });
      }
      return created("dashboard", result);
    },
    async addDashboardEntry(owner, pasted) {
      await items.addEntry(owner, { token: pastedToken(pasted) });
    },
    async removeDashboardEntry(owner, entryUuid) {
      await items.removeEntry(owner, entryUuid);
    },

    async setExpiry(owner, seconds) {
      await items.updateSettings(owner, { idleExpirySeconds: seconds });
    },
    async replaceShareLink(owner, itemUuid, linkUuid) {
      const rotated = await items.rotateLink(owner, linkUuid);
      rememberShareToken(itemUuid, rotated.token);
      return rotated.token;
    },
    async claim(ownerToken) {
      await items.claim(ownerToken);
    },
    async listMyItems() {
      const list = await items.listMyItems();
      return (list.items ?? []).map((item) => ({
        itemUuid: item.itemUuid,
        kind: item.kind === APP_ITEM_KINDS.linkCollection ? "dashboard" : "item",
        name: item.name,
        status: item.status,
        updatedAt: item.updatedAt,
      }));
    },

    alertSettings: (owner) => alerts.settings(owner),
    alertDeliveries: (owner) => alerts.deliveries(owner),
    addAlertRule: (owner, rule) => alerts.addRule(owner, rule),
    removeAlertRule: (owner, ruleUuid) => alerts.removeRule(owner, ruleUuid),
    addWebhook: (owner, endpoint) => alerts.addWebhook(owner, endpoint),
    removeWebhook: (owner, webhookUuid) => alerts.removeWebhook(owner, webhookUuid),
    subscribeEmail: (owner) => alerts.subscribe(owner),
    unsubscribeEmail: (owner) => alerts.unsubscribe(owner),
  };
}

export class PastedLinkError extends Error {
  constructor() {
    super("That is not a Done When link. Paste a share link, an owner link or a token.");
    this.name = "PastedLinkError";
  }
}

function pastedToken(pasted: string): string {
  const token = tokenFromPaste(pasted);
  if (token === null) throw new PastedLinkError();
  return token;
}

const PLAIN_ERRORS: Record<string, string> = {
  [APP_ITEM_ERROR_CODES.network]: "Could not reach Done When. Check your connection and try again.",
  [APP_ITEM_ERROR_CODES.linkRefused]: "This link no longer works. It may have been replaced or the item expired.",
  [APP_ITEM_ERROR_CODES.notFound]: "This item is not here any more. It may have expired after a long time without updates.",
  [APP_ITEM_ERROR_CODES.readOnlyLink]: "This is a view-only link, so it cannot change anything. Use the owner link.",
  [APP_ITEM_ERROR_CODES.createLimited]: "Too many new items from here just now. Wait a minute and try again.",
  [APP_ITEM_ERROR_CODES.measurementLimit]: "This counter is full: it cannot take more measurements.",
  [APP_ITEM_ERROR_CODES.collectionFull]: "This dashboard is full. Remove an item to add another.",
  [APP_ITEM_ERROR_CODES.notCollectable]: "That link cannot go on a dashboard. Paste a counter or project link.",
  [APP_ITEM_ERROR_CODES.wrongKind]: "That link opens a different kind of item.",
  [APP_ITEM_ERROR_CODES.claimed]: "Someone else already keeps this item in their list.",
  [APP_ITEM_ERROR_CODES.userRefused]: "Your sign-in has ended. Sign in again.",
  [APP_ITEM_ERROR_CODES.signInRequired]: "Sign in first.",
  [APP_ITEM_ERROR_CODES.userCheckUnavailable]: "Sign-in could not be checked just now. Try again in a moment.",
  [APP_ITEM_ERROR_CODES.unavailable]: "Done When cannot reach its data service. Reload the page to try again.",
  [APP_ITEM_ERROR_CODES.keyRefused]: "Done When cannot reach its data service. Reload the page to try again.",
  [ALERT_ERROR_CODES.noVerifiedEmail]:
    "Verify your email address first: open the verification email from your sign-in, then come back and try again.",
  [ALERT_ERROR_CODES.emailCheckUnavailable]: "Your email address could not be checked just now. Try again in a moment.",
  [ALERT_ERROR_CODES.limit]: "This item has as many alerts as it can take. Remove one to add another.",
  [ALERT_ERROR_CODES.ruleInvalid]: "That alert setting is not valid. Check the number and try again.",
  [ALERT_ERROR_CODES.deliveryUnavailable]: "Alerts cannot be delivered just now. Try again later.",
};

/** Plain words for a failed call, saying what to do next. Never shows a token. */
export function explainError(error: unknown): string {
  if (error instanceof PastedLinkError) return error.message;
  if (error instanceof AppItemError) {
    const known = PLAIN_ERRORS[error.code];
    if (known) return known;
    if (error.code === APP_ITEM_ERROR_CODES.invalid || error.status === 400 || error.status === 422) {
      return error.problem?.detail ?? "Custd could not accept that. Check the values and try again.";
    }
    if (error.status === 429) return "Too many requests just now. Wait a moment and try again.";
  }
  return "Something went wrong. Try again in a moment.";
}

/** The link is gone for good: expired, revoked or never existed. */
export function isGone(error: unknown): boolean {
  return (
    error instanceof AppItemError &&
    (error.code === APP_ITEM_ERROR_CODES.notFound || error.code === APP_ITEM_ERROR_CODES.linkRefused || error.status === 404)
  );
}
