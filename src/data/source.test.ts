import { AppItemsClient } from "@haakco/custd-sdk/browser";
import { describe, expect, it } from "vitest";
import { FakeCustd, type FakeCustdOptions } from "../../e2e/fake-custd";
import { toCounter } from "./mappers";
import { createDoneWhenData, explainError } from "./source";

const ORIGIN = "http://127.0.0.1:4173";
const FORECAST = { method: "bayesian_linear_regression", forecastFrom: null } as const;

function setUp(options: Partial<FakeCustdOptions> = {}, userToken?: string) {
  const fake = new FakeCustd({ origin: ORIGIN, ...options });
  const fetchFake: typeof fetch = (input, init) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]));
    const answer = fake.handle({ method: init?.method ?? "GET", url: input instanceof Request ? input.url : input.toString(), headers, body: (init?.body as string | null | undefined) ?? null });
    return Promise.resolve(new Response(answer.status === 204 || answer.status === 304 ? null : (answer.body ?? null), { status: answer.status, headers: answer.headers }));
  };
  const { apiBaseUrl, browserKey } = fake.discovery();
  const items = new AppItemsClient({ apiBaseUrl, siteKey: browserKey, fetch: fetchFake, userToken: () => userToken });
  return { fake, items, data: createDoneWhenData(items) };
}

async function counterRead(items: AppItemsClient, token: string) {
  const read = await items.readItem(token);
  const story = await items.forecastStory(token);
  const run = await items.latestForecast(token).catch(() => null);
  if (read.status !== "modified" || story.status !== "modified") throw new Error("expected data");
  return toCounter(read.data, story.data.observations ?? [], run?.status === "modified" ? run.data : null);
}

const DRAFT = { name: "Pages", unit: "pages", startValue: 0, targetValue: 100, startedAt: "2026-11-01T00:00:00Z", deadline: null, history: [], expiresAfterSeconds: 604800 };

describe("Done When data over the Custd SDK", () => {
  it("creates a counter from CSV history and forecasts it at once", async () => {
    const { data, items } = setUp();
    const history = [10, 20, 30].map((value, day) => ({ measuredAt: `2026-11-0${day + 1}T00:00:00Z`, value }));
    const created = await data.createCounter({ ...DRAFT, history }, FORECAST);
    const counter = await counterRead(items, created.shareToken);
    expect(counter).toMatchObject({ name: "Pages", unit: "pages", role: "share", latestValue: 30, startValue: 10, status: "active" });
    expect(counter.forecast?.completionLow).not.toBeNull();
  });

  it("starts from a single value and waits for three measurements before forecasting", async () => {
    const { data, items, fake } = setUp();
    const created = await data.createCounter(DRAFT, FORECAST);
    expect((await counterRead(items, created.ownerToken)).measurements).toEqual([{ measuredAt: DRAFT.startedAt, value: 0 }]);
    await data.addMeasurements(created.ownerToken, [{ measuredAt: "2026-11-02T00:00:00Z", value: 5 }], FORECAST, 2);
    expect(fake.requests.some((request) => request.url.endsWith("/forecast/runs"))).toBe(false);
  });

  it("completes when a measurement reaches the target and reopens on request", async () => {
    const { data, items } = setUp();
    const created = await data.createCounter(DRAFT, FORECAST);
    const added = await data.addMeasurements(created.ownerToken, [{ measuredAt: "2026-11-02T00:00:00Z", value: 100 }], FORECAST, 2);
    expect(added.targetReached).toBe(true);
    expect((await counterRead(items, created.ownerToken)).status).toBe("completed");
    await data.reopenCounter(created.ownerToken);
    expect((await counterRead(items, created.ownerToken)).status).toBe("active");
  });

  it("reports the batches that landed when a later batch is refused", async () => {
    const { data } = setUp({ maxMeasurements: 1500 });
    const created = await data.createCounter(DRAFT, FORECAST);
    const rows = Array.from({ length: 2000 }, (_, index) => ({ measuredAt: new Date(Date.UTC(2026, 10, 2) + index * 60_000).toISOString(), value: index }));
    const added = await data.addMeasurements(created.ownerToken, rows, FORECAST, 2001);
    expect(added.accepted).toBe(1000);
    expect(explainError(added.failure)).toMatch(/counter is full/);
  });

  it("imports dated estimates in order and reads a dashboard for its download", async () => {
    const { data } = setUp();
    const project = await data.createProject({ name: "Kitchen", definitionOfDone: "Done", deliveryTarget: "2027-01-15T00:00:00Z", expiresAfterSeconds: 604800 });
    const outcome = await data.importEstimates(project.ownerToken, [
      { estimatedAt: "2026-11-01T00:00:00.000Z", low: "2026-12-10T00:00:00.000Z", high: "2027-03-01T00:00:00.000Z", note: "first" },
      { estimatedAt: null, low: "2027-01-02T00:00:00.000Z", high: "2027-01-28T00:00:00.000Z", note: "" },
    ]);
    expect(outcome).toEqual({ landed: 2, refused: 0, failure: null });
    const dashboard = await data.createDashboard({ entryRefs: [project.shareToken], expiresAfterSeconds: 604800 });
    const rows = await data.dashboardRows(dashboard.ownerToken, [{ entryUuid: "e", itemUuid: project.itemUuid }]);
    expect(rows).toMatchObject([{ name: "Kitchen", kind: "project", status: "active", headline: "Likely Jan 2, 2027 – Jan 28, 2027" }]);
  });

  it("refuses writes through a share link with a plain message", async () => {
    const { data } = setUp();
    const created = await data.createCounter(DRAFT, FORECAST);
    const failure = await data.addMeasurements(created.shareToken, [{ measuredAt: "2026-11-02T00:00:00Z", value: 1 }], FORECAST, 2).catch((error: unknown) => error);
    expect(explainError(failure)).toMatch(/view-only link/);
  });

  it("asks a signed-in owner without a verified address to verify it before email alerts", async () => {
    const { data } = setUp({ signedInUsersHaveVerifiedEmail: false }, "user-1");
    const created = await data.createCounter(DRAFT, FORECAST);
    const failure = await data.subscribeEmail(created.ownerToken).catch((error: unknown) => error);
    expect(explainError(failure)).toMatch(/^Verify your email address first/);
  });

  it("refuses a pasted value that is not a link before calling Custd", async () => {
    const { data } = setUp();
    const created = await data.createDashboard({ entryRefs: [], expiresAfterSeconds: 604800 });
    await expect(data.addDashboardEntry(created.ownerToken, "not a link")).rejects.toThrow(/not a Done When link/);
  });
});
