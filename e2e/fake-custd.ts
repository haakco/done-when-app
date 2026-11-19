// An in-memory stand-in for the Custd routes Done When calls: the hosted app discovery file, the
// /api/v1/app/ item, forecast and alert routes, and a PKCE sign-in. Responses use the released
// SDK's DTO types, so a contract change breaks the build here first. One instance holds the state
// for every browser context of a test, so a change in one context shows in another.

import type {
  AppForecastRun,
  AppForecastStory,
  AppItem,
  AppItemCreateRequest,
  AppItemCreated,
  AppItemLink,
  AppItemRead,
  AppItemSummary,
  AppLinkCollectionEntry,
  AppMeasurementBulkResponse,
  AppMeeting,
  AppMeetingBlock,
  AppMeasurementProject,
  AppModelQuantity,
  AppModelQuantityResult,
  AppModelRun,
  AppUncertaintyModel,
  AppProjectEstimate,
  AppProjectEstimateList,
  HostedAppDiscovery,
} from "@haakco/custd-sdk/browser";
import type { AppMeetingMinutes, AppMeetingMinutesUpdate, AppPlan, AppPlanUpdate } from "@haakco/custd-sdk/browser";
import type { AppAlertDelivery, AppAlertRule, AppAlertRuleSpec, AppAlertSettings, AppAlertWebhook } from "@haakco/custd-sdk/browser";

export type FakeRequest = { method: string; url: string; headers: Record<string, string>; body: string | null };
export type FakeResponse = { status: number; headers: Record<string, string>; body?: string };

export const FAKE_SITE_KEY = "site_pk_fake";
export const FAKE_API_PATH = "/__custd";
const AUTH_PATH = "/__auth";
const DAY_MS = 86_400_000;
const DEFAULT_IDLE = 7 * 86_400;

type Link = AppItemLink & { token: string; itemUuid: string };

type Alerts = { rules: AppAlertRule[]; webhooks: AppAlertWebhook[]; subscribers: Set<string>; deliveries: AppAlertDelivery[] };

type Stored = {
  uuid: string;
  kind: AppItem["kind"];
  version: number;
  idleExpirySeconds: number;
  updatedAt: string;
  ownerUser: string | null;
  project?: AppMeasurementProject;
  plan?: AppPlan;
  meetingMinutes?: AppMeetingMinutes;
  model?: AppUncertaintyModel;
  meeting?: AppMeeting & { lastFinished: string | null };
  modelRuns: AppModelRun[];
  observations: { observedAt: string; value: number }[];
  estimates: AppProjectEstimate[];
  entries: AppLinkCollectionEntry[];
  runs: AppForecastRun[];
  alerts: Alerts;
};

type Caller = { item: Stored; role: "owner" | "share"; user: string | null; viaCollection: boolean };

class Problem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}): FakeResponse => ({
  status,
  headers: { "content-type": "application/json", ...extra },
  body: JSON.stringify(body),
});

/** `maxMeasurements` is the per-item cap; Custd's is 20,000. */
export type FakeCustdOptions = { origin: string; signedInUsersHaveVerifiedEmail?: boolean; maxMeasurements?: number };

export class FakeCustd {
  private readonly items = new Map<string, Stored>();
  private readonly links = new Map<string, Link>();
  private readonly codes = new Map<string, string>();
  private userCount = 0;
  /** Every request the fake answered, for assertions such as "no token in a URL". */
  readonly requests: FakeRequest[] = [];
  /** How far `advanceClock` has moved the fake's meeting clock past the real one. */
  private clockOffsetMs = 0;

  constructor(private readonly options: FakeCustdOptions) {}

  discovery(): HostedAppDiscovery {
    const { origin } = this.options;
    return {
      apiBaseUrl: `${origin}${FAKE_API_PATH}`,
      host: new URL(origin).host,
      siteUuid: "00000000-0000-4000-8000-000000000001",
      browserKey: FAKE_SITE_KEY,
      environment: "test",
      capabilities: ["app_data", "sign_in"],
      signIn: {
        issuer: origin,
        authorizationEndpoint: `${origin}${AUTH_PATH}/authorize`,
        tokenEndpoint: `${origin}${AUTH_PATH}/token`,
        clientId: "done-when-test",
        audience: "done-when",
        redirectUri: `${origin}/auth/callback`,
      },
    };
  }

  /** Moves the meeting clock on, as the browser clock is moved with `page.clock.fastForward`. */
  advanceClock(ms: number): void {
    this.clockOffsetMs += ms;
  }

  private now(): number {
    return Date.now() + this.clockOffsetMs;
  }

  handle(request: FakeRequest): FakeResponse {
    this.requests.push(request);
    const url = new URL(request.url);
    try {
      if (url.pathname === "/.well-known/custd.json") return json(200, this.discovery());
      if (url.pathname.startsWith(AUTH_PATH)) return this.auth(request, url);
      if (!url.pathname.startsWith(FAKE_API_PATH)) return json(404, { code: "not_found" });
      if (request.method === "OPTIONS") return { status: 204, headers: {} };
      if (request.headers["x-custd-site-key"] !== FAKE_SITE_KEY) throw new Problem(401, "app_key_refused");
      return this.route(request, url, url.pathname.slice(FAKE_API_PATH.length));
    } catch (error) {
      if (error instanceof Problem) return json(error.status, { status: error.status, code: error.code, title: error.code });
      throw error;
    }
  }

