/** Typed shapes the pages render, mapped from Custd's app item reads in `mappers.ts`. */

import type { AppForecastMethod, AppItemAccess, AppItemLink, AppItemOwnership, AppLinkRole, AppModelVersion } from "@haakco/custd-sdk/browser";

export type ItemKind = "counter" | "project" | "model" | "dashboard";

/** Owner links read and change one item; share links only read it. */
export type Access = AppLinkRole;

/** A link token, or `{ item }` for an item the signed-in user owns. */
export type ItemAccess = AppItemAccess;

export type Measurement = { measuredAt: string; value: number };

export type ForecastMethod = Extract<AppForecastMethod, "bayesian_linear_regression" | "seasonal_7_day">;

/** What every item page shows about the item itself, whatever its kind. */
export type ItemMeta = {
  itemUuid: string;
  role: Access;
  ownership: AppItemOwnership;
  idleExpirySeconds: number;
  expiresAt: string;
  updatedAt: string;
  /** Listed for an owner link only; tokens are never in it. */
  links: AppItemLink[];
};

export type CounterForecast = {
  method: string;
  generatedAt: string;
  inputCount: number;
  completionMedian: string | null;
  /** 90% interval for the completion date; null until there are three measurements. */
  completionLow: string | null;
  completionHigh: string | null;
  /** Chance of reaching the target by the deadline, 0–1, or null without a deadline. */
  deadlineProbability: number | null;
  forecastFrom: string | null;
  posteriorLines: { points: { at: string; value: number }[] }[];
  histogram: { bins: { start: string; end: string; count: number }[]; neverCount: number } | null;
  pooledRunCount: number;
  warnings: string[];
};

export type CounterStatus = "active" | "completed";

export type Counter = ItemMeta & {
  name: string;
  unit: string;
  targetValue: number;
  deadline: string | null;
  status: CounterStatus;
  measurements: Measurement[];
  /** The first measurement's value, or 0 before there is one. */
  startValue: number;
  latestValue: number;
  forecast: CounterForecast | null;
  method: ForecastMethod;
  /** Whether this run's data is pooled with the earlier runs of its series. */
  runSimilar: boolean;
  /** Set when the counter is a later run in a series. */
  seriesRootUuid: string | null;
};

export type ProjectEstimate = {
  estimatedAt: string;
  low: string;
  high: string;
  note: string;
  widthDays: number;
  /** How far the midpoint moved from the previous estimate, in days; positive is later. */
  movementDays?: number;
};

export type ProjectStatus = "active" | "completed" | "canceled";

export type Project = ItemMeta & {
  name: string;
  definitionOfDone: string;
  /** The date told to stakeholders. */
  deliveryTarget: string | null;
  estimates: ProjectEstimate[];
  latest: { chanceByTarget: number | null; ageDays: number; movementDays: number | null } | null;
  status: ProjectStatus;
  completedAt: string | null;
};

/** An uncertainty model: quantities whose ranges combine into simulated outputs. */
export type Model = ItemMeta & {
  name: string;
  description: string;
  /** 0 until a version is saved. */
  latestVersion: number;
  version: AppModelVersion | null;
  /** A run queued by a live input failed; shown until a run succeeds. */
  queuedRunError: string | null;
};

export type ModelDraft = { name: string; description: string; expiresAfterSeconds: number };

export type DashboardEntry = { entryUuid: string; itemUuid: string };

export type Dashboard = ItemMeta & { entries: DashboardEntry[] };

export type CounterDraft = {
  name: string;
  unit: string;
  startValue: number;
  targetValue: number;
  startedAt: string;
  /** RFC 3339, or null for no deadline. */
  deadline: string | null;
  history: Measurement[];
  expiresAfterSeconds: number;
};

export type ProjectDraft = {
  name: string;
  definitionOfDone: string;
  /** RFC 3339. */
  deliveryTarget: string;
  expiresAfterSeconds: number;
};

export type DashboardDraft = { entryRefs: string[]; expiresAfterSeconds: number };

export type EstimateDraft = { low: string; high: string; note: string };

export type CreatedItem = { kind: ItemKind; itemUuid: string; ownerToken: string; shareToken: string };

export type ForecastSettings = { method: ForecastMethod; forecastFrom: string | null };

export type MeasurementsAdded = { accepted: number; rejected: number; targetReached: boolean };

/** "item" is a counter or a project: Custd's list does not say which until the item is read. */
export type MyItem = { itemUuid: string; kind: "item" | "model" | "dashboard"; name: string; status: string; updatedAt: string };
