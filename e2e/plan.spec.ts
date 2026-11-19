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

test("the launch example previews a forecast and runs a meeting without writes", async ({ page, fake }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByText("Try the launch plan", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Launch the new site" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Likely done Dec 11, 2026" })).toBeVisible();
  await page.getByRole("button", { name: "Preview 25 pages edited" }).click();
  await expect(page.getByRole("heading", { name: "Likely done Dec 7, 2026" })).toBeVisible();
  await expect(page.getByText(/Deadline chance rose from 4% to 99%/)).toBeVisible();
  await page.getByText("Dependency canvas", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Dependency canvas" }).locator(".react-flow__edge")).toHaveCount(2);
  await page.getByRole("button", { name: "Start sample meeting" }).click();
  await page.getByRole("button", { name: "Finish review after 3 min" }).click();
  await expect(page.getByRole("timer", { name: "Sample meeting elapsed" })).toHaveText("3:00 elapsed");
  await expect(page.getByText(/7 min left \(originally 5\)/)).toBeVisible();
  await page.getByRole("button", { name: "Finish decisions after 8 min" }).click();
  await expect(page.getByText("Planned 10 min. Took 11 min. Finished 1 min late.")).toBeVisible();
  expect(fake.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
});
