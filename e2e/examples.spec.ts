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
      const revisedDeadline = await deadline.innerText();
      const revisedFinish = await finish.innerText();
      await activate(page.getByRole("link", { name: "See the sample dashboard" }));
      await expect(page.getByText(revisedFinish, { exact: true })).toBeVisible();
      await expect(page.getByText(revisedDeadline, { exact: true })).toBeVisible();
      await activate(page.getByRole("link", { name: "Try the launch plan" }));
      await expect(finish).toHaveText(revisedFinish);
      await activate(page.getByText("How the simulation works", { exact: true }));
      await activate(page.getByRole("link", { name: "Forecasting guide" }));
      await expect(page).toHaveURL(/\/help\/forecasting/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.goBack();
      await activate(page.getByRole("link", { name: "Start a plan", exact: true }));
      await expect(page.getByLabel("Plan name")).toBeVisible();

      await page.goto("/");
      await openFromHome(meeting);
      await activate(page.getByRole("button", { name: "Start sample meeting" }));
      await activate(page.getByRole("button", { name: "Finish check-in after 3 min" }));
      await expect(page.getByText(/Check-in finished 2:00 early/)).toBeVisible();
      await activate(page.getByRole("button", { name: "Run decisions to 7 min" }));
      await expect(page.getByRole("timer")).toContainText("Over");
      await activate(page.getByRole("button", { name: "Finish decisions and confirm the timing" }));
      await expect(page.getByText(/1:00 removed from 1 upcoming block/)).toBeVisible();
      await activate(page.getByRole("button", { name: "Finish follow-up after 5 min" }));
      await expect(page.getByRole("heading", { name: "Meeting history" })).toBeVisible();
      await activate(page.getByRole("button", { name: "Show read-only view" }));
      await expect(page.getByRole("button", { name: "Reset sample meeting" })).toHaveCount(0);
      await activate(page.getByRole("link", { name: "Finish editing the remaining pages" }));
      await expect(page).toHaveURL(/\/examples\/plan\?meetingStep=5#example-part-pages$/);
      await expect(page.locator("#example-part-pages")).toHaveAttribute("open", "");
      await page.goBack();
      await activate(page.getByRole("link", { name: "Use this agenda" }));
      await expect(page).toHaveURL(/\/new\/meeting\?example=launch-review$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await page.goto("/");
      await activate(page.getByRole("link", { name: "See the sample dashboard" }));
      await expect(page.getByRole("heading", { name: "Website launch dashboard" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Launch the new site" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible();
      await activate(page.getByRole("link", { name: "Try the project estimate" }));
      await activate(page.getByRole("button", { name: "Confirm the test slot" }));
      await expect(page.getByText(/range narrowed from/i)).toBeVisible();
      await activate(page.getByRole("button", { name: "Reset estimate" }));
      await expect(page.getByText(/range narrowed from/i)).toHaveCount(0);
      await page.goBack();
      await activate(page.getByRole("link", { name: "Try the cost model" }));
      await activate(page.getByRole("button", { name: "Use the printer’s quote" }));
      await expect(page.getByText("Between $410 and $530")).toBeVisible();
      await expect(page.getByText(/Delivery now has the wider range/)).toBeVisible();
      await activate(page.getByRole("button", { name: "Reset quote" }));
      await expect(page.getByText("Between $350 and $650")).toBeVisible();
      expect(writes).toEqual([]);
      expect(fake.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
    });
  });
}
