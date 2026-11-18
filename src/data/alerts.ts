// Alert settings for one item: Custd's /api/v1/app/item/alerts routes. The released SDK
// (custd-sdk v3.49.0) has no client for them yet, so this is the one place the app calls Custd
// without the SDK. It sends exactly the headers the SDK's AppItemsClient sends and fails with the
// SDK's AppItemError, so callers treat both alike. Move it into AppItemsClient and delete this.

import {
  APP_ITEM_ERROR_CODES,
  APP_ITEM_SITE_KEY_HEADER,
  APP_ITEM_USER_TOKEN_HEADER,
  type AppItemAccess,
  AppItemError,
  type AppProblem,
} from "@haakco/custd-sdk/browser";

export const ALERT_RULE_TYPES = {
  deadlineProbabilityBelow: "deadline_probability_below",
  targetReached: "target_reached",
  estimateStale: "estimate_stale",
  forecastMovedInsideTarget: "forecast_moved_inside_target",
} as const;

export type AlertRuleType = (typeof ALERT_RULE_TYPES)[keyof typeof ALERT_RULE_TYPES];

/** Problem codes of the alert routes. */
export const ALERT_ERROR_CODES = {
  noVerifiedEmail: "app_alert_no_verified_email",
  emailCheckUnavailable: "app_alert_email_check_unavailable",
  limit: "app_alert_limit",
  ruleInvalid: "app_alert_rule_invalid",
  deliveryUnavailable: "app_alert_delivery_unavailable",
} as const;

export type AlertRuleSpec = {
  type: AlertRuleType;
  /** Chance from 0 to 1 (exclusive); deadline_probability_below only. */
  threshold?: number;
  /** Days without a new estimate, 1 to 365; estimate_stale only. */
  staleDays?: number;
};

export type AlertRule = AlertRuleSpec & {
  ruleUuid: string;
  conditionMet: boolean;
  crossings: number;
  createdAt: string;
};

export type AlertWebhook = { webhookUuid: string; endpoint: string; createdAt: string };

export type AlertWebhookCreated = { webhook: AlertWebhook; signingSecret: string };

export type AlertSubscription = { subscriptionUuid: string; createdAt: string };

export type AlertSettings = {
  rules: AlertRule[] | null;
  webhooks: AlertWebhook[] | null;
  subscription?: AlertSubscription;
  /** Whether this deployment can deliver webhooks and email at all. */
  deliveryAvailable: boolean;
};

export type AlertDelivery = {
  deliveryUuid: string;
  ruleUuid: string;
  ruleType: AlertRuleType;
  crossing: number;
  channel: "webhook" | "email";
  webhookUuid?: string;
  outcome: "pending" | "sent" | "failed";
  attempts: number;
  lastErrorClass?: string;
  lastStatusCode?: number;
  createdAt: string;
  updatedAt: string;
};

export type AlertDeliveryList = { deliveries: AlertDelivery[] | null };

export type AlertsClientConfig = {
  apiBaseUrl: string;
  siteKey: string;
  fetch?: typeof fetch;
  userToken?: () => string | undefined;
};

const ALERTS_PATH = "/api/v1/app/item/alerts";

export class AlertsClient {
  private readonly baseUrl: string;

  constructor(private readonly config: AlertsClientConfig) {
    this.baseUrl = config.apiBaseUrl.replace(/\/+$/, "");
  }

  settings(access: AppItemAccess): Promise<AlertSettings> {
    return this.send<AlertSettings>(access, "GET", "");
  }

  deliveries(access: AppItemAccess): Promise<AlertDeliveryList> {
    return this.send<AlertDeliveryList>(access, "GET", "/deliveries");
  }

  addRule(access: AppItemAccess, rule: AlertRuleSpec): Promise<AlertRule> {
    return this.send<AlertRule>(access, "POST", "/rules", rule);
  }

  async removeRule(access: AppItemAccess, ruleUuid: string): Promise<void> {
    await this.send<null>(access, "DELETE", `/rules/${encodeURIComponent(ruleUuid)}`);
  }

  addWebhook(access: AppItemAccess, endpoint: string): Promise<AlertWebhookCreated> {
    return this.send<AlertWebhookCreated>(access, "POST", "/webhooks", { endpoint });
  }

  async removeWebhook(access: AppItemAccess, webhookUuid: string): Promise<void> {
    await this.send<null>(access, "DELETE", `/webhooks/${encodeURIComponent(webhookUuid)}`);
  }

  /** Emails the signed-in user's verified address when a rule fires. */
  subscribe(access: AppItemAccess): Promise<AlertSubscription> {
    return this.send<AlertSubscription>(access, "PUT", "/subscription");
  }

  async unsubscribe(access: AppItemAccess): Promise<void> {
    await this.send<null>(access, "DELETE", "/subscription");
  }

  private async send<T>(access: AppItemAccess, method: string, suffix: string, body?: unknown): Promise<T> {
    const url = new URL(`${this.baseUrl}${ALERTS_PATH}${suffix}`);
    const headers: Record<string, string> = { [APP_ITEM_SITE_KEY_HEADER]: this.config.siteKey };
    if (typeof access === "string") headers.Authorization = `Bearer ${access}`;
    else url.searchParams.set("item", access.item);
    const userToken = this.config.userToken?.();
    if (userToken) headers[APP_ITEM_USER_TOKEN_HEADER] = userToken;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const fetchImpl = this.config.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers,
        body: body === undefined ? null : JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new AppItemError(null, APP_ITEM_ERROR_CODES.network);
    }
    if (!response.ok) {
      const problem = (await response.json().catch(() => undefined)) as AppProblem | undefined;
      throw new AppItemError(response.status, problem?.code ?? `http_${response.status}`, problem);
    }
    return (response.status === 204 ? null : await response.json()) as T;
  }
}
