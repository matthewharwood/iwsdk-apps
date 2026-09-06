import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { type Browser, chromium, expect } from "@playwright/test";

// This isolated test never installs a CA or changes application trust policy.
// Port 3145 stays separate from the ordinary dev/preview/Storybook test servers.
const directory = await mkdtemp(join(tmpdir(), "iwsdk-quest-dev-"));
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const cert = join(directory, "cert.pem");
const key = join(directory, "key.pem");
let browser: Browser | undefined;
let server: ReturnType<typeof Bun.spawn> | undefined;
let serverOutput = "";

try {
  const certificate = Bun.spawn(
    [
      "openssl",
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  if ((await certificate.exited) !== 0)
    throw new Error(
      `Could not create the disposable TLS certificate: ${await new Response(certificate.stderr).text()}`,
    );
  const serverEnvironment = { ...process.env };
  delete serverEnvironment.NO_COLOR;
  server = Bun.spawn(
    [
      "node",
      join(appRoot, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "3145",
    ],
    {
      cwd: appRoot,
      // Exercise colored CI output even when this smoke runs in a plain local pipe.
      env: {
        ...serverEnvironment,
        BASE_PATH: "/",
        XR_DEV: "true",
        XR_CERT: cert,
        XR_KEY: key,
        FORCE_COLOR: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  let resolveReady = () => {};
  let rejectReady = (_error: Error) => {};
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const capture = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      serverOutput = `${serverOutput}${decoder.decode(item.value)}`.slice(-100_000);
      if (stripVTControlCharacters(serverOutput).includes("https://127.0.0.1:3145/"))
        resolveReady();
    }
  };
  if (!(server.stdout instanceof ReadableStream) || !(server.stderr instanceof ReadableStream))
    throw new Error("The development server log pipes were not available.");
  const captures = [capture(server.stdout), capture(server.stderr)];
  void Promise.all(captures).catch(rejectReady);
  void server.exited.then((code) =>
    rejectReady(new Error(`The HTTPS development server exited early (${code}).\n${serverOutput}`)),
  );
  const startupTimeout = setTimeout(
    () => rejectReady(new Error(`The HTTPS development server did not start.\n${serverOutput}`)),
    30_000,
  );
  try {
    await ready;
  } finally {
    clearTimeout(startupTimeout);
  }

  browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("https://127.0.0.1:3145/", { timeout: 30_000 });
  await expect(page.getByTestId("scene-status")).toHaveText("Scene ready", { timeout: 20_000 });
  await expect(page.getByTestId("remaining")).toHaveText("15");
  const capabilities = await page.evaluate(async () => {
    const emulation = window as Window & {
      IWER_DEVICE?: { name: string };
      __IWSDK_EMULATION_PROFILE?: { active: boolean; device: string; runtime: string };
    };
    return {
      secure: window.isSecureContext,
      supported: await navigator.xr?.isSessionSupported("immersive-vr"),
      device: emulation.IWER_DEVICE?.name,
      profile: emulation.__IWSDK_EMULATION_PROFILE,
    };
  });
  expect(capabilities).toEqual({
    secure: true,
    supported: true,
    device: "Meta Quest 3",
    profile: { active: true, device: "metaQuest3", runtime: "IWER" },
  });
  await page.getByRole("button", { name: "Enter VR", exact: true }).click();
  await expect(page.getByTestId("scene-status")).toHaveText("Immersive VR");
  await page.evaluate(async () => {
    const device = (
      window as Window & { IWER_DEVICE?: { activeSession?: { end(): Promise<void> } } }
    ).IWER_DEVICE;
    if (!device?.activeSession)
      throw new Error("The official plugin did not create an emulated XR session.");
    await device.activeSession.end();
  });
  await expect(page.getByTestId("scene-status")).toHaveText("Scene ready");
  await expect(page.getByTestId("remaining")).toHaveText("15");
  expect(failures).toEqual([]);
  console.log(
    "Quest dev smoke passed: HTTPS, official IWSDK plugin injection, SQLite scene readiness, emulated VR enter/exit.",
  );
} catch (error) {
  if (serverOutput) console.error(serverOutput);
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    const killTimeout = setTimeout(() => server?.kill("SIGKILL"), 5000);
    try {
      await server.exited;
    } finally {
      clearTimeout(killTimeout);
    }
  }
  await rm(directory, { recursive: true, force: true });
}