  // ---- Sign-in ----

  private auth(request: FakeRequest, url: URL): FakeResponse {
    if (url.pathname.endsWith("/authorize")) {
      const code = randomToken();
      this.userCount += 1;
      this.codes.set(code, `user-${this.userCount}`);
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      return { status: 302, headers: { location: back.toString() } };
    }
    const form = new URLSearchParams(request.body ?? "");
    const user = this.codes.get(form.get("code") ?? "") ?? form.get("refresh_token")?.replace(/^refresh-/, "");
    if (!user) return json(400, { error: "invalid_grant" });
    return json(200, { access_token: user, token_type: "Bearer", expires_in: 3600, refresh_token: `refresh-${user}`, scope: "openid profile offline_access" });
  }

  // ---- Routing ----

  private route(request: FakeRequest, url: URL, path: string): FakeResponse {
    const body = request.body ? (JSON.parse(request.body) as Record<string, unknown>) : {};
    const user = request.headers["x-custd-user-token"] ?? null;
    if (path === "/api/v1/app/items" && request.method === "POST") return json(201, this.create(body as AppItemCreateRequest, user));
    if (path === "/api/v1/app/items" && request.method === "GET") return json(200, { items: this.mine(user) });
    const caller = this.caller(request, url, user);
    const key = `${request.method} ${path}`;
    switch (key) {
      case "GET /api/v1/app/item":
        return this.conditional(request, `"${caller.item.version}"`, () => this.read(caller));
      case "PATCH /api/v1/app/item":
        return json(200, this.change(caller, () => { this.settings(caller.item, body); }));
      case "PATCH /api/v1/app/item/meeting/minutes":
        return json(200, this.change(caller, () => { this.updateMeetingMinutes(caller.item, body as AppMeetingMinutesUpdate); }));
      case "PATCH /api/v1/app/item/plan":
        return json(200, this.change(caller, () => { this.updatePlan(caller.item, body as AppPlanUpdate); }));
      case "GET /api/v1/app/item/plan/forecast": {
        const plan = caller.item.plan;
        if (!plan) throw new Problem(409, "app_item_wrong_kind");
        const requiredParts = plan.parts.filter((part) => part.required).length;
        return json(200, {
          revision: plan.revision, asOf: caller.item.updatedAt, horizon: "2036-11-19T00:00:00Z",
          model: "independent_finish_to_start_v1", requiredParts, completedParts: 0, missingParts: [],
          ...(requiredParts ? { median: "2026-12-05T00:00:00Z", previousMedian: "2026-12-08T00:00:00Z", deadlineProbability: 0.75 } : {}),
        });
      }
      case "POST /api/v1/app/item/claim":
        return json(200, this.claim(caller));
      case "POST /api/v1/app/item/measurements":
        return json(200, this.measure(caller, body.rows as { observedAt: string; value: number }[]));
      case "POST /api/v1/app/item/estimates":
        return json(201, this.estimate(caller, body as { estimatedAt?: string; lowDate: string; highDate: string; note?: string }));
      case "POST /api/v1/app/item/complete":
        return json(200, this.change(caller, () => { this.complete(caller.item, body.completedAt as string); }));
      case "POST /api/v1/app/item/cancel":
        return json(200, this.change(caller, () => { this.projectOf(caller.item).status = "canceled"; }));
      case "POST /api/v1/app/item/reopen":
        return json(200, this.change(caller, () => { this.reopen(caller.item); }));
      case "POST /api/v1/app/item/entries":
        return json(201, this.addEntry(caller, body.token as string));
      case "POST /api/v1/app/forecast/runs":
        return json(201, this.runForecast(caller, body));
      case "GET /api/v1/app/forecast/latest":
        return this.latest(request, caller);
      case "GET /api/v1/app/forecast/story":
        return this.conditional(request, `"${caller.item.version}"`, () => this.story(caller.item));
      case "POST /api/v1/app/item/model/versions":
        return json(201, this.change(caller, () => { this.saveVersion(caller.item, body.quantities as AppModelQuantity[], (body.note as string | undefined) ?? ""); }));
      case "POST /api/v1/app/models/runs":
        return json(201, this.runModel(caller, body.sensitivityOutput as string | undefined));
      case "GET /api/v1/app/models/latest": {
        const run = caller.item.modelRuns.at(-1);
        if (!run) throw new Problem(404, "app_model_run_missing");
        return this.conditional(request, `"model-run-${caller.item.modelRuns.length}"`, () => run);
      }
      case "POST /api/v1/app/item/meeting/start":
        return json(200, this.change(caller, () => { this.startMeeting(caller.item); }));
      case "POST /api/v1/app/item/meeting/advance":
        return json(200, this.advanceMeeting(caller, body.blockUuid as string));
      case "POST /api/v1/app/item/meeting/end":
        return json(200, this.change(caller, () => { this.endMeeting(caller.item); }));
      case "GET /api/v1/app/item/alerts":
        return json(200, this.alertSettings(this.owner(caller)));
      case "GET /api/v1/app/item/alerts/deliveries":
        return json(200, { deliveries: [...this.owner(caller).alerts.deliveries].reverse() });
      case "POST /api/v1/app/item/alerts/rules":
        return json(201, this.addRule(this.owner(caller), body as AppAlertRuleSpec));
      case "POST /api/v1/app/item/alerts/webhooks":
        return json(201, this.addWebhook(this.owner(caller), body.endpoint as string));
      case "PUT /api/v1/app/item/alerts/subscription":
        return json(200, this.subscribe(caller));
      case "DELETE /api/v1/app/item/alerts/subscription":
        this.owner(caller).alerts.subscribers.delete(caller.user ?? "");
        return { status: 204, headers: {} };
      default:
        return this.routeWithId(request, path, caller);
    }
  }

