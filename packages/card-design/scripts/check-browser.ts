import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
console.log("Preparing card design browser proof");
const server = await createServer({
  configFile: false,
  root,
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
let browser: Browser | undefined;
try {
  await server.listen();
  console.log("Card design proof server is ready");
  const address = server.httpServer?.address();
  assert(address && typeof address !== "string", "Missing proof server address");
  browser = await chromium.launch();
  console.log("Chromium is ready");
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1.5,
  });
  page.setDefaultTimeout(15_000);
  const errors: string[] = [];
  const failedAssets: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  page.on("response", (response) => {
    if (!response.ok()) failedAssets.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript(() => {
    const Native = ResizeObserver;
    Reflect.set(window, "__cardObserverCount", 0);
    window.ResizeObserver = class extends Native {
      active = true;
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        Reflect.set(
          window,
          "__cardObserverCount",
          Number(Reflect.get(window, "__cardObserverCount")) + 1,
        );
      }
      override disconnect() {
        super.disconnect();
        if (this.active) {
          this.active = false;
          Reflect.set(
            window,
            "__cardObserverCount",
            Number(Reflect.get(window, "__cardObserverCount")) - 1,
          );
        }
      }
    };
  });
  await page.goto(`http://127.0.0.1:${address.port}/browser/`, { waitUntil: "networkidle" });
  console.log("Card design proof page loaded");
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() =>
    [...document.fonts]
      .filter((font) => font.status === "loaded")
      .map((font) => ({ family: font.family, weight: font.weight, style: font.style })),
  );
  assert(fonts.some((font) => font.family === "Card Sans" && font.style === "normal"));
  assert(fonts.some((font) => font.family === "Card Sans" && font.style === "italic"));
  for (const weight of ["100", "400", "700"])
    assert(fonts.some((font) => font.family === "Card Mono" && font.weight === weight));
  await page.waitForFunction(
    () => document.querySelectorAll(".print-card[data-fit]").length === 19,
  );
  const geometry = await page.locator(".print-card").evaluateAll((cards) =>
    cards.map((card) => {
      const title = card.querySelector<HTMLElement>(".card-name");
      const rules = card.querySelector<HTMLElement>(".card-rules");
      const slash = card.querySelector<HTMLElement>(".stats-slash");
      const stats = card.querySelector<HTMLElement>(".card-stats");
      if (!title || !rules) throw new Error("Missing card information hierarchy");
      return {
        id: card.getAttribute("data-face-id"),
        width: card.getBoundingClientRect().width,
        fit: card.getAttribute("data-fit"),
        titleFont: getComputedStyle(title).fontFamily,
        titlePx: Number.parseFloat(getComputedStyle(title).fontSize),
        rulesPx: Number.parseFloat(getComputedStyle(rules).fontSize),
        slashWeight: slash ? getComputedStyle(slash).fontWeight : null,
        statsPx: stats?.textContent ? Number.parseFloat(getComputedStyle(stats).fontSize) : null,
      };
    }),
  );
  assert.equal(geometry.length, 19);
  for (const card of geometry) {
    assert.equal(card.width, 240);
    assert.equal(card.titlePx, 24);
    assert(card.titleFont.includes("Card Sans"));
    assert(card.rulesPx >= 9.33 && card.rulesPx <= 12.67);
    if (card.slashWeight !== null) assert.equal(card.slashWeight, "100");
    if (card.statsPx !== null) assert(Math.abs(card.statsPx - (17 * 4) / 3) < 0.01);
  }
  assert.equal(geometry.find((card) => card.id === "dense-front")?.fit, "expanded");
  assert.equal(await page.locator('[data-face-id="dense-front"] .card-rules p').count(), 18);
  assert((await page.locator(".highlight-layer rect").count()) > 0);
  assert(
    (await page.locator('[data-face-id="annotation-front"]').innerText()).includes("<script>"),
  );
  assert.equal(await page.locator("script:not([src])").count(), 0);
  assert.equal(
    await page
      .locator('[data-face-id="annotation-front"] mark .ability-punctuation')
      .filter({ hasText: "-" })
      .count(),
    0,
  );
  const alignment = await page.locator(".phase-track").evaluateAll((tracks) =>
    tracks.flatMap((track) => {
      const left = track.getBoundingClientRect().left;
      const labels = [...track.querySelectorAll(".phase")];
      return [...track.querySelectorAll(".phase-dot")].map((dot, index) => {
        const label = labels[index]?.getBoundingClientRect();
        return label
          ? Math.abs(Number(dot.getAttribute("cx")) - (label.left + label.width / 2 - left))
          : Number.POSITIVE_INFINITY;
      });
    }),
  );
  assert(alignment.every((delta) => delta < 0.6));
  const output = resolve(root, "test-results");
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, "card-proof.png"), fullPage: true });
  assert.equal(await page.evaluate(() => Reflect.get(window, "__cardObserverCount")), 19);
  await page.getByRole("button", { name: "Unmount cards" }).click();
  await page.waitForFunction(() => Reflect.get(window, "__cardObserverCount") === 0);
  await page.setViewportSize({ width: 900, height: 800 });
  await page.getByRole("button", { name: "Mount cards" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".print-card[data-fit]").length === 19,
  );
  assert.equal(await page.evaluate(() => Reflect.get(window, "__cardObserverCount")), 19);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedAssets, []);
  console.log(
    JSON.stringify(
      {
        cards: geometry.length,
        strictModeCleanup: "passed",
        geometry,
        screenshot: resolve(output, "card-proof.png"),
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await server.close();
}
