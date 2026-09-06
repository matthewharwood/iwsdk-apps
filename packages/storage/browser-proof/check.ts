import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createPreparedMatchArtifact } from "@iwsdk-apps/compiler/prepared";
import {
  CHANCE_VERSION,
  ContentRelease,
  DeckRevision,
  ENGINE_VERSION,
  type MatchManifest,
  type PreparedMatchArtifact,
  SERIALIZER_VERSION,
  semanticHash,
  sha256,
} from "@iwsdk-apps/contracts";
import { type Browser, chromium, expect, type Page } from "@playwright/test";
import { DRIVER_VERSION, type GameRun, runGame } from "../../simulation/src/index";
import { Coordinator, type Repository, replayMatch } from "../src/index";
import { openNativeRepository } from "../src/native";
import {
  atProofStage,
  executionEvidence,
  type ProofStage,
  setupEvidence,
  spellEvidence,
  triggerEvidence,
} from "./spell-evidence";

type Snapshot = {
  revision: number;
  stateHash: string;
  replayHash: string;
  boundaryHashes: string[];
  decision: { kind: string; id: string; actor: string } | null;
  outcome: unknown;
  spells: ReturnType<typeof spellEvidence>;
  triggers: ReturnType<typeof triggerEvidence>;
  execution: ReturnType<typeof executionEvidence>;
  setup: ReturnType<typeof setupEvidence>;
  storage?: { secureContext: boolean; opfs: boolean; locks: boolean };
};
type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };
type TestPage = { commanderProof: { call(request: unknown): Promise<RpcResult<unknown>> } };
const root = fileURLToPath(new URL("../../../", import.meta.url));
const options = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    release: { type: "string", default: ".commander/development-release.json" },
    decks: { type: "string", default: ".commander/development-decks.json" },
    "deck-offset": { type: "string", default: "0" },
    "deck-stride": { type: "string", default: "3" },
    "seed-attempts": { type: "string", default: "8" },
    "require-spells": { type: "boolean", default: false },
    "require-removal": { type: "boolean", default: false },
    "require-triggers": { type: "boolean", default: false },
    "require-ordered-triggers": { type: "boolean", default: false },
    "two-seed": { type: "string", default: "1901" },
    "four-seed": { type: "string", default: "2901" },
    resolver: { type: "string", default: "full-scan" },
  },
}).values;
function boundedInteger(value: string, minimum: number, maximum: number, name: string) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum)
    throw new Error(`${name} must be an integer in ${minimum}..${maximum}`);
  return result;
}
const deckOffset = boundedInteger(options["deck-offset"], 0, 100_000, "deck-offset");
const deckStride = boundedInteger(options["deck-stride"], 1, 100_000, "deck-stride");
const seedAttempts = boundedInteger(options["seed-attempts"], 1, 32, "seed-attempts");
const requireOrderedTriggers = options["require-ordered-triggers"];
const requireTriggers = options["require-triggers"] || requireOrderedTriggers;
const twoSeed = boundedInteger(options["two-seed"], 1, 4294967200, "two-seed");
const fourSeed = boundedInteger(options["four-seed"], 1, 4294967200, "four-seed");
const requireRemoval = options["require-removal"];
const requireSpells = options["require-spells"] || requireRemoval;
function parseResolver(value: string): MatchManifest["resolver"] {
  switch (value) {
    case "full-scan":
    case "prepared-scan":
    case "prepared-indexed":
      return value;
    default:
      throw new Error("resolver must be full-scan, prepared-scan, or prepared-indexed");
  }
}
const resolver = parseResolver(options.resolver);
const stageKinds: ProofStage[] = requireSpells
  ? ["starting-player", "target", "payment"]
  : ["starting-player", "payment"];
if (requireOrderedTriggers) stageKinds.push("pending-ordered-trigger");
else if (requireTriggers) stageKinds.push("pending-trigger");
const runId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
const output = join(root, ".commander/browser-proof", runId);
await mkdir(output, { recursive: true });
// Relative inputs are repository-root relative even when invoked with bun --cwd.
const releasePath = resolve(root, options.release);
const decksPath = resolve(root, options.decks);
const releaseBytes = await readFile(releasePath);
const release = ContentRelease.parse(JSON.parse(releaseBytes.toString()));
const decks = DeckRevision.array().parse(JSON.parse(await readFile(decksPath, "utf8")));
const selectedDecks = decks.slice(deckOffset);
if (!selectedDecks.length) throw new Error("deck-offset lies outside the compiled deck collection");