  private routeWithId(request: FakeRequest, path: string, caller: Caller): FakeResponse {
    const match = /^\/api\/v1\/app\/item\/(entries|links|alerts\/rules|alerts\/webhooks)\/([^/]+)(\/rotate)?$/.exec(path);
    if (!match) throw new Problem(404, "not_found");
    const [, collection, id, rotate] = match;
    const owned = this.owner(caller);
    if (collection === "links" && rotate && request.method === "POST") return json(200, this.rotate(owned, id ?? ""));
    if (request.method !== "DELETE") throw new Problem(405, "method_not_allowed");
    this.touch(owned);
    if (collection === "entries") owned.entries = owned.entries.filter((entry) => entry.entryUuid !== id);
    if (collection === "alerts/rules") owned.alerts.rules = owned.alerts.rules.filter((rule) => rule.ruleUuid !== id);
    if (collection === "alerts/webhooks") owned.alerts.webhooks = owned.alerts.webhooks.filter((hook) => hook.webhookUuid !== id);
    return { status: 204, headers: {} };
  }

  private conditional(request: FakeRequest, etag: string, body: () => unknown): FakeResponse {
    if (request.headers["if-none-match"] === etag) return { status: 304, headers: { etag } };
    return json(200, body(), { etag });
  }

  private caller(request: FakeRequest, url: URL, user: string | null): Caller {
    const bearer = request.headers.authorization?.replace(/^Bearer /, "");
    const itemParam = url.searchParams.get("item");
    if (bearer) {
      const link = this.links.get(bearer);
      const item = link ? this.items.get(link.itemUuid) : undefined;
      if (!link || !item) throw new Problem(401, "app_link_refused");
      if (itemParam && itemParam !== item.uuid) {
        const entry = item.entries.find((candidate) => candidate.itemUuid === itemParam);
        const included = entry || item.plan?.parts.some((part) => part.itemUuid === itemParam);
        const target = included ? this.items.get(itemParam) : undefined;
        if (!target) throw new Problem(404, "app_item_not_found");
        return { item: target, role: "share", user, viaCollection: true };
      }
      return { item, role: link.role, user, viaCollection: false };
    }
    if (!user) throw new Problem(401, "app_sign_in_required");
    const item = itemParam ? this.items.get(itemParam) : undefined;
    if (item?.ownerUser === user) return { item, role: "owner", user, viaCollection: false };
    const collection = [...this.items.values()].find(
      (candidate) => candidate.ownerUser === user && candidate.entries.some((entry) => entry.itemUuid === itemParam),
    );
    const entryItem = itemParam ? this.items.get(itemParam) : undefined;
    if (collection && entryItem) return { item: entryItem, role: "share", user, viaCollection: true };
    throw new Problem(404, "app_item_not_found");
  }

  private owner(caller: Caller): Stored {
    if (caller.role !== "owner") throw new Problem(403, "app_link_read_only");
    return caller.item;
  }

  private touch(item: Stored): void {
    item.version += 1;
    item.updatedAt = new Date().toISOString();
  }

  private change(caller: Caller, apply: () => void): AppItemRead {
    const item = this.owner(caller);
    apply();
    this.touch(item);
    return this.read(caller);
  }

  // ---- Items ----

