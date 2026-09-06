import { defineConfig, devices } from "@playwright/test";

const basePath = process.env.BASE_PATH || "/";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:3010${basePath}`,
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: [
    {
      command: "bunx --no-install vite --host 127.0.0.1 --port 3135",
      url: `http://127.0.0.1:3135${basePath}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "bun run preview",
      url: `http://127.0.0.1:3010${basePath}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "bun run storybook",
      url: "http://127.0.0.1:6010",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
