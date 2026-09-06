import { expect, type Page, test } from "@playwright/test";

const basePath = process.env.BASE_PATH || "/";
const devUrl = `http://127.0.0.1:3135${basePath}`;

async function expectReady(page: Page): Promise<void> {
  await expect(page.getByTestId("remaining")).toHaveText("15");
  await expect(page.getByRole("button", { name: "Take 1 1", exact: true })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
}

test("development Strict Mode initializes one durable session in each fresh context", async ({
  browser,
}) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(devUrl);
      await expectReady(page);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test("development SPA remount closes its old session before reopening the same save", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${devUrl}does-not-exist`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  // This route is server-rendered too. Let its client modules settle before
  // clicking the Link, otherwise an unhydrated anchor causes a full navigation.
  await page.waitForLoadState("networkidle");
  const documentStartedAt = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole("link", { name: "Return to the table" }).click();
  await expectReady(page);
  await page.getByRole("button", { name: "Take 1 1", exact: true }).click();
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  const remaining = await page.getByTestId("remaining").textContent();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId("remaining")).toHaveText(remaining ?? "");
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  await expect(page.getByRole("button", { name: "Take 1 1", exact: true })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStartedAt);
  expect(errors).toEqual([]);
});
