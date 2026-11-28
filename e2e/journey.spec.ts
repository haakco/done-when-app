import { readFile } from "node:fs/promises";
import { copyShareUrl, createCounter, expect, routeToFake, test } from "./fixtures";

const HISTORY = ["timestamp,value", "2026-11-01T00:00:00Z,10", "2026-11-02T00:00:00Z,20", "2026-11-03T00:00:00Z,30"].join("\n");

test("a refused account settings ticket offers a fresh sign-in on My items", async ({ page }) => {
  await page.route("**/settings/entry/ticket", (route) => route.fulfill({ status: 403 }));
  await page.goto("/mine");
  await page.getByRole("navigation").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Account settings", exact: true }).click();

  const recovery = page.getByRole("status").filter({ hasText: "Account settings could not open" });
  await expect(recovery.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/mine?custd_account=sign_in_again");
  await expect(page).toHaveURL(/\/mine$/);
});

test("create a counter from CSV, share it live, set an alert, then sign in and claim it", async ({ page, browser, fake }) => {
  // The longest journey: two browsers, alerts and a sign-in do not fit the default 30 s on a busy host.
  test.slow();
  await createCounter(page, "Pages written", "100", HISTORY);
  await expect(page.getByText("Likely done")).toBeVisible();
  await expect(page.getByText("10 pages written per day").or(page.getByText("10 per day"))).toBeVisible();
  await expect(page).toHaveURL(/\/edit\/c#[A-Za-z0-9_-]{43}$/);

  // One copy button shares the view-only link.
  const shareUrl = await copyShareUrl(page);
  expect(shareUrl).toMatch(/\/c\/[A-Za-z0-9_-]{43}$/);

  // A second browser opens the share link read-only and sees a new measurement arrive.
  const viewer = await browser.newContext();
  await routeToFake(viewer, fake);
  const viewerPage = await viewer.newPage();
  await viewerPage.goto(shareUrl);
  await expect(viewerPage.getByRole("heading", { level: 1, name: "Pages written" })).toBeVisible();
  await expect(viewerPage.getByRole("progressbar", { name: "Progress to target" })).toHaveAttribute("aria-valuetext", /30 of 100/);
  await expect(viewerPage.getByRole("button", { name: "Add measurement" })).toHaveCount(0);

  await page.getByLabel("New value").fill("55");
  await page.getByRole("button", { name: "Add measurement" }).click();
  await expect(viewerPage.getByRole("progressbar", { name: "Progress to target" })).toHaveAttribute("aria-valuetext", /55 of 100/);
  await expect(viewerPage.getByText(/Latest measurement: 55/)).toBeVisible();
  await viewer.close();

  // Alerts: a rule and a webhook; reaching the target fires it.
  await page.getByText("Alerts", { exact: true }).click();
  await page.getByLabel("Alert me when").selectOption("target_reached");
  await page.getByRole("button", { name: "Add alert" }).click();
  await expect(page.getByRole("button", { name: "Remove alert: The target is reached" })).toBeVisible();
  await page.getByLabel("Webhook URL").fill("https://hooks.example.com/done");
  await page.getByRole("button", { name: "Add webhook" }).click();
  await expect(page.getByRole("button", { name: "Remove webhook https://hooks.example.com/done" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy signing secret" })).toBeVisible();
  await page.getByLabel("New value").fill("100");
  await page.getByRole("button", { name: "Add measurement" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Recent alerts" })).toBeVisible();
  await expect(page.getByText(/webhook · sent/)).toBeVisible();

  // An empty signed-in account still lets the owner recover and claim a device item.
  await page.getByRole("link", { name: "My items" }).click();
  await page.getByRole("main").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/No items in your account yet/)).toBeVisible();
  await expect(page.getByRole("link", { name: "New model" })).toBeVisible();
  await page.getByRole("link", { name: "Pages written" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pages written" })).toBeVisible();
  await page.getByText("Links, expiry and my items").click();
  await page.getByRole("button", { name: "Add to my items" }).click();
  await expect(page.getByText("In your items.")).toBeVisible();
  await page.getByRole("link", { name: "My items" }).click();
  await page.getByRole("link", { name: "Pages written" }).click();
  await expect(page).toHaveURL(/\/edit\/c#item=/);
  await expect(page.getByRole("button", { name: "Add measurement" })).toBeVisible();
});

test("a share link cannot edit, even on the owner page", async ({ page }) => {
  await createCounter(page, "Laps", "10");
  await expect(page.getByText("Forecast coming soon")).toBeVisible();
  await expect(page.getByText(/Add 2 more measurements/)).toBeVisible();
  const shareUrl = await copyShareUrl(page);
  const shareToken = shareUrl.split("/").at(-1) ?? "";
  await page.goto(`/edit/c#${shareToken}`);
  await expect(page.getByRole("heading", { level: 1, name: "Laps" })).toBeVisible();
  await expect(page.getByText(/view-only link/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add measurement" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy owner link" })).toHaveCount(0);
});

test("a project shows its estimates converging on the delivery target", async ({ page }) => {
  await page.goto("/new/project");
  await page.getByLabel("Project name").fill("Kitchen");
  await page.getByLabel("Done when…").fill("Cabinets fitted and signed off.");
  await page.getByLabel("Delivery target").fill("2027-01-15");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("No estimate yet")).toBeVisible();
  for (const [low, high] of [
    ["2026-12-10", "2027-03-01"],
    ["2027-01-02", "2027-01-28"],
  ] as const) {
    await page.getByLabel("Earliest (low)").fill(low);
    await page.getByLabel("Latest (high)").fill(high);
    await page.getByRole("button", { name: "Save estimate" }).click();
    await expect(page.getByLabel("Earliest (low)")).toHaveValue("");
  }
  await expect(page.getByText("Likely Jan 2, 2027 – Jan 28, 2027")).toBeVisible();
  await expect(page.getByText(/chance by the Jan 15, 2027 target/)).toBeVisible();
  await expect(page.getByText(/days earlier than last time/)).toBeVisible();
  await expect(page.getByRole("figure", { name: "Estimate convergence" })).toBeVisible();
});

test("a dashboard adds and removes an item", async ({ page }) => {
  await createCounter(page, "Chapters", "24");
  const shareUrl = await copyShareUrl(page);
  await page.goto("/new/dashboard");
  await page.getByRole("button", { name: "Create dashboard" }).click();
  await expect(page.getByText("Nothing here yet.", { exact: false })).toBeVisible();
  await page.getByLabel("Paste its link").fill(shareUrl);
  await page.getByRole("button", { name: "Add to dashboard" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Chapters" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Chapters from the dashboard" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Chapters" })).toHaveCount(0);
});

test("bad CSV rows are listed by line and nothing is created", async ({ page, fake }) => {
  await page.goto("/new/counter");
  await page.getByLabel("What are you counting?").fill("Bad import");
  await page.getByRole("spinbutton", { name: "Target", exact: true }).fill("5");
  await page.getByLabel("Past numbers (optional)").fill("2026-11-01T00:00:00Z,1\nnot-a-date,2");
  await page.getByRole("button", { name: "Create counter" }).click();
  await expect(page.getByText("Line 2: “not-a-date” is not a date")).toBeVisible();
  await expect(page).toHaveURL(/\/new\/counter$/);
  expect(fake.requests.filter((request) => request.method === "POST")).toHaveLength(0);
});

test("a missing link and an unknown page say what to do", async ({ page }) => {
  await page.goto(`/p/${"x".repeat(43)}`);
  await expect(page.getByRole("heading", { name: "This item is not here" })).toBeVisible();
  await page.goto("/no/such/page");
  await expect(page.getByRole("heading", { name: "Not done, not found" })).toBeVisible();
});

test("owner tokens never reach a URL path or query", async ({ page, fake }) => {
  await createCounter(page, "Private", "3");
  const ownerToken = new URL(page.url()).hash.slice(1);
  expect(fake.requests.some((request) => request.url.includes(ownerToken))).toBe(false);
});

test("the owner link notice shows once and the item is listed as recent on this device", async ({ page }) => {
  await createCounter(page, "Push-ups", "100");
  await expect(page.getByRole("heading", { name: "Save your owner link" })).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Push-ups" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Save your owner link" })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recent on this device" })).toBeVisible();
  await page.getByRole("link", { name: "Push-ups" }).click();
  await expect(page.getByRole("button", { name: "Add measurement" })).toBeVisible();
});

test("start a model with one estimate from home", async ({ page }) => {
  await page.goto("/");
  const starter = page.getByLabel("Start with one estimate");
  await starter.fill("Monthly hosting: 800 to 500");
  await page.getByRole("button", { name: "Start model" }).click();
  await expect(starter).toHaveAttribute("aria-invalid", "true");
  await expect(starter).toHaveAccessibleDescription(/low end.*below the high end/);
  await starter.fill("Monthly hosting: 500 to 800");
  await starter.press("Enter");
  await expect(page.getByRole("heading", { name: "Monthly hosting" })).toBeVisible();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
  await page.getByText("Edit quantities", { exact: true }).click();
  await expect(page.getByLabel("Value", { exact: true })).toHaveValue("500 to 800");
});

test("an owner runs a model and shares the results with a viewer and dashboard", async ({ page, browser, fake }) => {
  await page.goto("/new/model");
  await page.getByLabel("What are you working out?").fill("Monthly cost");
  await page.getByRole("button", { name: "Create model" }).click();
  await expect(page.getByText("Add quantities below, then run the model.")).toBeVisible();
  for (const [index, [name, value]] of [["hours", "5 to 10"], ["rate", "3"], ["total", "=hours * rate"]].entries()) {
    await page.getByRole("button", { name: "Add quantity" }).click();
    await page.getByLabel("Name", { exact: true }).nth(index).fill(name ?? "");
    await page.getByLabel("Value", { exact: true }).nth(index).fill(value ?? "");
  }
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Version 1")).toBeVisible();
  await page.locator("summary", { hasText: /^Alerts$/ }).click();
  await page.getByLabel("Model output", { exact: true }).selectOption("total");
  await page.getByLabel("Alert threshold", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Add alert", exact: true }).click();
  await expect(page.getByText("total: 95th percentile rises above 20", { exact: true })).toBeVisible();
  await page.getByText("Run with a decision", { exact: true }).click();
  await page.getByLabel("Decision threshold").fill("20");
  const decisionRun = page.waitForRequest((request) =>
    request.method() === "POST" && request.url().endsWith("/api/v1/app/models/runs"));
  await page.getByRole("button", { name: "Run decision analysis" }).click();
  const runPayload: unknown = (await decisionRun).postDataJSON();
  expect(runPayload).toMatchObject({
    sensitivityOutput: "total", decision: { output: "total", threshold: 20, valuePerUnit: 1 },
  });
  await expect(page.getByText("total: about 22.5")).toBeVisible();
  const modelOwnerUrl = page.url();
  const shareUrl = await copyShareUrl(page);
  const viewer = await browser.newContext();
  try {
    await routeToFake(viewer, fake);
    const viewerPage = await viewer.newPage();
    await viewerPage.goto(shareUrl);
    await expect(viewerPage.getByRole("figure", { name: "total range" })).toBeVisible();
    await expect(viewerPage.getByText("total: about 22.5")).toBeVisible();
    await expect(viewerPage.getByRole("heading", { name: "Owner tools" })).toHaveCount(0);
    await expect(viewerPage.getByRole("button", { name: "Run model" })).toHaveCount(0);
    await viewerPage.getByText("Try other values", { exact: true }).click();
    await viewerPage.getByLabel("rate", { exact: true }).fill("8");
    await viewerPage.getByRole("button", { name: "Calculate", exact: true }).click();
    await expect(viewerPage.getByText(/60 \(90%:/)).toBeVisible();
    await expect(viewerPage.getByText("total: about 22.5")).toBeVisible();
    await viewerPage.locator("summary", { hasText: "Download" }).click();
    const summaryDownload = viewerPage.waitForEvent("download");
    await viewerPage.getByRole("button", { name: "Run summary CSV" }).click();
    const summary = await summaryDownload;
    expect(summary.suggestedFilename()).toMatch(/run-summary.*\.csv$/);
    const csv = await readFile(await summary.path(), "utf8");
    expect(csv).toContain("quantity,unit,mean,std_dev,p5,p25,p50,p75,p95,error");
    expect(csv).toContain("total,,22.5,");
    await viewerPage.getByRole("button", { name: "Copy embed link" }).click();
    await expect(viewerPage.getByText("Copied.", { exact: true })).toBeVisible();
    const embedUrl = await viewerPage.evaluate(() => navigator.clipboard.readText());
    expect(new URL(embedUrl).pathname).toMatch(/^\/embed\/model\//);
    await viewerPage.goto(embedUrl);
    await expect(viewerPage.getByRole("main").getByRole("heading", { name: "Monthly cost", exact: true })).toBeVisible();
    await expect(viewerPage.getByText("total: about 22.5")).toBeVisible();
    await expect(viewerPage.getByRole("navigation")).toHaveCount(0);
    await expect(viewerPage.getByRole("button", { name: "Run model" })).toHaveCount(0);
  } finally {
    await viewer.close();
  }
  await page.goto("/new/dashboard");
  await page.getByLabel("Links to show (optional)").fill(shareUrl);
  await page.getByRole("button", { name: "Create dashboard" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Monthly cost" })).toBeVisible();
  await expect(page.getByText(/total: about 22\.5/)).toBeVisible();

  await createCounter(page, "Pages read", "100", HISTORY);
  const counterLink = await copyShareUrl(page);

  await page.goto(modelOwnerUrl);
  await page.getByText("Link a counter forecast", { exact: true }).click();
  await page.getByLabel("Input quantity").selectOption("rate");
  await page.getByLabel("Counter link").fill(counterLink);
  await page.getByLabel("Forecast value").selectOption("rate_per_day");
  const versionRequest = page.waitForRequest((request) =>
    request.method() === "POST" && request.url().endsWith("/api/v1/app/item/model/versions"));
  await page.getByRole("button", { name: "Save linked input" }).click();
  const payload: unknown = (await versionRequest).postDataJSON();
  expect(payload).toMatchObject({
    counterLinks: [new URL(counterLink).pathname.split("/").at(-1)],
    quantities: expect.arrayContaining([{
      name: "rate",
      kind: "input",
      input: { shape: "bound", source: { kind: "counter_forecast", projectUuid: expect.any(String), field: "rate_per_day" } },
    }]),
  });
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await expect(page.getByText("total: about 22.5")).toBeVisible();
  await page.getByRole("button", { name: "Copy model" }).click();
  await expect(page.getByRole("heading", { name: "Copy of Monthly cost" })).toBeVisible();
  expect(page.url()).not.toEqual(modelOwnerUrl);
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
});

test("the landing forecast can be tried on a phone without creating an item", async ({ page, fake }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const example = page.getByRole("region", { name: "Write 100 pages" });
  const chart = example.getByRole("figure", { name: "Example forecast" });
  await expect(example.getByRole("progressbar", { name: "Example progress" })).toHaveAttribute("aria-valuetext", /37 of 100/);
  await example.getByRole("button", { name: "Try adding 24 pages" }).press("Enter");
  await expect(example.getByRole("progressbar", { name: "Example progress" })).toHaveAttribute("aria-valuetext", /61 of 100/);
  await expect(example.getByRole("status").filter({ hasText: "Forecast moved" })).toContainText("Forecast moved 3 days earlier");
  await expect(chart).toHaveAttribute("data-forecast-motion", "still");
  expect(fake.requests.filter((request) => request.method === "POST")).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Create counter", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("the forecast chart has a named key and a keyboard measurement inspector", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("What are you counting?").fill("Read the chart");
  await page.getByRole("spinbutton", { name: "Target", exact: true }).fill("100");
  await page.getByText("More options: unit, start value, past numbers, deadline").click();
  await page.getByLabel("Past numbers (optional)").fill(HISTORY);
  await page.getByLabel("Deadline", { exact: true }).fill("2026-11-05");
  await page.getByRole("button", { name: "Create counter" }).click();
  await expect(page.getByText(/1% chance by the Nov 5, 2026 deadline/)).toBeVisible();
  const figure = page.getByRole("figure", { name: "Forecast chart", exact: true });
  const key = figure.getByRole("list", { name: "Chart key" });
  for (const label of ["Actual measurements", "Projected progress", "90% forecast range", "Target", "Deadline"]) {
    await expect(key.getByText(label, { exact: true })).toBeVisible();
  }
  await page.getByText("Inspect measurements", { exact: true }).press("Enter");
  const inspector = page.getByRole("slider", { name: "Measurement 3 of 3" });
  await expect(inspector).toHaveAttribute("aria-valuetext", /Nov 3, 2026: 30/);
  await inspector.press("ArrowLeft");
  await expect(page.getByRole("slider", { name: "Measurement 2 of 3" })).toHaveAttribute("aria-valuetext", /Nov 2, 2026: 20/);
  const shareUrl = await copyShareUrl(page);
  await page.getByLabel("New value").fill("100");
  await page.getByRole("button", { name: "Add measurement" }).click();
  await expect(page.getByRole("region", { name: "Summary" })).toContainText("Target reached");
  await page.goto(shareUrl);
  await expect(page.getByRole("region", { name: "Summary" })).toContainText("Target reached");
  await expect(page.getByRole("button", { name: "Add measurement" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("forecast controls keep the selected dates when a live measurement moves the projection", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createCounter(page, "Chart controls", "100", HISTORY);
  const chart = page.getByRole("figure", { name: "Forecast chart", exact: true });
  const range = chart.getByText(/^Showing /);
  const full = await range.textContent();
  await chart.getByRole("button", { name: "Zoom in" }).press("Enter");
  await expect(range).not.toHaveText(full ?? "");
  const zoomed = await range.textContent();
  await chart.getByRole("img").hover();
  await page.mouse.wheel(120, 0);
  await expect(range).not.toHaveText(zoomed ?? "");
  const panned = await range.textContent();
  await page.getByLabel("New value").fill("55");
  await page.getByRole("button", { name: "Add measurement" }).click();
  await expect(page.getByRole("progressbar", { name: "Progress to target" })).toHaveAttribute("aria-valuetext", /55 of 100/);
  await expect(range).toHaveText(panned ?? "");
  const reset = chart.getByRole("button", { name: "All dates" });
  await reset.click();
  await expect(reset).toBeDisabled();
  await expect(range).not.toHaveText(panned ?? "");
});

test("one shared workspace follows a counter, a project estimate and a meeting", async ({ page, browser, fake }) => {
  test.slow();
  await createCounter(page, "Launch checks", "10");
  const counter = page.url();

  await page.getByRole("link", { name: "My items", exact: true }).click();
  const create = page.getByRole("navigation", { name: "Create workspace items" });
  await create.getByRole("link", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Release plan");
  await page.getByLabel("Done when…").fill("The new version is running.");
  await page.getByLabel("Delivery target").fill("2027-01-15");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Release plan" })).toBeVisible();
  await page.getByLabel("Earliest (low)").fill("2027-01-10");
  await page.getByLabel("Latest (high)").fill("2027-01-18");
  await page.getByRole("button", { name: "Save estimate" }).click();
  await expect(page.getByText("Likely Jan 10, 2027 – Jan 18, 2027")).toBeVisible();

  await page.getByRole("link", { name: "My items", exact: true }).click();
  await create.getByRole("link", { name: "New meeting" }).click();
  await page.getByLabel("Meeting name").fill("Release review");
  await page.getByLabel("Block 1 title").fill("Review risks");
  await page.getByLabel("Minutes").fill("10");
  await page.getByRole("button", { name: "Create meeting" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Release review" })).toBeVisible();
  const meeting = page.url();

  await page.getByRole("link", { name: "My items", exact: true }).click();
  await create.getByRole("link", { name: "New dashboard" }).click();
  await page.getByRole("button", { name: "Create dashboard" }).click();
  const picker = page.getByLabel("Choose a recent item");
  for (const [name, kind] of [["Launch checks", "counter"], ["Release plan", "project"], ["Release review", "meeting"]] as const) {
    await picker.selectOption({ label: `${name} (${kind})` });
    await page.getByRole("button", { name: "Add selected item" }).click();
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }

  const url = await copyShareUrl(page);
  const viewer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await routeToFake(viewer, fake);
    const view = await viewer.newPage();
    await view.goto(url);
    const items = view.getByRole("list", { name: "Dashboard items" });
    await expect(items.getByRole("heading")).toHaveText(["Launch checks", "Release plan", "Release review"]);
    await expect(items.getByText("Likely Jan 10, 2027 – Jan 18, 2027")).toBeVisible();
    await expect(view.getByRole("button", { name: /^(Add selected item|Remove|Start meeting)/ })).toHaveCount(0);

    await page.goto(counter);
    await page.getByLabel("New value").fill("3");
    await page.getByRole("button", { name: "Add measurement" }).click();
    await expect(items.getByRole("progressbar", { name: "Launch checks progress" })).toHaveAttribute("aria-valuetext", /3 of 10/);
    await page.goto(meeting);
    await page.getByRole("button", { name: "Start meeting" }).click();
    await expect(items.getByText("Review risks", { exact: false })).toBeVisible();
  } finally {
    await viewer.close();
  }
});

test("a signed-in member stays signed in when Done When opens in a new tab", async ({ page, context }) => {
  await page.goto("/mine");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const second = await context.newPage();
  await second.goto("/mine");
  await expect(second.getByRole("button", { name: "Sign out" })).toBeVisible();
});
