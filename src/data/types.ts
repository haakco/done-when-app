/** Typed shapes the pages render. The placeholder source and, later, the Custd SDK both return these. */

export type ItemKind = "counter" | "project" | "dashboard";
/** Owner links read and write one item; share links only read it. */
export type Access = "owner" | "share";

export type ItemLinks = { ownerToken: string; shareToken: string };

export type Measurement = { measuredAt: string; value: number };

export type ForecastMethod = "bayesian_linear" | "seasonal_7d";

export type CounterForecast = {
  method: ForecastMethod;
  /** 90% interval and median for the completion date, as ISO timestamps. */
  completionLow: string;
  completionMedian: string;
  completionHigh: string;
  /** Chance of reaching the target by the deadline, 0–1, or null without a deadline. */
  deadlineProbability: number | null;
};

export type CounterStatus = "active" | "completed";

export type Counter = {
  name: string;
  unit: string;
  startValue: number;
  targetValue: number;
  startedAt: string;
  deadline: string | null;
  status: CounterStatus;
  measurements: Measurement[];
  /** Null until there are at least three measurements. */
  forecast: CounterForecast | null;
  expiresAfterSeconds: number;
  updatedAt: string;
};

export type ProjectEstimate = { recordedOn: string; low: string; high: string; note: string };

export type ProjectStatus = "active" | "completed" | "canceled";

export type Project = {
  name: string;
  definitionOfDone: string;
  /** The date told to stakeholders. */
  deliveryTarget: string;
  estimates: ProjectEstimate[];
  /** Chance of landing by the delivery target from the latest estimate, 0–1. */
  chanceByTarget: number | null;
  status: ProjectStatus;
  completedOn: string | null;
  expiresAfterSeconds: number;
  updatedAt: string;
};

export type DashboardEntry = {
  kind: Exclude<ItemKind, "dashboard">;
  shareToken: string;
  name: string;
  /** One-line state, such as "64% · likely 3–9 Dec". */
  summary: string;
};

export type Dashboard = {
  name: string;
  entries: DashboardEntry[];
  expiresAfterSeconds: number;
  updatedAt: string;
};

export type ItemView<TItem> = { access: Access; item: TItem; links: ItemLinks | null };

export type CounterDraft = {
  name: string;
  unit: string;
  startValue: number;
  targetValue: number;
  startedAt: string;
  deadline: string | null;
  history: Measurement[];
  expiresAfterSeconds: number;
};

export type ProjectDraft = {
  name: string;
  definitionOfDone: string;
  deliveryTarget: string;
  expiresAfterSeconds: number;
};

export type DashboardDraft = { name: string; entryRefs: string[]; expiresAfterSeconds: number };

export type EstimateDraft = { low: string; high: string; note: string };

export type CreatedItem = { kind: ItemKind; links: ItemLinks };

export type MyItem = { kind: ItemKind; name: string; ownerToken: string; updatedAt: string };

export type SignInState = { status: "signed_out" } | { status: "signed_in"; displayName: string };

export type SignInCompletion = { status: "signed_in"; returnTo: string } | { status: "failed"; message: string };
