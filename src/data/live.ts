// Self-refreshing reads: the SDK's live hooks (conditional polling, paused in hidden tabs) mapped
// to the shapes the pages render. Several reads of one item combine into one freshness state.

import { APP_LIVE_STATUSES, type AppItemError, type AppItemRead, type AppModelRun } from "@haakco/custd-sdk/browser";
import { CUSTD_APP_LIVE_IDLE, type CustdAppLiveResult, useAppForecast, useAppForecastStory, useAppItem, useAppModelRun } from "@haakco/custd-react";
import { useMemo } from "react";
import { toCounter, toDashboard, toModel, toProject } from "./mappers";
import type { Counter, Dashboard, ItemAccess, Model, Project } from "./types";

/** How fresh what is on screen is, worst first: the page shows one line for it. */
export type Freshness = "fresh" | "stale" | "offline";

export type LiveView<T> =
  | { status: "loading" }
  | { status: "error"; error: AppItemError }
  | { status: "ready"; data: T; freshness: Freshness; lastUpdatedAt: Date | null; refresh: () => void };

type Live<T> = CustdAppLiveResult<T>;
type Options = { item?: string };

function dataOf<T>(live: Live<T>): T | undefined {
  return "data" in live ? live.data : undefined;
}

function freshnessOf(lives: readonly Live<unknown>[]): Freshness {
  if (lives.some((live) => live.status === APP_LIVE_STATUSES.offline)) return "offline";
  if (lives.some((live) => live.status === APP_LIVE_STATUSES.stale || live.status === APP_LIVE_STATUSES.error)) return "stale";
  return "fresh";
}

function lastUpdatedOf(live: Live<unknown>): Date | null {
  return "lastUpdatedAt" in live ? (live.lastUpdatedAt ?? null) : null;
}

/** The item a link opens. A refusal without data (expired, revoked, mistyped) is an error. */
export function useItemRead(access: ItemAccess | null, options: Options = {}): LiveView<AppItemRead> {
  const live = useAppItem(access, options);
  const data = dataOf(live);
  return useMemo((): LiveView<AppItemRead> => {
    if (data === undefined) {
      if (live.status === APP_LIVE_STATUSES.error || live.status === APP_LIVE_STATUSES.offline) return { status: "error", error: live.error };
      return { status: "loading" };
    }
    return { status: "ready", data, freshness: freshnessOf([live]), lastUpdatedAt: lastUpdatedOf(live), refresh: live.refresh };
  }, [live, data]);
}

/** A counter: its item, measurements (from the forecast story) and latest forecast. */
export function useCounter(access: ItemAccess, read: AppItemRead, options: Options = {}): LiveView<Counter> {
  const story = useAppForecastStory(access, options);
  const forecast = useAppForecast(access, options);
  const storyData = dataOf(story);
  const forecastData = dataOf(forecast);
  return useMemo((): LiveView<Counter> => {
    if (storyData === undefined) {
      if (story.status === APP_LIVE_STATUSES.error || story.status === APP_LIVE_STATUSES.offline) return { status: "error", error: story.error };
      return { status: "loading" };
    }
    const counter = toCounter(read, storyData.observations ?? [], forecastData ?? null, storyData.truncated);
    const refresh = () => {
      story.refresh();
      forecast.refresh();
    };
    const lives = forecast.status === CUSTD_APP_LIVE_IDLE ? [story] : [story, forecast];
    return { status: "ready", data: counter, freshness: freshnessOf(lives), lastUpdatedAt: lastUpdatedOf(story), refresh };
  }, [read, story, forecast, storyData, forecastData]);
}

export function projectOf(read: AppItemRead): Project {
  return toProject(read);
}

export function dashboardOf(read: AppItemRead): Dashboard {
  return toDashboard(read);
}

export function modelOf(read: AppItemRead): Model {
  return toModel(read);
}

/** The model's latest run, kept fresh; null until the first run exists. */
export function useModelRun(access: ItemAccess, options: Options = {}): LiveView<AppModelRun | null> {
  const live = useAppModelRun(access, options);
  const data = dataOf(live);
  return useMemo((): LiveView<AppModelRun | null> => {
    if (live.status === APP_LIVE_STATUSES.empty) {
      return { status: "ready", data: null, freshness: "fresh", lastUpdatedAt: live.lastUpdatedAt, refresh: live.refresh };
    }
    if (data === undefined) {
      if (live.status === APP_LIVE_STATUSES.error || live.status === APP_LIVE_STATUSES.offline) return { status: "error", error: live.error };
      return { status: "loading" };
    }
    return { status: "ready", data, freshness: freshnessOf([live]), lastUpdatedAt: lastUpdatedOf(live), refresh: live.refresh };
  }, [live, data]);
}
