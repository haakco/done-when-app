// Pure mapping from Custd's app item reads to the shapes the pages render, plus the request
// shapes the app writes. Counters and projects are both `measurement_project` items; the series
// code written at creation tells them apart.

import {
  APP_FORECAST_METHODS,
  APP_ITEM_KINDS,
  APP_MEASUREMENT_PROJECT_KINDS,
  type AppForecastRun,
  type AppItemCreateRequest,
  type AppItemRead,
  type AppMeasurementProject,
} from "@haakco/custd-sdk/browser";
import type {
  Counter,
  CounterDraft,
  CounterForecast,
  Dashboard,
  ForecastMethod,
  ItemKind,
  ItemMeta,
  Measurement,
  Meeting,
  MeetingDraft,
  Model,
  ModelDraft,
  Project,
  ProjectDraft,
  ProjectEstimate,
} from "./types";

/** Shared with the done-when CLI, so items made by either work in both. */
export const COUNTER_SERIES_CODE = "value";
export const PROJECT_SERIES_CODE = "estimate";
const UNIT_SLUG = "unitless";
const TARGET_CODE = "done";
const COMPLETED = "completed";
const CANCELED = "canceled";
const DAY_MS = 86_400_000;
/** The forecast story lists at most this many of the newest measurements. */
export const STORY_MEASUREMENT_LIMIT = 500;

export const DEFAULT_FORECAST_METHOD: ForecastMethod = APP_FORECAST_METHODS.bayesianLinearRegression;

export const KIND_PATH: Record<ItemKind, string> = { counter: "c", project: "p", model: "m", meeting: "meet", dashboard: "d" };

export function itemKindOf(read: AppItemRead): ItemKind {
  if (read.item.kind === APP_ITEM_KINDS.linkCollection) return "dashboard";
  if (read.item.kind === APP_ITEM_KINDS.uncertaintyModel) return "model";
  if (read.item.kind === APP_ITEM_KINDS.meeting) return "meeting";
  return read.measurementProject?.series?.[0]?.seriesCode === PROJECT_SERIES_CODE ? "project" : "counter";
}

function metaOf(read: AppItemRead): ItemMeta {
  const { item } = read;
  return {
    itemUuid: item.itemUuid,
    role: item.role,
    ownership: item.ownership,
    idleExpirySeconds: item.idleExpirySeconds,
    expiresAt: item.expiresAt,
    updatedAt: item.updatedAt,
    links: read.links ?? [],
  };
}

function projectOf(read: AppItemRead): AppMeasurementProject {
  if (!read.measurementProject) throw new Error("item has no measurement project");
  return read.measurementProject;
}

/** The series name is the unit, or the counter's own name when it has no unit (the CLI's rule). */
function unitOf(project: AppMeasurementProject): string {
  const series = project.series?.[0];
  return series && series.name !== project.name ? series.name : "";
}

export function toCounter(
  read: AppItemRead,
  observations: readonly { observedAt: string; value: number }[],
  run: AppForecastRun | null,
  storyTruncated = false,
): Counter {
  const project = projectOf(read);
  const measurements = observations
    .map((row): Measurement => ({ measuredAt: row.observedAt, value: row.value }))
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  const method = project.run.forecastMethod === APP_FORECAST_METHODS.seasonal7Day ? APP_FORECAST_METHODS.seasonal7Day : DEFAULT_FORECAST_METHOD;
  return {
    ...metaOf(read),
    name: project.name,
    unit: unitOf(project),
    targetValue: project.target?.targetValue ?? 0,
    deadline: project.target?.targetDate ?? null,
    status: project.target?.state === COMPLETED || project.status === COMPLETED ? "completed" : "active",
    completedAt: project.target?.completedAt ?? project.delivery.completedAt ?? null,
    measurements,
    measurementsTruncated: storyTruncated && measurements.length >= STORY_MEASUREMENT_LIMIT,
    startValue: measurements[0]?.value ?? 0,
    latestValue: measurements.at(-1)?.value ?? 0,
    forecast: run ? toForecast(run) : null,
    method,
    runSimilar: project.run.similar,
    seriesRootUuid: project.run.seriesRootUuid ?? null,
  };
}

export function toForecast(run: AppForecastRun): CounterForecast {
  const counter = run.counter;
  const histogram = counter?.detail.arrivalHistogram;
  return {
    method: run.method,
    generatedAt: run.generatedAt,
    inputCount: run.inputCount,
    completionMedian: run.percentiles.p50 ?? null,
    completionLow: counter?.completionInterval?.lower ?? null,
    completionHigh: counter?.completionInterval?.upper ?? null,
    deadlineProbability: counter?.deadlineProbability ?? null,
    forecastFrom: run.forecastFrom ?? null,
    posteriorLines: (counter?.detail.posteriorLines ?? []).map((line) => ({ points: line.points ?? [] })),
    histogram: histogram ? { bins: histogram.bins ?? [], neverCount: histogram.neverCount } : null,
    pooledRunCount: counter?.pooledRunCount ?? 0,
    warnings: (run.warnings ?? []).map((warning) => warning.message),
  };
}