  private create(request: AppItemCreateRequest, user: string | null): AppItemCreated {
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    const item: Stored = {
      uuid,
      kind: request.kind,
      version: 1,
      idleExpirySeconds: request.idleExpirySeconds ?? DEFAULT_IDLE,
      updatedAt: now,
      ownerUser: user,
      observations: [],
      estimates: [],
      entries: [],
      runs: [],
      modelRuns: [],
      alerts: { rules: [], webhooks: [], subscribers: new Set(), deliveries: [] },
    };
    if (request.kind === "plan") item.plan = { revision: 1, parts: [], ...(request.name ? { name: request.name } : {}) };
    if (request.kind === "uncertainty_model") {
      const create = request.uncertaintyModel;
      item.model = { modelUuid: crypto.randomUUID(), name: create.name, description: create.description ?? "", latestVersion: 0, createdAt: now, updatedAt: now };
      if (create.quantities) this.saveVersion(item, create.quantities, create.note ?? "");
    }
    if (request.kind === "meeting") {
      const blocks = request.meeting.blocks.map(
        (block, index): AppMeetingBlock => ({ blockUuid: crypto.randomUUID(), position: index + 1, title: block.title, status: "pending", predictedMs: block.predictedMs, allocatedMs: block.predictedMs, actualMs: 0 }),
      );
      item.meeting = { name: request.meeting.name, status: "ready", blocks, summary: emptySummary(), lastFinished: null };
    }
    if (request.kind === "measurement_project") {
      const create = request.measurementProject;
      item.project = {
        projectUuid: crypto.randomUUID(),
        projectCode: `app-${uuid.slice(0, 8)}`,
        kind: create.kind,
        status: "active",
        name: create.name,
        description: create.description ?? "",
        series: create.series.map((series) => ({ ...series, seriesUuid: crypto.randomUUID() })),
        target: { ...create.target, targetUuid: crypto.randomUUID() },
        delivery: { definitionOfDone: "" },
        run: { similar: true },
        createdAt: now,
        updatedAt: now,
      };
    }
    this.items.set(uuid, item);
    const ownerToken = this.issue(uuid, "owner");
    const shareToken = this.issue(uuid, "share");
    return { item: this.read({ item, role: "owner", user, viaCollection: false }), ownerToken, shareToken };
  }

  private issue(itemUuid: string, role: "owner" | "share"): string {
    const token = randomToken();
    this.links.set(token, { token, itemUuid, role, linkUuid: crypto.randomUUID(), createdAt: new Date().toISOString() });
    return token;
  }

  private rotate(item: Stored, linkUuid: string): { link: AppItemLink; token: string } {
    const old = [...this.links.values()].find((link) => link.itemUuid === item.uuid && link.linkUuid === linkUuid);
    if (!old) throw new Problem(404, "app_item_not_found");
    this.links.delete(old.token);
    const token = this.issue(item.uuid, old.role);
    const link = this.links.get(token);
    this.touch(item);
    return { link: { linkUuid: link?.linkUuid ?? "", role: old.role, createdAt: link?.createdAt ?? "" }, token };
  }

  private updateMeetingMinutes(item: Stored, request: AppMeetingMinutesUpdate): void {
    if (!item.meeting || request.expectedRevision !== item.version) throw new Problem(409, "app_plan_revision_conflict");
    if (request.planUuid) {
      const link = request.planLinkToken ? this.links.get(request.planLinkToken) : null;
      const plan = this.items.get(request.planUuid)?.plan;
      if (!plan || (link?.itemUuid !== request.planUuid && item.meetingMinutes?.planUuid !== request.planUuid)) {
        throw new Problem(404, "app_item_not_found");
      }
      for (const action of request.actions) {
        if (action.partUuid && !plan.parts.some((part) => part.itemUuid === action.partUuid)) {
          throw new Problem(404, "app_item_not_found");
        }
      }
    }
    const { minutes, decisions, actions, planUuid, sharedSummary } = request;
    item.meetingMinutes = { minutes, decisions, actions, ...(planUuid ? { planUuid } : {}), ...(sharedSummary ? { sharedSummary } : {}) };
  }

  private updatePlan(item: Stored, request: AppPlanUpdate): void {
    if (!item.plan || request.expectedRevision !== item.plan.revision) {
      throw new Problem(409, "app_plan_revision_conflict");
    }
    const existing = new Set(item.plan.parts.map((part) => part.itemUuid));
    const parts = request.parts.map(({ itemUuid, required, prerequisites, linkToken }) => {
      const link = linkToken ? this.links.get(linkToken) : null;
      if (!existing.has(itemUuid) && link?.itemUuid !== itemUuid) throw new Problem(404, "app_item_not_found");
      return { itemUuid, required, prerequisites };
    });
    item.plan = { revision: item.version + 1, parts, ...(item.plan.name ? { name: item.plan.name } : {}), ...(request.deadline ? { deadline: request.deadline } : {}) };
  }

  private read(caller: Caller): AppItemRead {
    const { item } = caller;
    const ownership = item.ownerUser === null ? "unowned" : item.ownerUser === caller.user ? "yours" : "other";
    const read: AppItemRead = {
      item: {
        itemUuid: item.uuid,
        kind: item.kind,
        role: caller.role,
        ownership,
        version: item.version,
        idleExpirySeconds: item.idleExpirySeconds,
        updatedAt: item.updatedAt,
        expiresAt: new Date(Date.parse(item.updatedAt) + item.idleExpirySeconds * 1000).toISOString(),
      },
    };
    if (caller.role === "owner") {
      if (item.meetingMinutes) read.meetingMinutes = structuredClone(item.meetingMinutes);
      read.links = [...this.links.values()]
        .filter((link) => link.itemUuid === item.uuid)
        .map(({ linkUuid, role, createdAt }) => ({ linkUuid, role, createdAt }));
    }
    if (item.project) {
      read.measurementProject = structuredClone(item.project);
      read.estimates = this.estimateList(item);
    }
    if (item.kind === "link_collection") read.linkCollection = { entries: item.entries };
    if (item.plan) {
      read.plan = structuredClone(item.plan);
      read.planMeetingSummaries = [...this.items.values()].flatMap((meeting) => {
        const notes = meeting.meetingMinutes;
        return notes?.planUuid === item.uuid && notes.sharedSummary && meeting.meeting
          ? [{ meetingUuid: meeting.uuid, name: meeting.meeting.name, summary: notes.sharedSummary }] : [];
      });
    }
    if (item.model) read.uncertaintyModel = structuredClone(item.model);
    if (item.meeting) read.meeting = meetingRead(item.meeting);
    return read;
  }

