import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { canonicalJson, ENGINE_VERSION, semanticHash, sha256 } from "@iwsdk-apps/contracts";
import { type Browser, chromium, type Page } from "@playwright/test";
import { z } from "zod";
import { Coordinator, exportMatch, importMatch } from "../src/index";
import { openNativeRepository } from "../src/native";
import { type CommandRecord, ensure } from "../src/records";
import {
  captureCheckpointSources,
  changedCheckpointFiles,
  loadCheckpointInputs,
  type VerifiedCase,
} from "./checkpoint-inputs";
import { checkpointNamespace, LogicalSave, type LogicalSave as Save } from "./checkpoint-plan";

const Snapshot = z.looseObject({
  revision: z.number().int().nonnegative(),
  stateHash: z.string(),
  replayHash: z.string(),
  boundaryHashes: z.array(z.string()),
  storage: z.strictObject({ secureContext: z.boolean(), opfs: z.boolean(), locks: z.boolean() }),
});
const RpcEnvelope = z.discriminatedUnion("ok", [
  z.strictObject({ id: z.number(), ok: z.literal(true), value: z.unknown() }),
  z.strictObject({
    id: z.number(),
    ok: z.literal(false),
    error: z.strictObject({ code: z.string(), message: z.string() }),
  }),
]);
type Bridge = { commanderCheckpoint: { call(request: unknown): Promise<unknown> } };
const root = fileURLToPath(new URL("../../../", import.meta.url));
const options = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: { plan: { type: "string" } },
}).values;
if (!options.plan)
  throw new Error(
    "Usage: bun packages/storage/browser-proof/checkpoint-check.ts --plan <project-relative-plan.json>",
  );
const runId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
const output = join(root, ".commander/checkpoint-browser-proof", runId);
await mkdir(output, { recursive: true });
const evidence: Record<string, unknown> = {
  schema: "commander-stopped-history-opfs-proof/1",
  status: "running",
  runId,
  startedAt: new Date().toISOString(),
  engineVersion: ENGINE_VERSION,
  nativeBunVersion: Bun.version,
  scope:
    "Real Chromium SQLite WASM OPFS replay of existing stopped command histories. No new autoplay or completed games; no driver privacy or full coverage claim.",
  newCompletedGames: 0,
  cases: [],
};
const failures: string[] = [];
const caseResults: Record<string, unknown>[] = [];
const network: unknown[] = [];
const pageErrors: string[] = [];
let browser: Browser | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let tracked: Record<string, string> = {};

