import { copyShareUrl, createCounter, expect, routeToFake, test } from "./fixtures";

const HISTORY = ["timestamp,value", "2026-11-01T00:00:00Z,10", "2026-11-02T00:00:00Z,20", "2026-11-03T00:00:00Z,30"].join("\n");

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

  // Sign in from the owner page and keep the counter in My items.
  await page.getByText("Links, expiry and my items").click();
  await page.getByRole("main").getByRole("button", { name: "Sign in", exact: true }).click();
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
  await page.getByLabel("Target").fill("5");
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

test("a model is built, run and shown on a dashboard", async ({ page }) => {
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
  await page.getByRole("button", { name: "Run model" }).click();
  await expect(page.getByText("total: about 22.5")).toBeVisible();
  const shareUrl = await copyShareUrl(page);
  await page.goto("/new/dashboard");
  await page.getByLabel("Links to show (optional)").fill(shareUrl);
  await page.getByRole("button", { name: "Create dashboard" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Monthly cost" })).toBeVisible();
  await expect(page.getByText(/total: about 22\.5/)).toBeVisible();
});
