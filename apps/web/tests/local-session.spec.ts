import { expect, type Page, test } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("scene-status")).toHaveText("Scene ready");
  await expect(page.getByRole("button", { name: "Take 1 1", exact: true })).toBeEnabled();
}

test("human and AI commits survive reload and a complete match finishes", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await ready(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByTestId("remaining")).toHaveText("15");
  await page.getByRole("button", { name: "Take 1 1", exact: true }).click();
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  const remaining = await page.getByTestId("remaining").textContent();
  await page.reload();
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  await expect(page.getByTestId("remaining")).toHaveText(remaining ?? "");
  for (let turn = 0; turn < 8; turn++) {
    if ((await page.getByTestId("remaining").textContent()) === "0") break;
    const before = await page.getByTestId("revision").textContent();
    await page.getByRole("button", { name: "Take 1 1", exact: true }).click();
    await expect(page.getByTestId("revision")).not.toHaveText(before ?? "");
    await expect
      .poll(
        async () =>
          (await page.getByTestId("remaining").textContent()) === "0" ||
          (await page.getByRole("button", { name: "Take 1 1", exact: true }).isEnabled()),
      )
      .toBe(true);
  }
  await expect(page.getByTestId("remaining")).toHaveText("0");
  await expect(page.getByText("The opponent took the last token.", { exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});

test("a second tab cannot acquire the database; closing the owner permits retry", async ({
  page,
  context,
}) => {
  await ready(page);
  const second = await context.newPage();
  await second.goto("./");
  await expect(second.getByRole("alert")).toContainText(/already open|another tab/i);
  await page.close();
  await second.reload();
  await expect(second.getByRole("button", { name: "Take 1 1", exact: true })).toBeEnabled();
  await second.close();
});

test("exports, validates and imports a save with explicit replacement", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Take 2 2", exact: true }).click();
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  const value = await page.getByTestId("remaining").textContent();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export save", exact: true }).click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error("Export download was not available.");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText("15");
  await page.locator("input[type=file]").setInputFiles(path);
  await expect(page.getByTestId("remaining")).toHaveText(value ?? "");
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("remaining")).toHaveText(value ?? "");
});

test("cached shell and SQLite resume with external networking blocked", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Take 3 3", exact: true }).click();
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  await expect(page.getByText(/Ready on this device/)).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  await expect(page.getByTestId("scene-status")).toHaveText("Scene ready");
  await page.getByRole("button", { name: "Take 1 1", exact: true }).click();
  await expect(page.getByTestId("revision")).toHaveText("REV 4");
  await page.goto("./does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Return to the table" }).click();
  await expect(page.getByTestId("revision")).toHaveText("REV 4");
});

test("viewport responds to desktop resizing and keyboard input", async ({ page }) => {
  await ready(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        const host = document.querySelector("[data-testid=viewport]");
        if (!canvas || !host) return false;
        return (
          Math.abs(canvas.getBoundingClientRect().width - host.getBoundingClientRect().width) < 2
        );
      }),
    )
    .toBe(true);
  await page.keyboard.press("2");
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  await page.screenshot({ path: "test-results/desktop-table.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Take 1 1", exact: true })).toBeEnabled();
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    )
    .toBe(true);
});