export function toProject(read: AppItemRead): Project {
  const project = projectOf(read);
  const latest = read.estimates?.latest;
  const status = project.status === COMPLETED || project.status === CANCELED ? project.status : "active";
  return {
    ...metaOf(read),
    name: project.name,
    definitionOfDone: project.delivery.definitionOfDone,
    deliveryTarget: project.delivery.targetDate ?? read.estimates?.deliveryTargetDate ?? null,
    estimates: withConvergence(read.estimates?.estimates ?? []),
    latest: latest
      ? { chanceByTarget: latest.chanceByDeliveryTarget ?? null, ageDays: latest.ageDays, movementDays: latest.movementDays ?? null }
      : null,
    status,
    completedAt: project.delivery.completedAt ?? null,
  };
}

/** Oldest first, each with its width and how far its midpoint moved from the one before. */
export function withConvergence(
  estimates: readonly { estimatedAt: string; lowDate: string; highDate: string; note: string }[],
): ProjectEstimate[] {
  const ordered = [...estimates].sort((a, b) => Date.parse(a.estimatedAt) - Date.parse(b.estimatedAt));
  return ordered.map((estimate, index) => {
    const low = Date.parse(estimate.lowDate);
    const high = Date.parse(estimate.highDate);
    const mapped: ProjectEstimate = {
      estimatedAt: estimate.estimatedAt,
      low: estimate.lowDate,
      high: estimate.highDate,
      note: estimate.note,
      widthDays: Math.round((high - low) / DAY_MS),
    };
    const previous = ordered[index - 1];
    if (previous) {
      const midpoint = (low + high) / 2;
      const previousMidpoint = (Date.parse(previous.lowDate) + Date.parse(previous.highDate)) / 2;
      mapped.movementDays = Math.round((midpoint - previousMidpoint) / DAY_MS);
    }
    return mapped;
  });
}

export function toModel(read: AppItemRead): Model {
  const model = read.uncertaintyModel;
  if (!model) throw new Error("item has no uncertainty model");
  return {
    ...metaOf(read),
    name: model.name,
    description: model.description,
    latestVersion: model.latestVersion,
    version: model.version ?? null,
    queuedRunError: model.queuedRunFailure?.error ?? null,
  };
}

/** The item's display name, whatever its kind. */
export function itemNameOf(read: AppItemRead): string {
  return read.measurementProject?.name ?? read.uncertaintyModel?.name ?? read.meeting?.name ?? "Dashboard";
}

export function modelCreateRequest(draft: ModelDraft): AppItemCreateRequest {
  return {
    kind: APP_ITEM_KINDS.uncertaintyModel,
    idleExpirySeconds: draft.expiresAfterSeconds,
    uncertaintyModel: { name: draft.name, ...(draft.description ? { description: draft.description } : {}) },
  };
}

export function toMeeting(read: AppItemRead): Meeting {
  if (!read.meeting) throw new Error("item has no meeting");
  return { ...metaOf(read), meeting: read.meeting };
}

const MINUTE_MS = 60_000;

export function meetingCreateRequest(draft: MeetingDraft): AppItemCreateRequest {
  return {
    kind: APP_ITEM_KINDS.meeting,
    idleExpirySeconds: draft.expiresAfterSeconds,
    meeting: { name: draft.name, blocks: draft.blocks.map((block) => ({ title: block.title, predictedMs: Math.round(block.minutes * MINUTE_MS) })) },
  };
}

export function toDashboard(read: AppItemRead): Dashboard {
  return {
    ...metaOf(read),
    entries: (read.linkCollection?.entries ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((entry) => ({ entryUuid: entry.entryUuid, itemUuid: entry.itemUuid })),
  };
}

export function counterCreateRequest(draft: CounterDraft): AppItemCreateRequest {
  return {
    kind: APP_ITEM_KINDS.measurementProject,
    idleExpirySeconds: draft.expiresAfterSeconds,
    measurementProject: {
      kind: APP_MEASUREMENT_PROJECT_KINDS.deadlineForecast,
      name: draft.name,
      series: [
        {
          seriesCode: COUNTER_SERIES_CODE,
          name: draft.unit || draft.name,
          unitSlug: UNIT_SLUG,
          completionDirection: "increase",
          source: "manual",
        },
      ],
      target: {
        targetCode: TARGET_CODE,
        name: draft.name,
        targetValue: draft.targetValue,
        ...(draft.deadline ? { targetDate: draft.deadline } : {}),
        state: "active",
      },
    },
  };
}

export function projectCreateRequest(draft: ProjectDraft): AppItemCreateRequest {
  return {
    kind: APP_ITEM_KINDS.measurementProject,
    idleExpirySeconds: draft.expiresAfterSeconds,
    measurementProject: {
      kind: APP_MEASUREMENT_PROJECT_KINDS.deadlineForecast,
      name: draft.name,
      series: [
        { seriesCode: PROJECT_SERIES_CODE, name: "Estimates", unitSlug: UNIT_SLUG, completionDirection: "increase", source: "manual" },
      ],
      target: { targetCode: TARGET_CODE, name: draft.name, targetValue: 1, targetDate: draft.deliveryTarget, state: "active" },
    },
  };
}
