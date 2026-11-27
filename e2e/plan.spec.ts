import type { AppPlanUpdate } from "@haakco/custd-sdk/browser";
import { copyShareUrl, createCounter, expect, routeToFake, test } from "./fixtures";

test("edit plan dependencies and show the same graph to a phone viewer", async ({ page, browser, fake }) => {
  await createCounter(page, "Pages edited", "20");
  await expect(page.getByRole("heading", { name: "Pages edited", exact: true })).toBeVisible();
  await createCounter(page, "Checks passed", "10");
  await expect(page.getByRole("heading", { name: "Checks passed", exact: true })).toBeVisible();
  const checksUrl = await copyShareUrl(page);
  await page.goto("/new/plan");
  await page.getByLabel("Plan name").fill("Launch the new site");
  await page.getByRole("button", { name: "Create plan" }).click();
  await page.getByLabel("Add recent work").selectOption({ label: "Pages edited" });
  await page.getByLabel("Or paste a work link").fill(checksUrl);
  await page.getByRole("button", { name: "Add linked work" }).click();
  await page.getByRole("group", { name: "Checks passed" }).getByLabel("After Pages edited").check();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("0 of 2 required parts complete")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("group", { name: "Checks passed" }).getByLabel("After Pages edited")).toBeChecked();
  await page.getByText("Dependency canvas", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Dependency canvas" }).locator(".react-flow__edge")).toHaveCount(1);

  const url = await copyShareUrl(page);
  const viewer = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await routeToFake(viewer, fake);
    const phone = await viewer.newPage();
    await phone.goto(url);
    await expect(phone.getByText("0 of 2 required parts complete")).toBeVisible();
    await expect(phone.getByText("Previous likely finish was Dec 8, 2026.")).toBeVisible();
    await expect(phone.getByRole("button", { name: "Save plan" })).toHaveCount(0);
    await expect(phone.getByRole("region", { name: "Plan parts" }).getByText("Pages edited", { exact: true }).first()).toBeVisible();
    await phone.getByText("Dependency canvas", { exact: true }).click();
    const canvas = phone.getByRole("region", { name: "Dependency canvas" });
    await expect(canvas.locator(".react-flow__edge")).toHaveCount(1);
    await canvas.getByRole("button", { name: "Zoom In" }).click();
  } finally {
    await viewer.close();
  }
});

test("create dependent plan parts with estimates in place and reuse work from My items", async ({ page, browser, fake }) => {
  await page.goto("/mine");
  await page.getByRole("main").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/No items in your account yet/)).toBeVisible();
  await page.goto("/new/project");
  await page.getByLabel("Project name").fill("Approve pages");
  await page.getByLabel("Done when…").fill("All pages have been approved.");
  await page.getByLabel("Delivery target").fill("2026-12-07");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Approve pages", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "My items", exact: true }).click();
  await page.getByRole("link", { name: "New plan", exact: true }).click();
  await page.getByLabel("Plan name").fill("Editorial launch");
  await page.getByRole("button", { name: "Create plan" }).click();
  for (const part of ["Review draft", "Publish site"]) {
    await page.getByLabel("Part name").fill(part);
    await page.getByLabel("Earliest finish").fill("2026-12-01");
    await page.getByLabel("Latest finish").fill("2026-12-04");
    await page.getByRole("button", { name: "Create project estimate" }).click();
    await expect(page.getByRole("group", { name: part })).toBeVisible();
  }
  await page.getByRole("group", { name: "Publish site" }).getByLabel("After Review draft").check();
  await page.getByLabel("Add from My items").selectOption({ label: "Approve pages" });
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("0 of 3 required parts complete")).toBeVisible();
  const saved = fake.requests.find(({ method, url }) => method === "PATCH" && url.endsWith("/item/plan"));
  expect((JSON.parse(saved?.body ?? "{}") as AppPlanUpdate).parts[2]).not.toHaveProperty("linkToken");
  expect(fake.requests.filter(({ url }) => url.endsWith("/item/estimates"))).toHaveLength(2);
  await page.reload();
  await expect(page.getByRole("group", { name: "Publish site" }).getByLabel("After Review draft")).toBeChecked();
  const planPath = page.url();
  const forecast = page.getByRole("region", { name: "Overall forecast" });
  await expect(forecast.getByText("1 part needs more forecast evidence")).toBeVisible();
  const missingPart = forecast.getByRole("link", { name: "Approve pages" });
  await missingPart.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("summary").filter({ hasText: "Approve pages" })).toBeFocused();
  await page.getByRole("link", { name: "Open project to add an estimate" }).click();
  await page.getByLabel("Earliest (low)").fill("2026-12-03");
  await page.getByLabel("Latest (high)").fill("2026-12-06");
  await page.getByRole("button", { name: "Save estimate" }).click();
  await expect(page.getByText(/Latest estimate:/).first()).toBeVisible();
  await page.goto(planPath);
  await expect(forecast.getByRole("heading", { name: /^Likely done/ })).toBeVisible();

  const shared = await copyShareUrl(page);
  const viewer = await browser.newContext();
  try {
    await routeToFake(viewer, fake);
    const read = await viewer.newPage();
    await read.goto(shared);
    await read.getByText("Publish site", { exact: true }).click();
    await expect(read.getByRole("img", { name: /Publish site: estimates over time/ })).toBeVisible();
    await expect(read.getByRole("button", { name: "Create project estimate" })).toHaveCount(0);
  } finally {
    await viewer.close();
  }
});
