import { expect, test } from "@playwright/test";

test("card library preserves source faces, filters, local fonts and a refreshable route", async ({
  page,
}) => {
  const errors: string[] = [];
  const failed: string[] = [];
  const workerRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    if (/game\.worker|sqlite|\.commander/.test(request.url())) workerRequests.push(request.url());
  });
  await page.goto("./cards");
  await expect(page.getByRole("heading", { level: 1, name: "Card library" })).toBeVisible();
  await expect(page.getByTestId("library-entry")).toHaveCount(15);
  await page.evaluate(() => document.fonts.ready);
  const title = page.getByRole("heading", { name: "Winota, Joiner of Forces", exact: true });
  await expect(title).toHaveCSS("font-family", '"Card Sans", sans-serif');
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(page.locator(".print-card[data-fit]")).toHaveCount(17);
  const symbolImages = await page
    .locator(".pip image")
    .evaluateAll((images) => [...new Set(images.map((image) => image.getAttribute("href")))]);
  expect(symbolImages.length).toBeGreaterThan(0);
  for (const href of symbolImages) {
    expect(href).toMatch(/^(data:image\/|https?:\/\/|\/assets\/)/);
    expect(href).not.toContain("file:");
  }
  const decoded = await page.evaluate(
    async (sources) =>
      Promise.all(
        sources.map(
          (src) =>
            new Promise<boolean>((resolve) => {
              const image = new Image();
              image.onload = () => resolve(image.naturalWidth > 0);
              image.onerror = () => resolve(false);
              image.src = src ?? "";
            }),
        ),
      ),
    symbolImages,
  );
  expect(decoded.every(Boolean)).toBe(true);
  await page.screenshot({ path: "test-results/card-library.png", fullPage: true });
  await expect(page.getByRole("heading", { name: "A design preview" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Source ↗ for Winota, Joiner of Forces" }),
  ).toHaveAttribute("href", /^https:\/\//);
  await page.getByRole("combobox", { name: "Pieces", exact: true }).selectOption("token");
  await expect(page.getByTestId("library-entry")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Pieces", exact: true }).selectOption("all");
  await page.getByRole("searchbox", { name: "Find a card" }).fill("Bofur");
  await expect(page.getByTestId("library-entry")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Concerted Care", exact: true })).toBeVisible();
  await page.getByLabel("Outline titles").check();
  await expect(page.locator(".print-card")).toHaveClass(/text-outline/);
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Find a card" })).toHaveValue("Bofur");
  await expect(page.getByRole("heading", { name: "Concerted Care", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a card" }).fill("no matching fixture");
  await expect(page.getByRole("heading", { name: "No matching cards" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId("library-entry")).toHaveCount(15);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("searchbox", { name: "Find a card" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/card-library-mobile.png", fullPage: true });
  expect(workerRequests).toEqual([]);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test("library navigation returns to the working XR playground in the same document", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./cards");
  await page.evaluate(() => Reflect.set(window, "__cardNavigationProof", "same-document"));
  await page.getByRole("link", { name: "← XR playground", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText("15");
  await expect(page.getByTestId("scene-status")).toHaveText("Scene ready");
  await page.getByRole("link", { name: "Card library", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Card library" })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "__cardNavigationProof"))).toBe(
    "same-document",
  );
  expect(errors).toEqual([]);
});