const sourceFiles: Record<string, string> = {};
for (const name of [
  "contracts",
  "engine",
  "rule-selection",
  "simulation",
  "storage",
  "compiler",
  "card-programs",
]) {
  const packageRoot = join(root, "packages", name);
  sourceFiles[`packages/${name}/package.json`] = await readFile(
    join(packageRoot, "package.json"),
    "utf8",
  );
  for await (const path of new Bun.Glob("src/**/*.ts").scan({ cwd: packageRoot })) {
    if (path.endsWith(".test.ts")) continue;
    sourceFiles[`packages/${name}/${path}`] = await readFile(join(packageRoot, path), "utf8");
  }
}
for (const name of ["check.ts", "worker.ts", "spell-evidence.ts"]) {
  sourceFiles[`packages/storage/browser-proof/${name}`] = await readFile(
    new URL(name, import.meta.url),
    "utf8",
  );
}
await Bun.write(join(output, "sources.json"), JSON.stringify(sourceFiles, null, 2));
await Bun.write(join(output, "release.json"), releaseBytes);
const sourceHash = await semanticHash(sourceFiles);
const built = await Bun.build({
  entrypoints: [fileURLToPath(new URL("worker.ts", import.meta.url))],
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "none",
});
if (!built.success || !built.outputs[0])
  throw new Error(`Browser worker build failed: ${built.logs.join("\n")}`);
const workerScript = await built.outputs[0].text();
await Bun.write(join(output, "worker.js"), workerScript);
const sqliteWasm = Bun.file(
  fileURLToPath(import.meta.resolve("@sqlite.org/sqlite-wasm/sqlite3.wasm")),
);
const sqliteHash = new Bun.CryptoHasher("sha256")
  .update(await sqliteWasm.arrayBuffer())
  .digest("hex");
const html = `<!doctype html><meta charset="utf-8"><title>Commander storage parity proof</title>
<h1>Commander storage parity proof</h1><script type="module">
const worker = new Worker('/worker.js', {type: 'module'});
let sequence = 0;
const pending = new Map();
worker.onmessage = ({data}) => {
  if ('progress' in data) { console.log('revision:' + data.progress); return; }
  const item = pending.get(data.id);
  if (!item) return;
  pending.delete(data.id); clearTimeout(item.timer); item.resolve(data);
};
worker.onerror = (event) => {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(event.message)); }
  pending.clear();
};
window.commanderProof = {call(request) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Worker RPC timed out')); }, 180000);
    pending.set(id, {resolve, reject, timer}); worker.postMessage({id, request});
  });
}};
</script>`;
const served = new Map<string, number>();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    served.set(path, (served.get(path) ?? 0) + 1);
    const headers = { "Cache-Control": "no-store" };
    if (path === "/")
      return new Response(html, { headers: { ...headers, "Content-Type": "text/html" } });
    if (path === "/worker.js")
      return new Response(workerScript, {
        headers: { ...headers, "Content-Type": "text/javascript" },
      });
    if (path === "/release.json")
      return new Response(releaseBytes, {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    if (path === "/sqlite3.wasm")
      return new Response(sqliteWasm, {
        headers: { ...headers, "Content-Type": "application/wasm" },
      });
    return new Response("Not found", { status: 404 });
  },
});
const origin = `http://127.0.0.1:${server.port}`;
let browser: Browser | undefined;
const failures: string[] = [];
const cases: unknown[] = [];
const attempts: Record<string, unknown>[] = [];
const evidence: Record<string, unknown> = {
  schema: "commander-browser-parity-proof/1",
  runId,
  startedAt: new Date().toISOString(),
  status: "running",
  engineVersion: ENGINE_VERSION,
  nativeBunVersion: Bun.version,
  driverVersion: DRIVER_VERSION,
  sourceHash,
  sourceSnapshot: "sources.json",
  workerBundleHash: await sha256(workerScript),
  sqliteVersion: "3.53.0-build1",
  sqliteWasmHash: sqliteHash,
  releaseHash: release.hash,
  releaseFileHash: new Bun.CryptoHasher("sha256").update(releaseBytes).digest("hex"),
  assurance: release.assurance,
  supportedDefinitions: Object.keys(release.definitions).length,
  sourceDefinitionCount: Object.keys(release.definitions).length,
  resolver,
  lockfileHash: await sha256(await readFile(join(root, "bun.lock"), "utf8")),
  scope:
    "Actual Chromium dedicated-worker SQLite OPFS persistence and native/browser deterministic parity for two complete development-subset matches. This is not full-pool Commander coverage or physical WebXR evidence.",
  cases,
  attempts,
  options: { ...options, release: releasePath, decks: decksPath },
};

