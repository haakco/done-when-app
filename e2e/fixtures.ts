import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { FAKE_API_PATH, FakeCustd, type FakeCustdOptions } from "./fake-custd";

export const ORIGIN = `http://127.0.0.1:${process.env.E2E_PORT ?? "4173"}`;

/** Sends the discovery file, Custd API and sign-in requests of a context to the fake. */
export async function routeToFake(context: BrowserContext, fake: FakeCustd): Promise<void> {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  for (const pattern of ["**/.well-known/custd.json", `**${FAKE_API_PATH}/**`, "**/__auth/**"]) {
    await context.route(pattern, async (route) => {
      const request = route.request();
      const answer = fake.handle({ method: request.method(), url: request.url(), headers: await request.allHeaders(), body: request.postData() });
      await route.fulfill({ status: answer.status, headers: answer.headers, ...(answer.body === undefined ? {} : { body: answer.body }) });
    });
  }
}

type Fixtures = { fake: FakeCustd; fakeOptions: Partial<FakeCustdOptions> };

export const test = base.extend<Fixtures>({
  fakeOptions: [{}, { option: true }],
  fake: [
    async ({ context, fakeOptions }, provide) => {
      const fake = new FakeCustd({ origin: ORIGIN, ...fakeOptions });
      await routeToFake(context, fake);
      await provide(fake);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

/** Creates a counter from the home page and returns on its owner page. */
export async function createCounter(page: Page, name: string, target: string, history?: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("What are you counting?").fill(name);
  await page.getByRole("spinbutton", { name: "Target", exact: true }).fill(target);
  if (history !== undefined) {
    await page.getByText("More options: unit, start value, past numbers, deadline").click();
    await page.getByLabel("Past numbers (optional)").fill(history);
  }
  await page.getByRole("button", { name: "Create counter" }).click();
  await page.getByRole("heading", { level: 1, name }).waitFor();
}

/** Presses the Share button beside the title and returns the view-only link it copied. */
export async function copyShareUrl(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Share view-only link", exact: true }).click();
  await page.getByText("View-only link copied.").waitFor();
  return page.evaluate(() => navigator.clipboard.readText());
}