async function rpc(page: Page, request: unknown): Promise<unknown> {
  const response = RpcEnvelope.parse(
    await page.evaluate(
      (input) => (globalThis as unknown as Bridge).commanderCheckpoint.call(input),
      request,
    ),
  );
  await appendFile(join(output, "rpc.jsonl"), `${JSON.stringify({ request, response })}\n`);
  if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
  return response.value;
}
async function snapshotMatches(page: Page, save: Save) {
  const raw = await rpc(page, { operation: "snapshot" });
  const snapshot = Snapshot.parse(raw);
  ensure(
    snapshot.storage.secureContext && snapshot.storage.opfs && snapshot.storage.locks,
    "Real secure-context OPFS/WebLocks APIs are required",
  );
  ensure(
    snapshot.revision === save.payload.current.revision,
    "Browser checkpoint revision differs",
  );
  ensure(
    snapshot.stateHash === save.payload.currentHash &&
      snapshot.replayHash === save.payload.currentHash,
    "Browser live or replay state hash differs",
  );
  ensure(
    canonicalJson(snapshot.boundaryHashes) ===
      canonicalJson([
        save.payload.initialHash,
        ...save.payload.records.map((row) => row.receipt.stateHash),
      ]),
    "Browser replay boundary sequence differs",
  );
  return raw;
}
async function exportMatches(page: Page, save: Save, path: string) {
  const raw = z.string().parse(await rpc(page, { operation: "export" }));
  await Bun.write(join(output, path), raw);
  const actual = LogicalSave.parse(JSON.parse(raw));
  ensure(
    (await semanticHash(actual.payload)) === actual.checksum,
    "Browser logical export checksum differs",
  );
  ensure(
    canonicalJson(actual) === canonicalJson(save),
    "Browser full canonical save differs from native checkpoint",
  );
  return {
    path,
    rawHash: await sha256(raw),
    checksum: actual.checksum,
    stateHash: actual.payload.currentHash,
  };
}
async function retryLast(page: Page, save: Save) {
  const expected = save.payload.records.at(-1)?.receipt;
  if (!expected) return { status: "no-command-at-initial-checkpoint" };
  const result = await rpc(page, { operation: "retryLast" });
  ensure(
    canonicalJson(result) ===
      canonicalJson({ expected, result: { status: "accepted", receipt: expected } }),
    "Exact last-command retry differs from durable receipt",
  );
  return result;
}
async function submitTape(page: Page, records: readonly CommandRecord[]) {
  for (const record of records) {
    const actual = await rpc(page, {
      operation: "submit",
      actor: record.command.actor,
      command: record.command,
    });
    ensure(
      canonicalJson(actual) === canonicalJson({ status: "accepted", receipt: record.receipt }),
      `Command receipt/state/event hash differs at revision${record.receipt.revision}`,
    );
  }
  return records.length;
}
async function loadDocument(page: Page, origin: string, reload = false) {
  if (reload) await page.reload({ waitUntil: "load" });
  else await page.goto(origin, { waitUntil: "load" });
  await page.waitForFunction(
    () => !!(globalThis as unknown as Bridge).commanderCheckpoint,
    undefined,
    { timeout: 15_000 },
  );
}
async function restoreCheckpoint(
  page: Page,
  origin: string,
  namespace: string,
  item: VerifiedCase,
  point: VerifiedCase["checkpoints"][number],
) {
  const prefix = `${item.name}-${point.name}`;
  const before = await exportMatches(page, point.save, `${prefix}-before-reload.json`);
  await rpc(page, { operation: "close" });
  await loadDocument(page, origin, true);
  await rpc(page, {
    operation: "open",
    namespace,
    matchId: point.save.payload.current.manifest.id,
  });
  const restored = await snapshotMatches(page, point.save);
  const retry = await retryLast(page, point.save);
  const after = await exportMatches(page, point.save, `${prefix}-after-reload-retry.json`);
  return {
    name: point.name,
    revision: point.save.payload.current.revision,
    before,
    restored,
    retry,
    after,
  };
}
async function importAndContinue(
  page: Page,
  origin: string,
  item: VerifiedCase,
  point: VerifiedCase["checkpoints"][number],
  namespace: string,
) {
  await loadDocument(page, origin, true);
  await rpc(page, { operation: "import", namespace, text: canonicalJson(point.save) });
  const imported = await snapshotMatches(page, point.save);
  const retry = await retryLast(page, point.save);
  const exported = await exportMatches(
    page,
    point.save,
    `${item.name}-${point.name}-import-retry.json`,
  );
  const continuedCommands = await submitTape(
    page,
    item.final.payload.records.slice(point.save.payload.records.length),
  );
  const finalSnapshot = await snapshotMatches(page, item.final);
  const final = await exportMatches(
    page,
    item.final,
    `${item.name}-${point.name}-continued-final.json`,
  );
  await rpc(page, { operation: "close" });
  return { name: point.name, imported, retry, exported, continuedCommands, finalSnapshot, final };
}
async function nativeVerify(item: VerifiedCase, release: Parameters<typeof importMatch>[1]) {
  const repo = openNativeRepository(join(output, `${item.name}-native.sqlite`));
  let coordinator: Coordinator | undefined;
  try {
    await importMatch(repo, release, canonicalJson(item.final));
    coordinator = await Coordinator.open(repo, release, item.final.payload.current.manifest.id);
    const exported = await exportMatch(repo, release, item.final.payload.current.manifest.id);
    ensure(
      exported === canonicalJson(item.final),
      "Native SQL import/export differs from final save",
    );
    await Bun.write(join(output, `${item.name}-native-final.json`), exported);
    return {
      execution: coordinator.executionInfo(),
      stateHash: await semanticHash(coordinator.current()),
      currentRevision: coordinator.current().revision,
    };
  } finally {
    if (coordinator) await coordinator.close();
    else repo.close();
  }
}
async function executeCase(
  activeBrowser: Browser,
  origin: string,
  item: VerifiedCase,
  release: Parameters<typeof importMatch>[1],
  index: number,
) {
  const result: Record<string, unknown> = {
    name: item.name,
    status: "running",
    resolver: item.final.payload.initial.manifest.resolver,
    mode: item.final.payload.initial.manifest.mode,
    retainedCommands: item.final.payload.records.length,
    newCompletedGames: 0,
    checkpoints: [],
    imports: [],
  };
  caseResults.push(result);
  const context = await activeBrowser.newContext();
  context.on("requestfailed", (request) =>
    failures.push(`${item.name}: ${request.url()} ${request.failure()?.errorText}`),
  );
  context.on("request", (request) =>
    network.push({
      case: item.name,
      type: "request",
      url: request.url(),
      method: request.method(),
    }),
  );
  context.on("response", (response) =>
    network.push({
      case: item.name,
      type: "response",
      url: response.url(),
      status: response.status(),
    }),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(`${item.name}: ${error.message}`));
  const namespace = checkpointNamespace(runId, index);
  try {
    result.native = await nativeVerify(item, release);
    await loadDocument(page, origin);
    await rpc(page, {
      operation: "create",
      namespace,
      manifest: item.final.payload.initial.manifest,
      artifact: item.final.payload.preparedArtifact,
    });
    const initial: Save = {
      format: "commander-logical-save/2",
      checksum: "",
      payload: {
        ...item.final.payload,
        current: item.final.payload.initial,
        currentHash: item.final.payload.initialHash,
        records: [],
      },
    };
    initial.checksum = await semanticHash(initial.payload);
    result.initial = await snapshotMatches(page, initial);
    await exportMatches(page, initial, `${item.name}-initial.json`);
    const checkpoints = [];
    let cursor = 0;
    for (const point of item.checkpoints) {
      await submitTape(
        page,
        item.final.payload.records.slice(cursor, point.save.payload.records.length),
      );
      cursor = point.save.payload.records.length;
      checkpoints.push(await restoreCheckpoint(page, origin, namespace, item, point));
      process.stdout.write(
        `${item.name}: checked ${point.name} at revision ${point.save.payload.current.revision}\n`,
      );
    }
    result.checkpoints = checkpoints;
    await submitTape(page, item.final.payload.records.slice(cursor));
    result.finalSnapshot = await snapshotMatches(page, item.final);
    result.final = await exportMatches(page, item.final, `${item.name}-stopped-final.json`);
    await rpc(page, { operation: "close" });
    const imports = [];
    for (const [pointIndex, point] of item.checkpoints.entries())
      imports.push(
        await importAndContinue(page, origin, item, point, `${namespace}-import-${pointIndex}`),
      );
    result.imports = imports;
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = String(error);
    throw error;
  } finally {
    await context.close();
    await Bun.write(join(output, `${item.name}-result.json`), JSON.stringify(result, null, 2));
  }
}
const html = `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Stopped Commander history OPFS proof</title><script type="module">
const worker=new Worker('/worker.js',{type:'module'});let sequence=0;const pending=new Map();
worker.onmessage=({data})=>{if('progress'in data)return;const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);p.resolve(data);};
worker.onerror=event=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(event.message));}pending.clear();};
window.commanderCheckpoint={call(request){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Checkpoint worker RPC timed out'));},60000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,request});});}};
</script>`;
try {
  const source = await captureCheckpointSources(root, output);
  tracked = { ...source.hashes };
  const inputs = await loadCheckpointInputs(root, options.plan, output);
  Object.assign(tracked, inputs.inputHashes);
  evidence.sourceHash = source.sourceHash;
  evidence.sourceFileHashes = source.hashes;
  evidence.inputFileHashes = inputs.inputHashes;
  evidence.sourceReleaseHash = inputs.release.hash;
  const built = await Bun.build({
    entrypoints: [fileURLToPath(new URL("worker.ts", import.meta.url))],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!built.success || !built.outputs[0])
    throw new Error(`Existing worker build failed: ${built.logs.join("\n")}`);
  const script = await built.outputs[0].text();
  await Bun.write(join(output, "worker.js"), script);
  const wasm = Bun.file(fileURLToPath(import.meta.resolve("@sqlite.org/sqlite-wasm/sqlite3.wasm")));
  const wasmBytes = await wasm.arrayBuffer();
  await Bun.write(join(output, "sqlite3.wasm"), wasmBytes);
  evidence.workerHash = await sha256(script);
  evidence.sqliteWasmHash = new Bun.CryptoHasher("sha256").update(wasmBytes).digest("hex");
  evidence.sqliteVersion = "3.53.0-build1";
  await Bun.write(join(output, "index.html"), html);
  const served: Record<string, number> = {};
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      served[path] = (served[path] ?? 0) + 1;
      const entries: Record<string, { body: BodyInit; mime: string }> = {
        "/": { body: html, mime: "text/html" },
        "/worker.js": { body: script, mime: "text/javascript" },
        "/release.json": { body: inputs.releaseBytes, mime: "application/json" },
        "/sqlite3.wasm": { body: wasmBytes, mime: "application/wasm" },
      };
      const resource = entries[path];
      return resource
        ? new Response(resource.body, {
            headers: { "Content-Type": resource.mime, "Cache-Control": "no-store" },
          })
        : new Response("Not found", { status: 404 });
    },
  });
  const origin = `http://127.0.0.1:${server.port}`;
  browser = await chromium.launch({ headless: true });
  evidence.chromiumVersion = browser.version();
  for (const [index, item] of inputs.cases.entries())
    await executeCase(browser, origin, item, inputs.release, index);
  ensure(
    (served["/sqlite3.wasm"] ?? 0) > inputs.cases.length,
    "SQLite WASM was not freshly loaded across document reloads",
  );
  ensure(!failures.length && !pageErrors.length, "Browser network or page errors occurred");
  evidence.served = served;
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await server.stop(true);
  const changed = await changedCheckpointFiles(root, tracked);
  if (changed.length) {
    evidence.status = "failed";
    failures.push("Captured source/input files changed during proof");
    process.exitCode = 1;
  }
  evidence.changedCapturedFiles = changed;
  evidence.cases = caseResults;
  evidence.failures = failures;
  evidence.pageErrors = pageErrors;
  evidence.finishedAt = new Date().toISOString();
  await Bun.write(join(output, "network.json"), JSON.stringify(network, null, 2));
  await Bun.write(join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  process.stdout.write(
    `${JSON.stringify({ status: evidence.status, output, cases: caseResults.length, failures })}\n`,
  );
}