  private mine(user: string | null): AppItemSummary[] {
    if (!user) throw new Problem(401, "app_sign_in_required");
    return [...this.items.values()]
      .filter((item) => item.ownerUser === user)
      .map((item) => {
        const read = this.read({ item, role: "owner", user, viaCollection: false });
        return { ...read.item, name: item.project?.name ?? item.model?.name ?? item.meeting?.name ?? "", status: item.project?.status ?? item.meeting?.status ?? "" };
      });
  }

  private claim(caller: Caller): AppItemRead {
    const item = this.owner(caller);
    if (!caller.user) throw new Problem(401, "app_sign_in_required");
    if (item.ownerUser !== null && item.ownerUser !== caller.user) throw new Problem(409, "app_item_claimed");
    item.ownerUser = caller.user;
    this.touch(item);
    return this.read(caller);
  }

  private projectOf(item: Stored): AppMeasurementProject {
    if (!item.project) throw new Problem(409, "app_item_wrong_kind");
    return item.project;
  }

  private settings(item: Stored, body: Record<string, unknown>): void {
    if (typeof body.idleExpirySeconds === "number") item.idleExpirySeconds = body.idleExpirySeconds;
    const change = body.project as Record<string, unknown> | undefined;
    if (!change) return;
    const project = this.projectOf(item);
    if (typeof change.definitionOfDone === "string") project.delivery.definitionOfDone = change.definitionOfDone;
    if (typeof change.deliveryTargetDate === "string") project.delivery.targetDate = change.deliveryTargetDate;
    if (typeof change.forecastMethod === "string") project.run.forecastMethod = change.forecastMethod;
    if (typeof change.runSimilar === "boolean") project.run.similar = change.runSimilar;
  }

  private complete(item: Stored, completedAt: string): void {
    const project = this.projectOf(item);
    project.status = "completed";
    project.delivery.completedAt = completedAt;
    if (project.target) project.target.state = "completed";
  }

  private reopen(item: Stored): void {
    const project = this.projectOf(item);
    project.status = "active";
    if (project.target) project.target.state = "active";
  }

  private measure(caller: Caller, rows: { observedAt: string; value: number }[]): AppMeasurementBulkResponse {
    const item = this.owner(caller);
    const project = this.projectOf(item);
    if (item.observations.length + rows.length > (this.options.maxMeasurements ?? 20_000)) throw new Problem(422, "app_item_measurement_limit");
    item.observations.push(...rows.map((row) => ({ observedAt: row.observedAt, value: row.value })));
    const response: AppMeasurementBulkResponse = {
      importId: crypto.randomUUID(),
      accepted: rows.length,
      rejected: 0,
      results: rows.map((_, rowIndex) => ({ rowIndex, success: true, observationUuid: crypto.randomUUID() })),
    };
    const target = project.target;
    if (target?.state === "active" && rows.some((row) => row.value >= target.targetValue)) {
      target.state = "completed";
      target.completedAt = new Date().toISOString();
      response.completedTargetUuid = target.targetUuid;
    }
    this.touch(item);
    this.evaluateAlerts(item);
    return response;
  }

  private estimate(caller: Caller, body: { estimatedAt?: string; lowDate: string; highDate: string; note?: string }): AppProjectEstimate {
    const item = this.owner(caller);
    const estimate: AppProjectEstimate = {
      estimateUuid: crypto.randomUUID(),
      estimatedAt: body.estimatedAt ?? new Date().toISOString(),
      lowDate: body.lowDate,
      highDate: body.highDate,
      note: body.note ?? "",
    };
    item.estimates.push(estimate);
    this.touch(item);
    return estimate;
  }

  private estimateList(item: Stored): AppProjectEstimateList {
    const targetDate = item.project?.delivery.targetDate;
    const list: AppProjectEstimateList = { estimates: item.estimates, ...(targetDate ? { deliveryTargetDate: targetDate } : {}) };
    const latest = item.estimates.at(-1);
    if (!latest) return list;
    const low = Date.parse(latest.lowDate);
    const high = Date.parse(latest.highDate);
    const previous = item.estimates.at(-2);
    list.latest = { estimate: latest, ageDays: (Date.now() - Date.parse(latest.estimatedAt)) / DAY_MS };
    if (targetDate) list.latest.chanceByDeliveryTarget = Math.min(1, Math.max(0, (Date.parse(targetDate) - low) / Math.max(high - low, DAY_MS)));
    if (previous) {
      list.latest.movementDays = Math.round(((low + high) / 2 - (Date.parse(previous.lowDate) + Date.parse(previous.highDate)) / 2) / DAY_MS);
    }
    return list;
  }

