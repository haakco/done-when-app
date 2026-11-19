// One-shot reads of a dashboard's items for its download. The tiles use live hooks; a download
// needs every item at once, so it reads each one here instead.

import { APP_ITEM_ERROR_CODES, APP_MODEL_ERROR_CODES, APP_MODEL_QUANTITY_KINDS, AppItemError, type AppConditionalRead, type AppItemAccess, type AppItemsClient } from "@haakco/custd-sdk/browser";
import { formatDate } from "../lib/dates";
import type { DashboardRow } from "../lib/exports";
import { counterSummary, modelHeadline, projectSummary } from "../lib/forecast-text";
import { meetingLine } from "../lib/meeting";
import { itemKindOf, toCounter, toMeeting, toModel, toProject } from "./mappers";
import { explainError } from "./source";

function dataOf<T>(read: AppConditionalRead<T>): T {
  if (read.status !== "modified") throw new Error("expected a fresh read");
  return read.data;
}

/** The latest forecast or model run, or null before the first one. */
async function latestOrNull<T>(read: Promise<AppConditionalRead<T>>, missing: string): Promise<T | null> {
  try {
    return dataOf(await read);
  } catch (error) {
    if (error instanceof AppItemError && error.code === missing) return null;
    throw error;
  }
}

export async function dashboardRow(items: AppItemsClient, access: AppItemAccess, itemUuid: string): Promise<DashboardRow> {
  const options = { item: itemUuid };
  try {
    const read = dataOf(await items.readItem(access, options));
    const updatedAt = new Date(read.item.updatedAt);
    const kind = itemKindOf(read);
    if (kind === "plan") {
      const forecast = await items.planForecast(access, options);
      return {
        name: read.plan?.name || "Plan", kind, status: "",
        headline: forecast.median ? `Likely done ${formatDate(forecast.median)}` : "Forecast coming soon",
        detail: `${forecast.completedParts} of ${forecast.requiredParts} required parts complete`, updatedAt,
      };
    }
    if (kind === "project") {
      const project = toProject(read);
      const summary = projectSummary(project);
      return { name: project.name, kind, status: project.status, headline: summary.headline, detail: summary.detail ?? "", updatedAt };
    }
    if (kind === "meeting") {
      const { meeting } = toMeeting(read);
      const line = meetingLine(meeting, Date.now());
      return { name: meeting.name, kind, status: meeting.status, headline: line.headline, detail: line.detail ?? "", updatedAt };
    }
    if (kind === "model") {
      const model = toModel(read);
      const run = await latestOrNull(items.latestModelRun(access, options), APP_MODEL_ERROR_CODES.runMissing);
      const output = model.version?.quantities.find((quantity) => quantity.kind === APP_MODEL_QUANTITY_KINDS.formula)?.name;
      return { name: model.name, kind, status: `version ${model.latestVersion}`, headline: modelHeadline(output, run), detail: "", updatedAt };
    }
    const story = dataOf(await items.forecastStory(access, options));
    const forecast = await latestOrNull(items.latestForecast(access, options), APP_ITEM_ERROR_CODES.forecastMissing);
    const counter = toCounter(read, story.observations ?? [], forecast, story.truncated);
    const summary = counterSummary(counter);
    return { name: counter.name, kind: "counter", status: counter.status, headline: summary.headline, detail: summary.detail ?? "", updatedAt };
  } catch (error) {
    return { name: "Item", kind: "", status: "unavailable", headline: explainError(error), detail: "", updatedAt: null };
  }
}
