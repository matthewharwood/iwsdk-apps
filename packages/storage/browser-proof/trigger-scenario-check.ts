import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTRACT_VERSION,
  ENGINE_VERSION,
  type GameCommand,
  semanticHash,
  sha256,
} from "@iwsdk-apps/contracts";
import { chromium, expect, type Page } from "@playwright/test";
import type { Receipt, SubmitResult } from "../src/index";
import { SCENARIO_ADAPTER } from "../test-fixtures/multi-trigger-adapter";
import { triggerFixtures } from "../test-fixtures/triggers";
import type { triggerEvidence } from "./spell-evidence";

type Snapshot = {
  revision: number;
  stateHash: string;
  replayHash: string;
  boundaryHashes: string[];
  decision: { kind: string; id: string; actor: string } | null;
  triggers: ReturnType<typeof triggerEvidence>;
  storage: { secureContext: boolean; opfs: boolean; locks: boolean };
};
type PageRpc = {
  scenarioRpc: (
    request: unknown,
  ) => Promise<{ ok: true; value: unknown } | { ok: false; error: { message: string } }>;
};
const root = fileURLToPath(new URL("../../../", import.meta.url));
const runId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
const output = join(root, ".commander/trigger-storage-proof", runId);
await mkdir(output, { recursive: true });
const sources: Record<string, string> = {};
for (const name of [
  "contracts",
  "engine",
  "compiler",
  "card-programs",
  "rule-selection",
  "storage",
  "simulation",
]) {
  const directory = join(root, "packages", name);
  for await (const path of new Bun.Glob("**/*.ts").scan({ cwd: directory })) {
    if (path.includes("node_modules/") || path.endsWith(".test.ts")) continue;
    sources[`packages/${name}/${path}`] = await readFile(join(directory, path), "utf8");
  }
}
await Bun.write(join(output, "sources.json"), JSON.stringify(sources, null, 2));
const evidence: Record<string, unknown> = {
  schema: "commander-constructed-trigger-storage-proof/1",
  runId,
  status: "running",
  scenarioAdapter: SCENARIO_ADAPTER,
  ordinaryCommandReachable: false,
  sourceBackedCards: false,
  fullGame: false,
  engineVersion: ENGINE_VERSION,
  nativeBunVersion: Bun.version,
  sourceHash: await semanticHash(sources),
  startedAt: new Date().toISOString(),
};
const { release, manifest } = await triggerFixtures("constructed-multi-trigger-storage");
manifest.driverVersion = SCENARIO_ADAPTER;
await Bun.write(join(output, "release.json"), JSON.stringify(release, null, 2));
await Bun.write(join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
const child = Bun.spawn(
  [
    process.execPath,
    fileURLToPath(new URL("../test-fixtures/multi-trigger-child.ts", import.meta.url)),
  ],
  { stdout: "pipe", stderr: "pipe" },
);
const [exitCode, stdout, stderr] = await Promise.all([
  child.exited,
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
]);
if (exitCode !== 0) throw new Error(`Native constructed scenario failed: ${stderr}`);
const native = JSON.parse(stdout) as {
  initialHash: string;
  finalHash: string;
  boundaryHashes: string[];
  order: GameCommand;
  orderReceipt: Receipt;
};
evidence.native = native;
await Bun.write(join(output, "native.json"), JSON.stringify(native, null, 2));
const adapter = fileURLToPath(new URL("trigger-scenario-engine.ts", import.meta.url));
const built = await Bun.build({
  entrypoints: [fileURLToPath(new URL("worker.ts", import.meta.url))],
  target: "browser",
  format: "esm",
  plugins: [
    {
      name: "explicit-constructed-trigger-initializer",
      setup(build) {
        build.onResolve({ filter: /^@iwsdk-apps\/engine$/ }, () => ({ path: adapter }));
      },
    },
  ],
});
if (!built.success || !built.outputs[0])
  throw new Error(`Scenario worker build failed: ${built.logs.join("\n")}`);
const worker = await built.outputs[0].text();
await Bun.write(join(output, "worker.js"), worker);
evidence.workerHash = await sha256(worker);
const wasm = Bun.file(fileURLToPath(import.meta.resolve("@sqlite.org/sqlite-wasm/sqlite3.wasm")));
evidence.wasmHash = new Bun.CryptoHasher("sha256").update(await wasm.arrayBuffer()).digest("hex");
const html = `<!doctype html><meta charset="utf-8"><title>Constructed trigger persistence test</title>
<script type="module">
const worker = new Worker('/worker.js', {type:'module'}); let sequence=0; const pending=new Map();
worker.onmessage=({data})=>{const request=pending.get(data.id);if(request){clearTimeout(request.timer);pending.delete(data.id);request.resolve(data)}};
worker.onerror=(event)=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error(event.message))}pending.clear()};
window.scenarioRpc=(request)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Worker timeout'))},15000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,request})});
</script>`;
const served: Record<string, number> = {};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    served[path] = (served[path] ?? 0) + 1;
    const headers = { "Cache-Control": "no-store" };
    if (path === "/")
      return new Response(html, { headers: { ...headers, "Content-Type": "text/html" } });
    if (path === "/worker.js")
      return new Response(worker, { headers: { ...headers, "Content-Type": "text/javascript" } });
    if (path === "/release.json")
      return new Response(JSON.stringify(release), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    if (path === "/sqlite3.wasm")
      return new Response(wasm, { headers: { ...headers, "Content-Type": "application/wasm" } });
    return new Response("Not found", { status: 404 });
  },
});
const origin = `http://127.0.0.1:${server.port}`;
async function load(page: Page) {
  await page.goto(origin);
  await page.waitForFunction(
    () => typeof (globalThis as unknown as PageRpc).scenarioRpc === "function",
  );
}
async function call<T>(page: Page, request: unknown): Promise<T> {
  const result = await page.evaluate(
    (payload) => (globalThis as unknown as PageRpc).scenarioRpc(payload),
    request,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value as T;
}
async function snapshot(page: Page) {
  return call<Snapshot>(page, { operation: "snapshot" });
}
async function order(page: Page) {
  expect(
    await call<SubmitResult>(page, { operation: "submit", actor: "A", command: native.order }),
  ).toEqual({ status: "accepted", receipt: native.orderReceipt });
}
async function finish(page: Page) {
  for (let i = 0; i < 4; i++) {
    const pending = await snapshot(page);
    if (!pending.decision) throw new Error("Missing trigger-resolution priority");
    const command: GameCommand = {
      schema: CONTRACT_VERSION,
      matchId: manifest.id,
      commandId: `trigger-storage:${pending.revision}`,
      revision: pending.revision,
      decisionId: pending.decision.id,
      actor: pending.decision.actor,
      response: { kind: "pass" },
    };
    expect(
      (await call<SubmitResult>(page, { operation: "submit", actor: command.actor, command }))
        .status,
    ).toBe("accepted");
  }
  const result = await snapshot(page);
  expect(result.stateHash).toBe(native.finalHash);
  expect(result.replayHash).toBe(native.finalHash);
  expect(result.boundaryHashes).toEqual(native.boundaryHashes);
  expect(result.triggers.abilities).toEqual({});
  return result;
}
const failures: string[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  evidence.browserVersion = browser.version();
  const context = await browser.newContext();
  context.on("page", (page) => {
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("requestfailed", (request) =>
      failures.push(`${request.url()}: ${request.failure()?.errorText}`),
    );
  });
  const page = await context.newPage();
  await load(page);
  const namespace = `trigger-proof-${runId}`.toLowerCase();
  const initial = await call<Snapshot>(page, {
    operation: "create",
    namespace,
    manifest,
    artifact: null,
  });
  expect(initial.storage).toEqual({ secureContext: true, opfs: true, locks: true });
  expect(initial.stateHash).toBe(native.initialHash);
  expect(initial.replayHash).toBe(native.initialHash);
  expect(initial.decision?.kind).toBe("trigger-order");
  expect(initial.triggers.absentCapturedSources).toHaveLength(1);
  const firstId = Object.keys(initial.triggers.abilities)[0];
  const invalid = {
    ...native.order,
    response: { kind: "trigger-order", triggers: [firstId, firstId] },
  };
  expect(
    (await call<SubmitResult>(page, { operation: "submit", actor: "A", command: invalid })).status,
  ).toBe("rejected");
  expect((await snapshot(page)).stateHash).toBe(initial.stateHash);
  const pendingSave = await call<string>(page, { operation: "export" });
  await Bun.write(join(output, "pending-order-save.json"), pendingSave);
  await call(page, { operation: "close" });
  await page.reload();
  expect(
    await call<Snapshot>(page, { operation: "open", namespace, matchId: manifest.id }),
  ).toEqual(initial);
  const importedPage = await context.newPage();
  await load(importedPage);
  expect(
    await call<Snapshot>(importedPage, {
      operation: "import",
      namespace: `${namespace}-import`,
      text: pendingSave,
    }),
  ).toEqual(initial);
  await order(page);
  await order(importedPage);
  const ordered = await snapshot(page);
  const orderedSave = await call<string>(page, { operation: "export" });
  await Bun.write(join(output, "accepted-order-save.json"), orderedSave);
  await call(page, { operation: "close" });
  await page.reload();
  expect(
    await call<Snapshot>(page, { operation: "open", namespace, matchId: manifest.id }),
  ).toEqual(ordered);
  await order(page);
  expect(await snapshot(page)).toEqual(ordered);
  const acceptedImport = await context.newPage();
  await load(acceptedImport);
  expect(
    await call<Snapshot>(acceptedImport, {
      operation: "import",
      namespace: `${namespace}-accepted-import`,
      text: orderedSave,
    }),
  ).toEqual(ordered);
  await order(acceptedImport);
  expect(await snapshot(acceptedImport)).toEqual(ordered);
  evidence.browser = {
    initial,
    ordered,
    final: await finish(page),
    importedFinal: await finish(importedPage),
    acceptedImportedFinal: await finish(acceptedImport),
  };
  for (const connected of [page, importedPage, acceptedImport])
    await call(connected, { operation: "close" });
  await context.close();
  expect(failures).toEqual([]);
  const changed: string[] = [];
  for (const [path, bytes] of Object.entries(sources))
    if ((await readFile(join(root, path), "utf8")) !== bytes) changed.push(path);
  evidence.sourceFilesChangedDuringRun = changed;
  expect(changed).toEqual([]);
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.browserFailures = failures;
  evidence.served = served;
  await Bun.write(join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  await browser?.close();
  await server.stop(true);
  console.log(`Constructed trigger storage evidence: ${join(output, "evidence.json")}`);
}