  private addEntry(caller: Caller, token: string): AppLinkCollectionEntry {
    const item = this.owner(caller);
    const link = this.links.get(token);
    const target = link ? this.items.get(link.itemUuid) : undefined;
    if (!target) throw new Problem(404, "app_item_not_found");
    // Meetings are collectable here so the dashboard tile can be proven; Custd's applinks registry
    // does not mark them collectable yet (KindMeeting in libs/go/applinks/kinds.go).
    if (target.kind === "link_collection") throw new Problem(422, "app_item_not_collectable");
    const entry: AppLinkCollectionEntry = {
      entryUuid: crypto.randomUUID(),
      itemUuid: target.uuid,
      kind: target.kind,
      position: item.entries.length,
      createdAt: new Date().toISOString(),
    };
    item.entries.push(entry);
    this.touch(item);
    return entry;
  }

  // ---- Forecasts: a least-squares line through the measurements, enough to drive the pages ----

  private runForecast(caller: Caller, request: { method?: string; forecastFrom?: string }): AppForecastRun {
    const item = this.owner(caller);
    const project = this.projectOf(item);
    const from = request.forecastFrom ? Date.parse(request.forecastFrom) : Number.NEGATIVE_INFINITY;
    const points = item.observations
      .map((row) => ({ t: Date.parse(row.observedAt), v: row.value }))
      .filter((point) => point.t >= from)
      .sort((a, b) => a.t - b.t);
    const run: AppForecastRun = {
      forecastRunUuid: crypto.randomUUID(),
      projectUuid: project.projectUuid,
      status: "completed",
      method: request.method ?? "bayesian_linear_regression",
      generatedAt: new Date().toISOString(),
      inputCount: points.length,
      sampleCount: 1000,
      seed: 1,
      percentiles: {},
      provenance: {},
      ...(request.forecastFrom ? { forecastFrom: request.forecastFrom } : {}),
    };
    const fit = points.length >= 3 ? lineThrough(points) : null;
    const last = points.at(-1);
    const target = project.target;
    if (fit && last && target && fit.slope > 0) {
      const finish = last.t + (target.targetValue - last.v) / fit.slope;
      const spread = Math.max(DAY_MS, (finish - last.t) * 0.25);
      const lower = finish - spread;
      const upper = finish + spread;
      const deadline = target.targetDate ? Date.parse(target.targetDate) : null;
      run.percentiles = { p50: iso(finish), p05: iso(lower), p95: iso(upper) };
      run.counter = {
        completionInterval: { confidence: 0.9, lower: iso(lower), upper: iso(upper) },
        ...(deadline === null ? {} : { deadlineProbability: Math.min(0.99, Math.max(0.01, 0.5 + (deadline - finish) / (4 * spread))) }),
        rate: { perDay: fit.slope * DAY_MS, perHour: (fit.slope * DAY_MS) / 24, perMinute: (fit.slope * DAY_MS) / 1440, perSecond: fit.slope * 1000 },
        pooledRunCount: 1,
        detail: {
          arrivalHistogram: {
            bins: [0, 1, 2, 3, 4, 5].map((index) => ({
              start: iso(lower + (index * (upper - lower)) / 6),
              end: iso(lower + ((index + 1) * (upper - lower)) / 6),
              count: [40, 140, 320, 300, 150, 50][index] ?? 0,
            })),
            neverCount: 0,
          },
          posteriorLines: [0.8, 0.9, 1, 1.1, 1.2].map((factor) => ({
            points: [
              { at: iso(last.t), value: last.v },
              { at: iso(last.t + (target.targetValue - last.v) / (fit.slope * factor)), value: target.targetValue },
            ],
          })),
        },
      };
    }
    item.runs.push(run);
    this.evaluateAlerts(item);
    return run;
  }

  private latest(request: FakeRequest, caller: Caller): FakeResponse {
    const run = caller.item.runs.at(-1);
    if (!run) throw new Problem(404, "app_forecast_missing");
    return this.conditional(request, `"run-${caller.item.runs.length}"`, () => run);
  }

  private story(item: Stored): AppForecastStory {
    const project = this.projectOf(item);
    return {
      projectUuid: project.projectUuid,
      projectName: project.name,
      projectKind: project.kind,
      state: "ready",
      truncated: false,
      target: { available: true, label: project.target?.name ?? "", value: project.target?.targetValue ?? 0, ...(project.target?.targetDate ? { deadline: project.target.targetDate } : {}) },
      observations: [...item.observations],
      snapshots: [],
      delivery: { estimates: [] },
      presentation: {
        version: 1,
        presetId: "forecast-story",
        renderer: "svg",
        caption: "",
        summary: "",
        nonColorEncoding: "",
        width: 640,
        height: 280,
        layers: [],
        references: [],
        tableColumns: [],
        tableRows: [],
      },
      trust: { state: "ok", evidence: "", observationCount: item.observations.length, snapshotCount: 0 },
      provenance: { owner: "fake", generatedAt: new Date().toISOString() },
    };
  }

