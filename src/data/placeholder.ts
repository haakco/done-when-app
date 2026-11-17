import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { parseItemRef } from "../lib/links";
import { ItemNotFoundError, ReadOnlyLinkError, type DoneWhenData } from "./source";
import type {
  Counter,
  CreatedItem,
  Dashboard,
  DashboardEntry,
  ItemKind,
  ItemLinks,
  ItemView,
  Project,
} from "./types";

/**
 * In-memory stand-in for the Custd link routes. It keeps owner/share access honest so pages
 * behave as they will against the real API, but it does not forecast: forecasts and the
 * chance-by-target figures are fixed sample values on the seeded demo items only.
 */

type Stored =
  | { kind: "counter"; links: ItemLinks; item: Counter }
  | { kind: "project"; links: ItemLinks; item: Project }
  | { kind: "dashboard"; links: ItemLinks; item: Dashboard };

const byToken = new Map<string, Stored>();

function newToken(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function store(entry: Stored): CreatedItem {
  byToken.set(entry.links.ownerToken, entry);
  byToken.set(entry.links.shareToken, entry);
  return { kind: entry.kind, links: entry.links };
}

function freshLinks(): ItemLinks {
  return { ownerToken: newToken(), shareToken: newToken() };
}

function find<TKind extends ItemKind>(token: string, kind: TKind): Extract<Stored, { kind: TKind }> {
  const entry = byToken.get(token);
  if (entry?.kind !== kind) {
    throw new ItemNotFoundError(token);
  }
  return entry as Extract<Stored, { kind: TKind }>;
}

function view<TItem>(entry: { links: ItemLinks; item: TItem }, token: string): ItemView<TItem> {
  const owner = token === entry.links.ownerToken;
  return { access: owner ? "owner" : "share", item: structuredClone(entry.item), links: owner ? entry.links : null };
}

function findOwned<TKind extends ItemKind>(token: string, kind: TKind): Extract<Stored, { kind: TKind }> {
  const entry = find(token, kind);
  if (token !== entry.links.ownerToken) {
    throw new ReadOnlyLinkError();
  }
  entry.item.updatedAt = new Date().toISOString();
  return entry;
}

function dashboardEntry(ref: string): DashboardEntry {
  const parsed = parseItemRef(ref);
  const entry = parsed === null ? undefined : byToken.get(parsed.token);
  if (entry === undefined || entry.kind === "dashboard") {
    throw new ItemNotFoundError(ref);
  }
  const summary =
    entry.kind === "counter"
      ? `${entry.item.measurements.at(-1)?.value ?? entry.item.startValue} of ${entry.item.targetValue} ${entry.item.unit}`
      : `${entry.item.status} · target ${entry.item.deliveryTarget}`;
  return { kind: entry.kind, shareToken: entry.links.shareToken, name: entry.item.name, summary };
}

const now = () => new Date().toISOString();

export const placeholderData: DoneWhenData = {
  createCounter(draft) {
    const measurements = draft.history.length > 0 ? draft.history : [{ measuredAt: draft.startedAt, value: draft.startValue }];
    const item: Counter = { ...draft, status: "active", measurements, forecast: null, updatedAt: now() };
    return Promise.resolve(store({ kind: "counter", links: freshLinks(), item }));
  },
  getCounter(token) {
    return Promise.resolve().then(() => view(find(token, "counter"), token));
  },
  addMeasurements(ownerToken, measurements) {
    return Promise.resolve().then(() => {
      const { item } = findOwned(ownerToken, "counter");
      item.measurements.push(...measurements);
      if (item.measurements.some((measurement) => measurement.value >= item.targetValue)) {
        item.status = "completed";
      }
    });
  },
  setCounterStatus(ownerToken, status) {
    return Promise.resolve().then(() => {
      findOwned(ownerToken, "counter").item.status = status;
    });
  },

  createProject(draft) {
    const item: Project = { ...draft, estimates: [], chanceByTarget: null, status: "active", completedOn: null, updatedAt: now() };
    return Promise.resolve(store({ kind: "project", links: freshLinks(), item }));
  },
  getProject(token) {
    return Promise.resolve().then(() => view(find(token, "project"), token));
  },
  addEstimate(ownerToken, estimate) {
    return Promise.resolve().then(() => {
      findOwned(ownerToken, "project").item.estimates.push({ ...estimate, recordedOn: now().slice(0, 10) });
    });
  },
  completeProject(ownerToken, completedOn) {
    return Promise.resolve().then(() => {
      const { item } = findOwned(ownerToken, "project");
      item.status = "completed";
      item.completedOn = completedOn;
    });
  },
  cancelProject(ownerToken) {
    return Promise.resolve().then(() => {
      findOwned(ownerToken, "project").item.status = "canceled";
    });
  },

  createDashboard(draft) {
    return Promise.resolve().then(() => {
      const item: Dashboard = { name: draft.name, entries: draft.entryRefs.map(dashboardEntry), expiresAfterSeconds: draft.expiresAfterSeconds, updatedAt: now() };
      return store({ kind: "dashboard", links: freshLinks(), item });
    });
  },
  getDashboard(token) {
    return Promise.resolve().then(() => view(find(token, "dashboard"), token));
  },
  addDashboardEntry(ownerToken, entryRef) {
    return Promise.resolve().then(() => {
      const { item } = findOwned(ownerToken, "dashboard");
      const entry = dashboardEntry(entryRef);
      if (!item.entries.some((existing) => existing.shareToken === entry.shareToken)) {
        item.entries.push(entry);
      }
    });
  },
  removeDashboardEntry(ownerToken, shareToken) {
    return Promise.resolve().then(() => {
      const { item } = findOwned(ownerToken, "dashboard");
      item.entries = item.entries.filter((entry) => entry.shareToken !== shareToken);
    });
  },

  getSignInState() {
    return Promise.resolve({ status: "signed_out" });
  },
  completeSignIn() {
    return Promise.resolve({ status: "failed", message: "Sign-in is not available yet." });
  },
  listMyItems() {
    return Promise.resolve([]);
  },
};

/** Demo items so every page can be seen without creating anything. Tokens are fixed for links. */
export const DEMO_LINKS = {
  counter: { ownerToken: "demo-counter-owner", shareToken: "demo-counter" },
  project: { ownerToken: "demo-project-owner", shareToken: "demo-project" },
  dashboard: { ownerToken: "demo-dashboard-owner", shareToken: "demo-dashboard" },
} as const satisfies Record<ItemKind, ItemLinks>;

function seedDemo(): void {
  const day = 86400_000;
  const start = Date.UTC(2026, 10, 1);
  store({
    kind: "counter",
    links: DEMO_LINKS.counter,
    item: {
      name: "Chapters drafted",
      unit: "chapters",
      startValue: 0,
      targetValue: 24,
      startedAt: new Date(start).toISOString(),
      deadline: new Date(start + 45 * day).toISOString(),
      status: "active",
      measurements: [0, 2, 3, 5, 8, 9, 11].map((value, index) => ({
        measuredAt: new Date(start + index * 2 * day).toISOString(),
        value,
      })),
      forecast: {
        method: "bayesian_linear",
        completionLow: new Date(start + 26 * day).toISOString(),
        completionMedian: new Date(start + 30 * day).toISOString(),
        completionHigh: new Date(start + 37 * day).toISOString(),
        deadlineProbability: 0.86,
      },
      expiresAfterSeconds: DEFAULT_EXPIRY_SECONDS,
      updatedAt: new Date(start + 12 * day).toISOString(),
    },
  });
  store({
    kind: "project",
    links: DEMO_LINKS.project,
    item: {
      name: "Kitchen renovation",
      definitionOfDone: "Cabinets fitted, worktops sealed, appliances connected and signed off.",
      deliveryTarget: "2027-01-15",
      estimates: [
        { recordedOn: "2026-10-01", low: "2026-12-10", high: "2027-03-01", note: "Before the builder visit." },
        { recordedOn: "2026-10-20", low: "2026-12-20", high: "2027-02-10", note: "Cabinets ordered." },
        { recordedOn: "2026-11-05", low: "2027-01-02", high: "2027-01-28", note: "Worktop template done." },
      ],
      chanceByTarget: 0.55,
      status: "active",
      completedOn: null,
      expiresAfterSeconds: DEFAULT_EXPIRY_SECONDS,
      updatedAt: "2026-11-05T09:00:00.000Z",
    },
  });
  store({
    kind: "dashboard",
    links: DEMO_LINKS.dashboard,
    item: {
      name: "Autumn goals",
      entries: [dashboardEntry(DEMO_LINKS.counter.shareToken), dashboardEntry(DEMO_LINKS.project.shareToken)],
      expiresAfterSeconds: DEFAULT_EXPIRY_SECONDS,
      updatedAt: "2026-11-12T09:00:00.000Z",
    },
  });
}

seedDemo();