async function result<T>(page: Page, request: unknown): Promise<RpcResult<T>> {
  return page.evaluate(
    (input) => (globalThis as unknown as TestPage).commanderProof.call(input),
    request,
  ) as Promise<RpcResult<T>>;
}
async function call<T>(page: Page, request: unknown): Promise<T> {
  const response = await result<T>(page, request);
  if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
  return response.value;
}
async function loadPage(page: Page) {
  await page.goto(origin, { waitUntil: "load" });
  await page.waitForFunction(
    () => !!(globalThis as unknown as TestPage).commanderProof,
    undefined,
    { timeout: 15_000 },
  );
}
async function nativeSnapshot(repo: Repository, coordinator: Coordinator): Promise<Snapshot> {
  const state = coordinator.current();
  const archive = repo.load(state.manifest.id);
  if (!archive) throw new Error("Native archive missing");
  return {
    revision: state.revision,
    stateHash: await semanticHash(state),
    replayHash: await semanticHash(await replayMatch(repo, release, state.manifest.id)),
    boundaryHashes: [
      archive.initialHash,
      ...archive.records.map((record) => record.receipt.stateHash),
    ],
    decision: state.decision,
    outcome: state.outcome,
    spells: spellEvidence(archive, release),
    triggers: triggerEvidence(archive),
    execution: executionEvidence(release, coordinator.executionInfo()),
    setup: setupEvidence(coordinator, archive),
  };
}
function requireCompleted(run: GameRun) {
  if (run.status !== "completed")
    throw new Error(`Match ${run.matchId} did not complete: ${JSON.stringify(run)}`);
}
type NativeStage = {
  kind: ProofStage;
  run: GameRun;
  snapshot: Snapshot;
};
type NativeCase = {
  manifest: MatchManifest;
  stages: NativeStage[];
  nativeRun: GameRun;
  nativeFinal: Snapshot;
  artifact: PreparedMatchArtifact | null;
};
function qualifies(stages: NativeStage[], final: Snapshot): boolean {
  return (
    stages.length === stageKinds.length &&
    stages.every((stage) => stage.run.status === "paused") &&
    (!requireSpells || Object.keys(final.spells.resolved).length > 0) &&
    (!requireTriggers || Object.keys(final.triggers.resolved).length > 0) &&
    (!requireOrderedTriggers ||
      Object.keys(final.triggers.resolved).some((id) =>
        release.definitions[id]?.triggerPrograms?.some(
          (program) => program.schema === "commander-trigger/2",
        ),
      )) &&
    (!requireRemoval || final.spells.removalEvents.destroy + final.spells.removalEvents.exile > 0)
  );
}
function assertUndealt(snapshot: Snapshot, seatCount: number): void {
  expect(snapshot.revision).toBe(0);
  expect(snapshot.setup).toMatchObject({
    starter: null,
    activePlayer: null,
    priorityPlayer: null,
    objectCount: 0,
    acceptedChoices: 0,
    firstChoice: null,
  });
  expect(snapshot.decision).toMatchObject({
    kind: "starting-player",
    actor: snapshot.setup.chooser,
  });
  expect(snapshot.setup.zones).toHaveLength(seatCount);
  const seats = snapshot.setup.zones.map((seat) => seat.player);
  expect(snapshot.setup.choiceViews.map((view) => view.player)).toEqual(seats);
  for (const seat of snapshot.setup.zones)
    expect(seat).toMatchObject({ hand: 0, library: 0, graveyard: 0 });
  for (const view of snapshot.setup.choiceViews) {
    expect(view.objectCount).toBe(0);
    if (view.player === snapshot.setup.chooser)
      expect(view.decision).toMatchObject({
        kind: "starting-player",
        actor: snapshot.setup.chooser,
        players: seats,
      });
    else expect(view.decision).toBeNull();
  }
}
function assertSingleChoice(snapshot: Snapshot): void {
  expect(snapshot.setup.acceptedChoices).toBe(1);
  const choice = snapshot.setup.firstChoice;
  if (!choice || choice.command.response.kind !== "starting-player")
    throw new Error("Missing durable starting-player choice");
  expect(choice.command.actor).toBe(snapshot.setup.chooser);
  expect(choice.command.revision).toBe(0);
  expect(choice.receipt.revision).toBe(1);
  expect(choice.command.response.player).toBe(snapshot.setup.starter);
}
async function verifyDurableRetry(page: Page, operation: "retryLast" | "retryStartingChoice") {
  const retry = await call<{ expected: unknown; result: unknown }>(page, { operation });
  expect(retry.result).toEqual({ status: "accepted", receipt: retry.expected });
}
async function prepareCase(seatCount: 2 | 4, attempt: number) {
  const gameSeed = (seatCount === 2 ? twoSeed : fourSeed) + attempt;
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: `browser-parity-${seatCount}-seat-attempt-${attempt}`,
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed,
    driverSeed: gameSeed + 17,
    driverVersion: DRIVER_VERSION,
    mode: seatCount === 2 ? "two-seat" : "four-seat",
    seats: Array.from({ length: seatCount }, (_, index) => {
      const deck = selectedDecks[(index * deckStride) % selectedDecks.length];
      if (!deck) throw new Error("Missing selected development deck");
      return { id: `P${index + 1}`, deck };
    }),
    resolver,
  };
  const artifact =
    resolver === "full-scan"
      ? null
      : await createPreparedMatchArtifact(
          release,
          manifest.seats.map((seat) => seat.deck),
        );
  if (artifact) manifest.preparedArtifactHash = artifact.hash;
  return { manifest, artifact };
}
async function nativeCase(seatCount: 2 | 4): Promise<NativeCase> {
  for (let attempt = 0; attempt < seedAttempts; attempt++) {
    const { manifest, artifact } = await prepareCase(seatCount, attempt);
    const gameSeed = manifest.gameSeed;
    const prefix = `${seatCount}-seat-attempt-${attempt}`;
    if (artifact)
      await Bun.write(join(output, `${prefix}-artifact.json`), JSON.stringify(artifact, null, 2));
    await Bun.write(join(output, `${prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    const repo = openNativeRepository(join(output, `${prefix}.sqlite`));
    let coordinator: Coordinator | undefined;
    const stages: NativeStage[] = [];
    const attemptEvidence: Record<string, unknown> = {
      manifest,
      artifact,
      stages,
      status: "running",
    };
    attempts.push(attemptEvidence);
    try {
      coordinator = await Coordinator.create(repo, release, manifest, artifact ?? undefined);
      const execution = coordinator.executionInfo();
      expect(execution.sourceReleaseHash).toBe(release.hash);
      expect(execution.preparedArtifactHash).toBe(artifact?.hash ?? null);
      expect(execution.definitionCount).toBe(
        artifact?.retainedDefinitions.length ?? Object.keys(release.definitions).length,
      );
      if (artifact)
        expect(execution.definitionCount).toBeLessThan(Object.keys(release.definitions).length);
      attemptEvidence.execution = {
        ...execution,
        fullDefinitionCount: Object.keys(release.definitions).length,
        excludedDefinitionCount:
          Object.keys(release.definitions).length - execution.definitionCount,
      };
      console.log(`Native ${seatCount}-seat attempt ${attempt}: starting seed ${gameSeed}`);
      for (const kind of stageKinds) {
        const run = await runGame(coordinator, {
          seed: manifest.driverSeed,
          maxCommands: 10_000,
          stopAt: (observation) => atProofStage(observation, kind),
          onProgress: (revision) => console.log(`Native ${seatCount}-seat revision:${revision}`),
        });
        const snapshot = await nativeSnapshot(repo, coordinator);
        stages.push({ kind, run, snapshot });
        if (kind === "starting-player") assertUndealt(snapshot, seatCount);
        if (run.status !== "paused") {
          requireCompleted(run); // Actual engine/driver/budget failures are not discarded as seed misses.
          break;
        }
        if (kind === "pending-trigger" || kind === "pending-ordered-trigger")
          expect(snapshot.triggers.pending.length).toBeGreaterThan(0);
        else expect(snapshot.decision?.kind).toBe(kind);
      }
      const nativeRun = await runGame(coordinator, {
        seed: manifest.driverSeed,
        maxCommands: 10_000,
        onProgress: (revision) => console.log(`Native ${seatCount}-seat revision:${revision}`),
      });
      requireCompleted(nativeRun);
      const nativeFinal = await nativeSnapshot(repo, coordinator);
      assertSingleChoice(nativeFinal);
      const exercised = qualifies(stages, nativeFinal);
      Object.assign(attemptEvidence, {
        nativeRun,
        nativeFinal,
        status: exercised ? "selected" : "missing-required-workflow",
      });
      if (exercised) return { manifest, stages, nativeRun, nativeFinal, artifact };
      console.log(
        `Native seed ${gameSeed} completed but lacked a required spell/decision; retaining the attempt and advancing the bounded seed search.`,
      );
    } catch (error) {
      attemptEvidence.status = "failed";
      attemptEvidence.failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      if (coordinator) await coordinator.close();
      else repo.close();
      await Bun.write(
        join(output, `${prefix}-attempt.json`),
        JSON.stringify(attemptEvidence, null, 2),
      );
    }
  }
  throw new Error(
    `No qualifying ${seatCount}-seat fixture in ${seedAttempts} retained deterministic attempts`,
  );
}
const completedBrowserStates: Snapshot[] = [];
const selectedManifests: MatchManifest[] = [];
try {
  browser = await chromium.launch({ headless: true });
  evidence.browserVersion = browser.version();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) =>
    failures.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on("console", (message) => {
    if (message.text().startsWith("revision:")) console.log(`Browser ${message.text()}`);
  });
  for (const seatCount of [2, 4] as const) {
    const baseline = await nativeCase(seatCount);
    const { manifest } = baseline;
    selectedManifests.push(manifest);
    const namespace = `commander-proof-${runId.toLowerCase()}-${seatCount}`;
    const caseEvidence: Record<string, unknown> = { ...baseline };
    cases.push(caseEvidence);
    await loadPage(page);
    const created = await call<Snapshot>(page, {
      operation: "create",
      namespace,
      manifest,
      artifact: baseline.artifact,
    });
    expect(created.execution).toEqual(baseline.nativeFinal.execution);
    assertUndealt(created, seatCount);
    expect(created.storage).toEqual({ secureContext: true, opfs: true, locks: true });
    const rival = await context.newPage();
    try {
      await loadPage(rival);
      const conflict = await result(rival, { operation: "open", namespace, matchId: manifest.id });
      expect(conflict).toMatchObject({ ok: false, error: { code: "AlreadyOpen" } });
      caseEvidence.lockContention = "AlreadyOpen";
    } finally {
      await rival.close();
    }
    const browserStages: Record<string, unknown>[] = [];
    let saved = "";
    let importedExpected: Snapshot | undefined;
    for (const stage of baseline.stages) {
      const paused = await call<GameRun>(page, {
        operation: "run",
        stopAt: stage.kind,
        maxCommands: 10_000,
      });
      expect(paused.status).toBe("paused");
      const pending = await call<Snapshot>(page, { operation: "snapshot" });
      if (stage.kind === "pending-trigger" || stage.kind === "pending-ordered-trigger")
        expect(pending.triggers.pending.length).toBeGreaterThan(0);
      else expect(pending.decision?.kind).toBe(stage.kind);
      expect(pending.execution).toEqual(stage.snapshot.execution);
      expect(pending.stateHash).toBe(stage.snapshot.stateHash);
      expect(pending.boundaryHashes).toEqual(stage.snapshot.boundaryHashes);
      await call(page, { operation: "close" });
      // A full document reload destroys the worker. A new worker must recover from OPFS.
      await page.reload({ waitUntil: "load" });
      const reopened = await call<Snapshot>(page, {
        operation: "open",
        namespace,
        matchId: manifest.id,
      });
      expect(reopened).toEqual(pending);
      if (pending.revision > 0) {
        await verifyDurableRetry(page, "retryLast");
        await verifyDurableRetry(page, "retryStartingChoice");
        expect(await call<Snapshot>(page, { operation: "snapshot" })).toEqual(pending);
      }
      const stageSave = await call<string>(page, { operation: "export" });
      await Bun.write(join(output, `${seatCount}-seat-${stage.kind}-save.json`), stageSave);
      if (!saved || stage.kind === "pending-ordered-trigger") {
        saved = stageSave;
        importedExpected = pending;
      }
      browserStages.push({
        kind: stage.kind,
        paused,
        pending,
        reopened,
        exactRetry: pending.revision > 0,
        startingChoiceRetry: pending.revision > 0,
      });
    }
    const resumed = await call<GameRun>(page, {
      operation: "run",
      stopAt: null,
      maxCommands: 10_000,
    });
    requireCompleted(resumed);
    const completed = await call<Snapshot>(page, { operation: "snapshot" });
    expect(completed.stateHash).toBe(baseline.nativeFinal.stateHash);
    expect(completed.replayHash).toBe(completed.stateHash);
    expect(completed.boundaryHashes).toEqual(baseline.nativeFinal.boundaryHashes);
    expect(completed.spells).toEqual(baseline.nativeFinal.spells);
    expect(completed.triggers).toEqual(baseline.nativeFinal.triggers);
    expect(completed.execution).toEqual(baseline.nativeFinal.execution);
    assertSingleChoice(completed);
    expect(completed.setup.firstChoice).toEqual(baseline.nativeFinal.setup.firstChoice);
    if (requireRemoval)
      expect(
        completed.spells.removalEvents.destroy + completed.spells.removalEvents.exile,
      ).toBeGreaterThan(0);
    if (requireSpells) expect(Object.keys(completed.spells.resolved).length).toBeGreaterThan(0);
    expect(resumed).toEqual(baseline.nativeRun);
    await call(page, { operation: "close" });
    await page.reload({ waitUntil: "load" });
    const imported = await call<Snapshot>(page, {
      operation: "import",
      namespace: `${namespace}-import`,
      text: saved,
    });
    expect(imported).toEqual(importedExpected);
    const importedRun = await call<GameRun>(page, {
      operation: "run",
      stopAt: null,
      maxCommands: 10_000,
    });
    requireCompleted(importedRun);
    const importedFinal = await call<Snapshot>(page, { operation: "snapshot" });
    expect(importedFinal.boundaryHashes).toEqual(completed.boundaryHashes);
    expect(importedFinal.stateHash).toBe(completed.stateHash);
    expect(importedFinal.execution).toEqual(completed.execution);
    assertSingleChoice(importedFinal);
    expect(importedFinal.setup.firstChoice).toEqual(completed.setup.firstChoice);
    caseEvidence.browser = {
      stages: browserStages,
      resumed,
      completed,
      logicalSaveBytes: new TextEncoder().encode(saved).byteLength,
      imported,
      importedRun,
      importedFinalHash: importedFinal.stateHash,
      importedExecution: importedFinal.execution,
      allBoundaryHashesEqual: true,
    };
    completedBrowserStates.push(completed);
    await call(page, { operation: "close" });
    console.log(
      `PASS ${seatCount}-seat: ${completed.revision} accepted commands, ${completed.boundaryHashes.length} equal boundaries`,
    );
  }
  const spellIds = [
    ...new Set(
      selectedManifests.flatMap((manifest) =>
        manifest.seats.flatMap((seat) => seat.deck.entries.map((entry) => entry.definition)),
      ),
    ),
  ]
    .filter((id) => !!release.definitions[id]?.spellProgram)
    .sort();
  const resolvedIds = [
    ...new Set(completedBrowserStates.flatMap((state) => Object.keys(state.spells.resolved))),
  ].sort();
  const announcedIds = [
    ...new Set(completedBrowserStates.flatMap((state) => Object.keys(state.spells.announced))),
  ].sort();
  evidence.spellCoverage = {
    required: requireSpells,
    removalRequired: requireRemoval,
    removalEvents: completedBrowserStates.reduce(
      (total, state) => ({
        destroy: total.destroy + state.spells.removalEvents.destroy,
        exile: total.exile + state.spells.removalEvents.exile,
      }),
      { destroy: 0, exile: 0 },
    ),
    eligibleDeckSpells: spellIds.map((id) => ({ id, name: release.definitions[id]?.name })),
    announced: announcedIds.map((id) => ({ id, name: release.definitions[id]?.name })),
    resolved: resolvedIds.map((id) => ({ id, name: release.definitions[id]?.name })),
    notResolved: spellIds
      .filter((id) => !resolvedIds.includes(id))
      .map((id) => ({ id, name: release.definitions[id]?.name })),
    effectKinds: [
      ...new Set(completedBrowserStates.flatMap((state) => state.spells.effectKinds)),
    ].sort(),
  };
  expect(failures).toEqual([]);
  expect(served.get("/sqlite3.wasm")).toBeGreaterThanOrEqual(2 * (stageKinds.length + 2));
  const changedSources: string[] = [];
  for (const [path, captured] of Object.entries(sourceFiles)) {
    if ((await readFile(join(root, path), "utf8")) !== captured) changedSources.push(path);
  }
  evidence.sourceFilesChangedDuringRun = changedSources;
  expect(changedSources).toEqual([]);
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
  throw error;
} finally {
  await browser?.close();
  await server.stop(true);
  evidence.finishedAt = new Date().toISOString();
  evidence.browserFailures = failures;
  evidence.served = Object.fromEntries(served);
  await Bun.write(join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(`Browser parity evidence: ${join(output, "evidence.json")}`);
}