  // ---- Models: each input's midpoint and spread, enough to drive the pages ----

  private saveVersion(item: Stored, quantities: AppModelQuantity[], note: string): void {
    const model = item.model;
    if (!model) throw new Problem(409, "app_item_wrong_kind");
    model.latestVersion += 1;
    model.version = { versionUuid: crypto.randomUUID(), versionNumber: model.latestVersion, note, quantities, createdAt: new Date().toISOString() };
  }

  private runModel(caller: Caller, sensitivityOutput: string | undefined): AppModelRun {
    const item = this.owner(caller);
    const version = item.model?.version;
    if (!item.model || !version) throw new Problem(409, "app_model_version_missing");
    const centre = new Map<string, number>();
    const quantities: AppModelQuantityResult[] = version.quantities.map((quantity) => {
      let mid = 0;
      let spread = 0;
      if (quantity.kind === "input" && quantity.input.shape === "point") mid = quantity.input.value;
      if (quantity.kind === "input" && quantity.input.shape === "range") {
        mid = (quantity.input.low + quantity.input.high) / 2;
        spread = (quantity.input.high - quantity.input.low) / 2;
      }
      if (quantity.kind === "formula") {
        // Products and sums of named quantities only; the real engine parses full formulas.
        const values = (quantity.formula.match(/[A-Za-z_]\w*/g) ?? []).map((name) => centre.get(name) ?? 0);
        mid = quantity.formula.includes("*") ? values.reduce((product, value) => product * value, 1) : values.reduce((sum, value) => sum + value, 0);
        spread = Math.abs(mid) * 0.2;
      }
      centre.set(quantity.name, mid);
      return {
        name: quantity.name,
        summary: {
          mean: mid,
          stdDev: spread / 1.645,
          percentiles: { p5: mid - spread, p25: mid - spread / 2, p50: mid, p75: mid + spread / 2, p95: mid + spread },
          histogram: { min: mid - spread, max: mid + spread, counts: [1, 3, 8, 15, 22, 22, 15, 8, 3, 1] },
        },
      };
    });
    const inputs = version.quantities.filter((quantity) => quantity.kind === "input").map((quantity) => quantity.name);
    const run: AppModelRun = {
      runUuid: crypto.randomUUID(),
      modelUuid: item.model.modelUuid,
      versionNumber: version.versionNumber,
      trigger: "request",
      seed: 1,
      sampleCount: 10000,
      createdAt: new Date().toISOString(),
      quantities,
      boundInputs: [],
      ...(sensitivityOutput
        ? { sensitivityOutput, sensitivity: { output: sensitivityOutput, inputs: inputs.map((name, index) => ({ name, rankCorrelation: 0.8 / (index + 1), share: 1 / inputs.length })) } }
        : {}),
    };
    item.modelRuns.push(run);
    this.touch(item);
    return run;
  }

  // ---- Meetings: Custd's run engine in small; an overrun shrinks later blocks in proportion ----

  private meetingOf(item: Stored): AppMeeting & { lastFinished: string | null } {
    if (!item.meeting) throw new Problem(409, "app_item_wrong_kind");
    return item.meeting;
  }

  private startMeeting(item: Stored): void {
    const meeting = this.meetingOf(item);
    if (meeting.status !== "ready") throw new Problem(409, "app_item_meeting_step_refused");
    const now = this.now();
    const blocks = meeting.blocks ?? [];
    meeting.status = "running";
    meeting.startedAt = iso(now);
    meeting.endsAt = iso(now + blocks.reduce((sum, block) => sum + block.predictedMs, 0));
    const first = blocks[0];
    if (!first) return;
    Object.assign(first, { status: "active", startedAt: iso(now) });
    meeting.currentBlockUuid = first.blockUuid;
  }

  private advanceMeeting(caller: Caller, blockUuid: string): AppItemRead {
    const meeting = this.meetingOf(this.owner(caller));
    if (blockUuid === meeting.lastFinished) return this.read(caller);
    if (meeting.status !== "running" || blockUuid !== meeting.currentBlockUuid) throw new Problem(409, "app_item_meeting_step_refused");
    return this.change(caller, () => {
      const now = this.finishCurrent(meeting);
      const next = (meeting.blocks ?? []).find((block) => block.status === "pending" && block.allocatedMs > 0);
      if (next && now < Date.parse(meeting.endsAt ?? "")) {
        Object.assign(next, { status: "active", startedAt: iso(now) });
        meeting.currentBlockUuid = next.blockUuid;
      } else this.closeMeeting(meeting);
    });
  }

  private endMeeting(item: Stored): void {
    const meeting = this.meetingOf(item);
    if (meeting.status !== "running") throw new Problem(409, "app_item_meeting_step_refused");
    this.finishCurrent(meeting);
    this.closeMeeting(meeting);
  }

