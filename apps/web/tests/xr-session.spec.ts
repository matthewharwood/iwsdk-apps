import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type {} from "./xr-emulator";

const fixturePath = fileURLToPath(new URL("../.generated/xr-emulator.js", import.meta.url));

test("offline emulated XR accepts controller input, exits in-world and re-enters the same saved game", async ({
  page,
  context,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) =>
    failures.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  await page.addInitScript({ path: fixturePath });
  await page.goto("./");
  await expect(page.getByTestId("scene-status")).toHaveText("Scene ready");
  await expect(page.getByTestId("remaining")).toHaveText("15");
  await expect(page.getByText(/Ready on this device/)).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // First XR entry happens offline: controller models must be local cached assets.
  await context.setOffline(true);
  await expect(page.getByRole("button", { name: "Enter VR", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Enter VR", exact: true }).click();
  await expect(page.getByTestId("scene-status")).toHaveText("Immersive VR");
  await page.evaluate(() => window.__xrTest.frames(5));
  const first = await page.evaluate(() => window.__xrTest.status());
  expect(first.active).toBe(true);
  expect(first.hasCanvas).toBe(true);
  expect(first.width).toBeGreaterThan(0);
  expect(first.height).toBeGreaterThan(0);
  expect(first.inputs).toBeGreaterThan(0);

  // Coordinates match the authored TAKE 2 plane. This traverses IWSDK's real
  // controller ray / Pressed component path, then the durable command boundary.
  await page.evaluate(() => window.__xrTest.selectAt({ x: 0, y: 0.77, z: -0.35 }));
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  await expect(page.getByTestId("remaining")).toHaveText("12");

  await page.evaluate(() => window.__xrTest.exitAt({ x: 0.52, y: 0.78, z: -0.075 }));
  await expect(page.getByTestId("scene-status")).toHaveText("Scene ready");
  await expect(page.getByTestId("remaining")).toHaveText("12");
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  await expect(page.locator("[data-testid=viewport] canvas")).toBeVisible();
  await page.getByRole("button", { name: "Enter VR", exact: true }).click();
  await expect(page.getByTestId("scene-status")).toHaveText("Immersive VR");
  await page.evaluate(() => window.__xrTest.frames(5));
  await expect(page.getByTestId("remaining")).toHaveText("12");
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
  await page.screenshot({ path: "test-results/xr-emulator-table.png" });
  await page.evaluate(() => window.__xrTest.end());
  await expect(page.getByTestId("scene-status")).toHaveText("Scene ready");
  expect(failures).toEqual([]);
});

test("ordinary browsers keep the complete desktop game when no XR device is present", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", { configurable: true, value: undefined });
  });
  await page.goto("./");
  await expect(page.getByTestId("scene-status")).toHaveText("Scene ready");
  await expect(
    page.getByRole("button", { name: "VR headset not detected", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Take 1 1", exact: true }).click();
  await expect(page.getByTestId("revision")).toHaveText("REV 2");
});
