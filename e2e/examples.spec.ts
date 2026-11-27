import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

for (const device of ["desktop", "phone"] as const) {
  test.describe(device, () => {
    test.use(device === "phone"
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } });

    test("anonymous visitors can try planning and meetings without writes", async ({ page, fake }) => {
      const writes: string[] = [];
      page.on("request", (request) => {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.method());
      });
      const activate = async (control: Locator) => {
        if (device === "phone") {
          await control.tap();
        } else {
          await control.focus();
          await expect(control).toBeFocused();
          await page.keyboard.press("Enter");
        }
      };

      await page.goto("/");
      const plan = page.getByRole("link", { name: "Try the launch plan" });
      const meeting = page.getByRole("link", { name: "Try a sample meeting" });
      await expect(plan).toBeInViewport();
      await expect(meeting).toBeInViewport();
      const openFromHome = async (link: Locator) => {
        if (device === "desktop") {
          for (let index = 0; index < 15 && await link.evaluate((element) => document.activeElement !== element); index++) {
            await page.keyboard.press("Tab");
          }
          await expect(link).toBeFocused();
          await page.keyboard.press("Enter");
        } else {
          await link.tap();
        }
      };
      await openFromHome(plan);
      const finish = page.getByRole("heading", { name: /Likely done/ }).first();
      await expect(finish).toBeVisible();
      const originalFinish = await finish.innerText();
      const range = page.getByText(/^90% forecast range/);
      const deadline = page.getByText(/^\d+% chance by/);
      const originalRange = await range.innerText();
      const originalDeadline = await deadline.innerText();
      await activate(page.getByText("Simulated finish dates", { exact: true }));
      const dates = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Finish date" }) });
      const originalDates = await dates.innerText();
      await activate(page.getByRole("button", { name: "Allow 3–5 days for sign-off" }));
      await expect(finish).not.toHaveText(originalFinish);
      await expect(range).not.toHaveText(originalRange);
      await expect(deadline).not.toHaveText(originalDeadline);
      await expect(dates).not.toHaveText(originalDates);
      await expect(page.getByRole("status").filter({ hasText: /deadline/i })).toBeVisible();
      await activate(page.getByRole("link", { name: "Forecasting guide" }));
      await expect(page).toHaveURL(/\/help\/forecasting/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.goBack();
      await activate(page.getByRole("link", { name: "Start a plan", exact: true }));
      await expect(page.getByLabel("Plan name")).toBeVisible();

      await page.goto("/");
      await openFromHome(meeting);
      await activate(page.getByRole("button", { name: "Start sample meeting" }));
      await activate(page.getByRole("button", { name: "Finish review after 3 min" }));
      await expect(page.getByText(/Review finished 2 min early/)).toBeVisible();
      await activate(page.getByRole("button", { name: "Run decisions to 8 min" }));
      await expect(page.getByRole("region", { name: /decide/i }).getByText(/Projected finish.*11 min/i)).toBeVisible();
      await activate(page.getByRole("button", { name: "Finish sample meeting" }));
      await expect(page.getByText(/Planned 10 min.*Took 11 min/i)).toBeVisible();
      await activate(page.getByRole("button", { name: "Show read-only view" }));
      await expect(page.getByRole("button", { name: "Reset sample meeting" })).toHaveCount(0);
      await activate(page.getByRole("link", { name: "Finish editing the remaining pages" }));
      await expect(page).toHaveURL(/\/examples\/plan#example-part-pages$/);
      await expect(page.locator("#example-part-pages")).toHaveAttribute("open", "");
      await page.goBack();
      await activate(page.getByRole("link", { name: "Start your own meeting" }));
      await expect(page).toHaveURL(/\/new\/meeting$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await page.goto("/");
      await activate(page.getByRole("link", { name: "See the sample dashboard" }));
      await expect(page.getByRole("heading", { name: "Website launch dashboard" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Launch the new site" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible();
      expect(writes).toEqual([]);
      expect(fake.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
    });
  });
}