  private finishCurrent(meeting: AppMeeting & { lastFinished: string | null }): number {
    const now = this.now();
    const blocks = meeting.blocks ?? [];
    const active = blocks.find((block) => block.blockUuid === meeting.currentBlockUuid);
    if (active) {
      Object.assign(active, { status: "completed", endedAt: iso(now), actualMs: now - Date.parse(active.startedAt ?? iso(now)) });
      meeting.lastFinished = active.blockUuid;
    }
    const pending = blocks.filter((block) => block.status === "pending");
    const total = pending.reduce((sum, block) => sum + block.allocatedMs, 0);
    const budget = Math.max(0, Date.parse(meeting.endsAt ?? "") - now);
    for (const block of pending) block.allocatedMs = total === 0 ? 0 : Math.floor((budget * block.allocatedMs) / total);
    meeting.summary.overrunMs = Math.max(0, now - Date.parse(meeting.endsAt ?? ""));
    delete meeting.currentBlockUuid;
    return now;
  }

  private closeMeeting(meeting: AppMeeting): void {
    for (const block of meeting.blocks ?? []) if (block.status === "pending") block.status = "not_run";
    meeting.status = "completed";
  }

  // ---- Alerts ----

  private alertSettings(item: Stored): AppAlertSettings {
    return { rules: item.alerts.rules, webhooks: item.alerts.webhooks, deliveryAvailable: true };
  }

  private addRule(item: Stored, spec: AppAlertRuleSpec): AppAlertRule {
    const rule: AppAlertRule = { ...spec, ruleUuid: crypto.randomUUID(), conditionMet: false, crossings: 0, createdAt: new Date().toISOString() };
    item.alerts.rules.push(rule);
    return rule;
  }

  private addWebhook(item: Stored, endpoint: string): { webhook: AppAlertWebhook; signingSecret: string } {
    if (!endpoint.startsWith("https://")) throw new Problem(400, "app_alert_rule_invalid");
    const webhook: AppAlertWebhook = { webhookUuid: crypto.randomUUID(), kind: "webhook", endpoint, createdAt: new Date().toISOString() };
    item.alerts.webhooks.push(webhook);
    return { webhook, signingSecret: `whsec_${randomToken()}` };
  }

  private subscribe(caller: Caller): { subscriptionUuid: string; createdAt: string } {
    const item = this.owner(caller);
    if (!caller.user) throw new Problem(401, "app_sign_in_required");
    if (this.options.signedInUsersHaveVerifiedEmail === false) throw new Problem(422, "app_alert_no_verified_email");
    item.alerts.subscribers.add(caller.user);
    return { subscriptionUuid: crypto.randomUUID(), createdAt: new Date().toISOString() };
  }

  private evaluateAlerts(item: Stored): void {
    const target = item.project?.target;
    const counter = item.runs.at(-1)?.counter;
    for (const rule of item.alerts.rules) {
      let met = rule.conditionMet;
      if (rule.type === "target_reached") met = target?.state === "completed";
      if (rule.type === "deadline_probability_below" && counter?.deadlineProbability !== undefined) met = counter.deadlineProbability < (rule.threshold ?? 0);
      if (rule.type === "forecast_moved_inside_target" && counter?.completionInterval && target?.targetDate) {
        met = Date.parse(counter.completionInterval.upper) <= Date.parse(target.targetDate);
      }
      if (met && !rule.conditionMet) {
        rule.crossings += 1;
        for (const webhook of item.alerts.webhooks) {
          const now = new Date().toISOString();
          item.alerts.deliveries.push({
            deliveryUuid: crypto.randomUUID(),
            ruleUuid: rule.ruleUuid,
            ruleType: rule.type,
            crossing: rule.crossings,
            channel: "webhook",
            webhookUuid: webhook.webhookUuid,
            outcome: "sent",
            attempts: 1,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      rule.conditionMet = met;
    }
  }
}

function emptySummary(): AppMeeting["summary"] {
  return { predictedMs: 0, finishedPredictedMs: 0, finishedActualMs: 0, finishedBlocks: 0, overrunMs: 0 };
}

/** The meeting as Custd reads it: totals summed from the blocks. */
function meetingRead(stored: AppMeeting & { lastFinished: string | null }): AppMeeting {
  const meeting: AppMeeting & { lastFinished?: string | null } = structuredClone(stored);
  delete meeting.lastFinished;
  const blocks = meeting.blocks ?? [];
  const finished = blocks.filter((block) => block.status === "completed");
  meeting.summary = {
    predictedMs: blocks.reduce((sum, block) => sum + block.predictedMs, 0),
    finishedPredictedMs: finished.reduce((sum, block) => sum + block.predictedMs, 0),
    finishedActualMs: finished.reduce((sum, block) => sum + block.actualMs, 0),
    finishedBlocks: finished.length,
    overrunMs: meeting.summary.overrunMs,
  };
  return meeting;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function lineThrough(points: { t: number; v: number }[]): { slope: number } {
  const n = points.length;
  const meanT = points.reduce((sum, point) => sum + point.t, 0) / n;
  const meanV = points.reduce((sum, point) => sum + point.v, 0) / n;
  const covariance = points.reduce((sum, point) => sum + (point.t - meanT) * (point.v - meanV), 0);
  const variance = points.reduce((sum, point) => sum + (point.t - meanT) ** 2, 0);
  return { slope: variance === 0 ? 0 : covariance / variance };
}
