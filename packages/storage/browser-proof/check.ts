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
import { Coordinator, exportMatch, importMatch, type Repository, replayMatch } from "../src/index";
import { openNativeRepository } from "../src/native";
import { commanderReturnEvidence } from "./commander-return-evidence";
import { entryObserverEvidence, OBSERVER_STAGES, observerCohort } from "./entry-observer-evidence";
import { COMMANDER_RETURN_PROOF_DRIVER_VERSION, proofDriverForVersion } from "./proof-driver";
import {
  atProofStage,
  continuousEvidence,
  counterEvidence,
  executionEvidence,
  type ProofStage,
  setupEvidence,
  spellEvidence,
  triggerEvidence,
} from "./spell-evidence";
import { staticEvidence } from "./static-evidence";
import { tokenEvidence } from "./token-evidence";

type Snapshot = {
  revision: number;
  stateHash: string;
  replayHash: string;
  boundaryHashes: string[];
  decision: { kind: string; id: string; actor: string } | null;
  outcome: unknown;
  spells: ReturnType<typeof spellEvidence>;
  triggers: ReturnType<typeof triggerEvidence>;
  continuous: ReturnType<typeof continuousEvidence>;
  counters: ReturnType<typeof counterEvidence>;
  tokens: ReturnType<typeof tokenEvidence>;
  statics: ReturnType<typeof staticEvidence>;
  observers: ReturnType<typeof entryObserverEvidence>;
  commanderReturns: ReturnType<typeof commanderReturnEvidence>;
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
    "require-tokens": { type: "boolean", default: false },
    "require-observers": { type: "boolean", default: false },
    "require-statics": { type: "boolean", default: false },
    "require-spells": { type: "boolean", default: false },
    "require-removal": { type: "boolean", default: false },
    "require-triggers": { type: "boolean", default: false },
    "require-conditional-triggers": { type: "boolean", default: false },
    "require-ordered-triggers": { type: "boolean", default: false },
    "require-modifiers": { type: "boolean", default: false },
    "require-counters": { type: "boolean", default: false },
    "require-commander-replacement": { type: "boolean", default: false },
    "favor-commander-return-targets": { type: "boolean", default: false },
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
const requireConditionalTriggers = options["require-conditional-triggers"];
const requireOrderedTriggers = options["require-ordered-triggers"];
const requireTriggers = options["require-triggers"] || requireOrderedTriggers;
const twoSeed = boundedInteger(options["two-seed"], 1, 4294967200, "two-seed");
const fourSeed = boundedInteger(options["four-seed"], 1, 4294967200, "four-seed");
const requireTokens = options["require-tokens"];
const requireObservers = options["require-observers"];
const requireStatics = options["require-statics"];
const requireRemoval = options["require-removal"];
const requireModifiers = options["require-modifiers"];
const requireCounters = options["require-counters"];
const requireCommanderReplacement = options["require-commander-replacement"];
const proofDriverVersion = options["favor-commander-return-targets"]
  ? COMMANDER_RETURN_PROOF_DRIVER_VERSION
  : DRIVER_VERSION;
const requireSpells =
  options["require-spells"] ||
  requireRemoval ||
  requireModifiers ||
  requireCounters ||
  requireCommanderReplacement;
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
if (requireConditionalTriggers) stageKinds.push("pending-conditional");
if (requireOrderedTriggers) stageKinds.push("pending-ordered-trigger");
else if (requireTriggers) stageKinds.push("pending-trigger");
if (requireModifiers) stageKinds.push("active-modifier");
if (requireCounters) stageKinds.push("pending-counter");
if (requireCommanderReplacement) stageKinds.push("commander-replacement");
if (requireTokens) stageKinds.push("pending-token", "active-token", "token-departure");
if (requireStatics) stageKinds.push("pending-static", "active-static", "static-departure");
if (requireObservers) stageKinds.push(...OBSERVER_STAGES);
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
// Capture every executable proof helper so new native imports cannot escape the source pin.
for await (const name of new Bun.Glob("*.ts").scan({
  cwd: fileURLToPath(new URL(".", import.meta.url)),
})) {
  if (name.endsWith(".test.ts")) continue;
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
  driverVersion: proofDriverVersion,
  sourceHash,
  baseDriverVersion: DRIVER_VERSION,
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
    continuous: continuousEvidence(archive, coordinator),
    counters: counterEvidence(archive, release),
    tokens: tokenEvidence(archive, release, coordinator),
    statics: staticEvidence(archive, release, coordinator),
    observers: entryObserverEvidence(archive, release),
    commanderReturns: commanderReturnEvidence(archive, release, coordinator),
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
  observerCohort: string[];
  reopened?: boolean;
  exactRetry?: boolean;
};
type NativeCase = {
  manifest: MatchManifest;
  stages: NativeStage[];
  nativeRun: GameRun;
  nativeFinal: Snapshot;
  artifact: PreparedMatchArtifact | null;
};
function pendingConditionalIds(snapshot: Snapshot): string[] {
  return snapshot.triggers.pending.filter(
    (id) =>
      snapshot.triggers.abilities[id]?.program.schema === "commander-conditional-self-entry/1",
  );
}
function conditionalWorkflowCompleted(stages: NativeStage[], final: Snapshot): boolean {
  const pending = stages.find((stage) => stage.kind === "pending-conditional");
  const ids = pending ? pendingConditionalIds(pending.snapshot) : [];
  return (
    ids.length > 0 &&
    ids.every((id) => final.triggers.outcomes.some((outcome) => outcome.trigger === id))
  );
}
function qualifies(stages: NativeStage[], final: Snapshot): boolean {
  return (
    (!requireConditionalTriggers || conditionalWorkflowCompleted(stages, final)) &&
    stages.length === stageKinds.length &&
    stages.every((stage) => stage.run.status === "paused") &&
    (!requireTokens ||
      (final.tokens.creations.length > 0 &&
        final.tokens.departures.length > 0 &&
        final.tokens.cessations.length > 0)) &&
    (!requireObservers ||
      (final.observers.captures.length >= 2 && final.observers.resolved.length >= 2)) &&
    (!requireStatics ||
      (final.statics.entries.length > 0 && final.statics.departures.length > 0)) &&
    (!requireSpells || Object.keys(final.spells.resolved).length > 0) &&
    (!requireCounters || final.counters.occurrences.length > 0) &&
    (!requireCommanderReplacement ||
      stages.some(
        (stage) =>
          stage.kind === "commander-replacement" &&
          final.commanderReturns.occurrences.some(
            (occurrence) =>
              occurrence.proposal ===
              stage.snapshot.commanderReturns.pending?.frame.pendingMovement.id,
          ),
      )) &&
    (!requireTriggers || Object.keys(final.triggers.resolved).length > 0) &&
    (!requireModifiers ||
      (Object.keys(final.continuous.created).length > 0 &&
        final.continuous.expired.length > 0 &&
        stages
          .filter((stage) => stage.kind === "active-modifier")
          .every((stage) =>
            stage.snapshot.continuous.active.every((effect) =>
              final.continuous.expired.includes(effect.id),
            ),
          ))) &&
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
async function retryNativeReplacement(
  repo: Repository,
  coordinator: Coordinator,
  pending: Snapshot | undefined,
) {
  const proposal = pending?.commanderReturns.pending?.frame.pendingMovement.id;
  if (!proposal) return null;
  const archive = repo.load(coordinator.current().manifest.id);
  const record = archive?.records.find(
    (entry) =>
      entry.command.response.kind === "commander-replacement" &&
      entry.events.some(
        (event) =>
          event.type === "CommanderHandReplacementChosen" && event.data.proposal === proposal,
      ),
  );
  if (!record) throw new Error("Completed native match lacks the captured replacement answer");
  const before = await nativeSnapshot(repo, coordinator);
  expect(await coordinator.submit(record.command.actor, record.command)).toEqual({
    status: "accepted",
    receipt: record.receipt,
  });
  expect(await nativeSnapshot(repo, coordinator)).toEqual(before);
  return {
    proposal,
    command: record.command,
    receipt: record.receipt,
    unchangedStateHash: before.stateHash,
  };
}
async function retryBrowserReplacement(page: Page, pending: Snapshot | undefined) {
  const proposal = pending?.commanderReturns.pending?.frame.pendingMovement.id;
  if (!proposal) return null;
  const before = await call<Snapshot>(page, { operation: "snapshot" });
  const retried = await call<{ command: unknown; expected: unknown; result: unknown }>(page, {
    operation: "retryCommanderReplacement",
    proposal,
  });
  expect(retried.result).toEqual({ status: "accepted", receipt: retried.expected });
  expect(await call<Snapshot>(page, { operation: "snapshot" })).toEqual(before);
  return { proposal, ...retried, unchangedStateHash: before.stateHash };
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
    driverVersion: proofDriverVersion,
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
function assertTokenStage(kind: ProofStage, snapshot: Snapshot): void {
  for (const seat of snapshot.tokens.physicalCards) expect(seat.count).toBe(seat.lost ? 0 : 100);
  if (kind === "pending-token") {
    expect(snapshot.tokens.pending.length).toBeGreaterThan(0);
    for (const pending of snapshot.tokens.pending) {
      expect(pending.source.zone).toBe("stack");
      expect(pending.template?.id).toBe(pending.effect.templateId);
    }
  } else if (kind === "active-token") {
    expect(snapshot.tokens.live.length).toBeGreaterThan(0);
    for (const live of snapshot.tokens.live) {
      expect(live.object.zone).toBe("battlefield");
      expect(live.object.definition).toBe(live.template?.id);
      expect(live.object.token?.creator).toBe(live.object.owner);
    }
  } else {
    const departures = snapshot.tokens.departures.filter(
      (entry) => entry.revision === snapshot.revision,
    );
    expect(departures.length).toBeGreaterThan(0);
    for (const entry of departures) {
      expect(entry.before.zone).toBe("battlefield");
      expect(entry.after.generation).toBe(entry.before.generation + 1);
      expect(entry.after.token).toEqual(entry.before.token);
      expect(entry.cessation?.index).toBeGreaterThan(entry.movement.index);
      expect(snapshot.tokens.live.some((live) => live.object.id === entry.after.id)).toBe(false);
    }
  }
}
function assertStaticStage(kind: ProofStage, snapshot: Snapshot): void {
  for (const { object, expected } of snapshot.statics.recipients) {
    expect(object.characteristics.power).toBe(expected.power);
    expect(object.characteristics.toughness).toBe(expected.toughness);
    expect([...object.characteristics.keywords].sort()).toEqual(expected.keywords);
  }
  if (kind === "pending-static") {
    expect(snapshot.statics.pending.length).toBeGreaterThan(0);
    for (const pending of snapshot.statics.pending) {
      expect(pending.zone).toBe("stack");
      expect(snapshot.statics.liveSources.some((source) => source.id === pending.id)).toBe(false);
    }
  } else if (kind === "active-static") {
    expect(snapshot.statics.recipients.some((recipient) => recipient.statics.length > 0)).toBe(
      true,
    );
  } else {
    expect(snapshot.statics.cessationWitnesses.length).toBeGreaterThan(0);
    for (const witness of snapshot.statics.cessationWitnesses) {
      expect(
        snapshot.statics.liveSources.some(
          (source) => source.id === witness.source || source.id === witness.sourceAfter,
        ),
      ).toBe(false);
      expect(
        snapshot.statics.recipients.some((recipient) => recipient.object.id === witness.recipient),
      ).toBe(true);
    }
  }
}
function assertPausedStage(
  kind: ProofStage,
  snapshot: Snapshot,
  cohort: readonly string[] = [],
): void {
  if (OBSERVER_STAGES.some((stage) => stage === kind)) {
    expect(cohort.length).toBeGreaterThanOrEqual(2);
    const captures = cohort.map((id) => snapshot.observers.captures.find((c) => c.id === id));
    expect(captures.every((c) => c !== undefined)).toBe(true);
    expect(new Set(captures.map((c) => c?.entry.batchId)).size).toBe(1);
    if (kind === "observer-order") {
      expect(snapshot.decision?.kind).toBe("trigger-order");
      for (const id of cohort) expect(snapshot.observers.placement?.cohort ?? []).toContain(id);
    } else if (kind === "observer-stack") {
      expect(snapshot.decision?.kind).toBe("priority");
      for (const id of cohort) expect(snapshot.observers.stack).toContain(id);
    } else {
      for (const id of cohort) {
        expect(snapshot.observers.live.some((a) => a.id === id)).toBe(false);
        expect(snapshot.observers.resolved.filter((r) => r.id === id)).toHaveLength(1);
      }
    }
    return;
  }
  if (["pending-static", "active-static", "static-departure"].includes(kind)) {
    assertStaticStage(kind, snapshot);
    return;
  }
  if (kind === "pending-token" || kind === "active-token" || kind === "token-departure") {
    assertTokenStage(kind, snapshot);
    return;
  }
  if (kind === "commander-replacement") {
    const pending = snapshot.commanderReturns.pending;
    if (!pending) throw new Error("Missing captured resolving spell at the replacement decision");
    expect(snapshot.decision?.kind).toBe("commander-replacement");
    expect(pending.decision?.actor).toBe(pending.frame.pendingMovement.before.owner);
    expect(pending.priorityPlayer).toBeNull();
    expect(pending.frame.effectIndex).toBe(0);
    expect(pending.frame.program.effects[0]?.kind).toBe("return-to-hand");
    expect(pending.frame.sourceVersion).toBe(pending.sourceDefinition?.sourceVersion);
    expect(pending.frame.program).toEqual(pending.sourceDefinition?.spellProgram);
    expect(pending.currentSource).toEqual(pending.frame.source);
    expect(pending.currentSource?.zone).toBe("stack");
    expect(pending.currentTarget).toEqual(pending.frame.pendingMovement.before);
    expect(pending.currentTarget?.zone).toBe("battlefield");
    expect(pending.currentTarget?.commander).toBe(true);
    expect(pending.stack.at(-1)).toEqual({ kind: "spell", objectId: pending.frame.source.id });
    for (const view of pending.ownerViews) {
      if (view.player === pending.frame.pendingMovement.before.owner)
        expect(view.decision?.kind).toBe("commander-replacement");
      else expect(view.decision).toBeNull();
    }
    return;
  }
  if (kind === "pending-conditional") {
    expect(snapshot.decision?.kind).toBe("priority");
    expect(pendingConditionalIds(snapshot).length).toBeGreaterThan(0);
    return;
  }
  if (kind === "pending-trigger" || kind === "pending-ordered-trigger")
    expect(snapshot.triggers.pending.length).toBeGreaterThan(0);
  else if (kind === "pending-counter") {
    expect(snapshot.decision?.kind).toBe("priority");
    expect(snapshot.counters.pending.length).toBeGreaterThan(0);
  } else if (kind === "active-modifier") {
    expect(snapshot.continuous.active.length).toBeGreaterThan(0);
    expect(snapshot.continuous.absentSources.length).toBeGreaterThan(0);
  } else expect(snapshot.decision?.kind).toBe(kind);
}
async function nativeImport(
  pendingSave: string,
  prefix: string,
  manifest: MatchManifest,
  pendingSnapshot: Snapshot | undefined,
  finalSnapshot: Snapshot,
) {
  const repo = openNativeRepository(join(output, `${prefix}-import.sqlite`));
  let imported: Coordinator | undefined;
  try {
    await importMatch(repo, release, pendingSave);
    imported = await Coordinator.open(repo, release, manifest.id);
    const pending = await nativeSnapshot(repo, imported);
    expect(pending).toEqual(pendingSnapshot);
    const archive = repo.load(manifest.id);
    const retryRecords = [
      archive?.records.at(-1),
      archive?.records.find((record) => record.command.response.kind === "starting-player"),
    ];
    for (const record of retryRecords) {
      if (!record) continue;
      expect(await imported.submit(record.command.actor, record.command)).toEqual({
        status: "accepted",
        receipt: record.receipt,
      });
      expect(await nativeSnapshot(repo, imported)).toEqual(pending);
    }
    const run = await runGame(imported, {
      seed: manifest.driverSeed,
      driver: proofDriverForVersion(manifest.driverVersion),
      maxCommands: 10_000,
      onProgress: (revision) => console.log(`Native import ${manifest.mode} revision:${revision}`),
    });
    requireCompleted(run);
    const final = await nativeSnapshot(repo, imported);
    expect(final).toEqual(finalSnapshot);
    const replacementChoiceRetry = await retryNativeReplacement(repo, imported, pendingSnapshot);
    return {
      replacementChoiceRetry,
      pendingRevision: pending.revision,
      pendingHash: pending.stateHash,
      run,
      finalHash: final.stateHash,
      allBoundaryHashesEqual: true,
    };
  } finally {
    if (imported) await imported.close();
    else repo.close();
  }
}
async function reopenNative(
  repo: Repository,
  coordinator: Coordinator,
  databasePath: string,
  snapshot: Snapshot,
) {
  const matchId = coordinator.current().manifest.id;
  const archive = repo.load(matchId);
  if (!archive) throw new Error("Native pending archive missing");
  const save = await exportMatch(repo, release, matchId);
  const last = archive.records.at(-1);
  await coordinator.close();
  const reopenedRepo = openNativeRepository(databasePath);
  let reopened: Coordinator | undefined;
  try {
    reopened = await Coordinator.open(reopenedRepo, release, matchId);
    expect(await nativeSnapshot(reopenedRepo, reopened)).toEqual(snapshot);
    if (last) {
      expect(await reopened.submit(last.command.actor, last.command)).toEqual({
        status: "accepted",
        receipt: last.receipt,
      });
      expect(await nativeSnapshot(reopenedRepo, reopened)).toEqual(snapshot);
    }
    return { repo: reopenedRepo, coordinator: reopened, save, exactRetry: !!last };
  } catch (error) {
    if (reopened) await reopened.close();
    else reopenedRepo.close();
    throw error;
  }
}
function captureNativeStage(
  coordinator: Coordinator,
  kind: ProofStage,
  run: GameRun,
  snapshot: Snapshot,
  previousCohort: string[],
): NativeStage {
  let cohort = previousCohort;
  if (kind === "observer-order" && run.status === "paused") {
    const decision = coordinator.current().decision;
    if (!decision) throw new Error("Missing observer order decision");
    cohort = observerCohort(coordinator.view(decision.actor));
  }
  return { kind, run, snapshot, observerCohort: [...cohort] };
}
async function nativeCase(seatCount: 2 | 4): Promise<NativeCase> {
  for (let attempt = 0; attempt < seedAttempts; attempt++) {
    const { manifest, artifact } = await prepareCase(seatCount, attempt);
    const gameSeed = manifest.gameSeed;
    const prefix = `${seatCount}-seat-attempt-${attempt}`;
    if (artifact)
      await Bun.write(join(output, `${prefix}-artifact.json`), JSON.stringify(artifact, null, 2));
    await Bun.write(join(output, `${prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    const databasePath = join(output, `${prefix}.sqlite`);
    let repo = openNativeRepository(databasePath);
    let coordinator: Coordinator | undefined;
    let pendingSave: string | undefined;
    const stages: NativeStage[] = [];
    let selectedObserverCohort: string[] = [];
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
      expect(execution.tokenTemplateCount).toBe(
        artifact?.retainedTokenTemplates.length ?? Object.keys(release.tokenTemplates ?? {}).length,
      );
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
          driver: proofDriverForVersion(manifest.driverVersion),
          maxCommands: 10_000,
          stopAt: (observation) =>
            atProofStage(
              observation,
              kind,
              coordinator?.current().events,
              release,
              coordinator?.current().continuousEffects,
              selectedObserverCohort,
            ),
          onProgress: (revision) => console.log(`Native ${seatCount}-seat revision:${revision}`),
        });
        const snapshot = await nativeSnapshot(repo, coordinator);
        const stage = captureNativeStage(coordinator, kind, run, snapshot, selectedObserverCohort);
        selectedObserverCohort = stage.observerCohort;
        stages.push(stage);
        if (kind === "starting-player") assertUndealt(snapshot, seatCount);
        if (run.status !== "paused") {
          requireCompleted(run); // Actual engine/driver/budget failures are not discarded as seed misses.
          break;
        }
        assertPausedStage(kind, snapshot, selectedObserverCohort);
        const recovered = await reopenNative(repo, coordinator, databasePath, snapshot);
        repo = recovered.repo;
        coordinator = recovered.coordinator;
        pendingSave = recovered.save;
        await Bun.write(join(output, `${prefix}-${kind}-save.json`), pendingSave);
        stage.reopened = true;
        stage.exactRetry = recovered.exactRetry;
      }
      const nativeRun = await runGame(coordinator, {
        seed: manifest.driverSeed,
        driver: proofDriverForVersion(manifest.driverVersion),
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
      if (exercised)
        attemptEvidence.replacementChoiceRetry = await retryNativeReplacement(
          repo,
          coordinator,
          stages.find((stage) => stage.kind === "commander-replacement")?.snapshot,
        );
      if (exercised && pendingSave)
        attemptEvidence.nativeImport = await nativeImport(
          pendingSave,
          prefix,
          manifest,
          stages.at(-1)?.snapshot,
          nativeFinal,
        );
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
        ...(stage.observerCohort ? { observerCohort: stage.observerCohort } : {}),
        maxCommands: 10_000,
      });
      expect(paused.status).toBe("paused");
      const pending = await call<Snapshot>(page, { operation: "snapshot" });
      assertPausedStage(stage.kind, pending, stage.observerCohort);
      expect(pending.tokens).toEqual(stage.snapshot.tokens);
      expect(pending.statics).toEqual(stage.snapshot.statics);
      expect(pending.observers).toEqual(stage.snapshot.observers);
      expect(pending.continuous).toEqual(stage.snapshot.continuous);
      expect(pending.counters).toEqual(stage.snapshot.counters);
      expect(pending.commanderReturns).toEqual(stage.snapshot.commanderReturns);
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
      let stageImport: Snapshot | null = null;
      if (
        (requireTokens &&
          ["pending-token", "active-token", "token-departure"].includes(stage.kind)) ||
        (requireStatics &&
          ["pending-static", "active-static", "static-departure"].includes(stage.kind)) ||
        (requireObservers && OBSERVER_STAGES.some((s) => s === stage.kind)) ||
        (requireConditionalTriggers && stage.kind === "pending-conditional")
      ) {
        await call(page, { operation: "close" });
        stageImport = await call<Snapshot>(page, {
          operation: "import",
          namespace: `${namespace}-import-${stage.kind}`,
          text: stageSave,
        });
        expect(stageImport).toEqual(pending);
        await verifyDurableRetry(page, "retryLast");
        expect(await call<Snapshot>(page, { operation: "snapshot" })).toEqual(pending);
        await call(page, { operation: "close" });
        expect(
          await call<Snapshot>(page, { operation: "open", namespace, matchId: manifest.id }),
        ).toEqual(pending);
      }
      // Import the final required workflow checkpoint, matching nativeImport.
      saved = stageSave;
      importedExpected = pending;
      browserStages.push({
        kind: stage.kind,
        observerCohort: stage.observerCohort ?? null,
        paused,
        pending,
        reopened,
        exactRetry: pending.revision > 0,
        startingChoiceRetry: pending.revision > 0,
        stageImport,
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
    expect(completed.tokens).toEqual(baseline.nativeFinal.tokens);
    expect(completed.statics).toEqual(baseline.nativeFinal.statics);
    expect(completed.observers).toEqual(baseline.nativeFinal.observers);
    expect(completed.spells).toEqual(baseline.nativeFinal.spells);
    expect(completed.triggers).toEqual(baseline.nativeFinal.triggers);
    expect(completed.continuous).toEqual(baseline.nativeFinal.continuous);
    expect(completed.counters).toEqual(baseline.nativeFinal.counters);
    expect(completed.commanderReturns).toEqual(baseline.nativeFinal.commanderReturns);
    if (requireCommanderReplacement)
      expect(completed.commanderReturns.occurrences.length).toBeGreaterThan(0);
    if (requireCounters) expect(completed.counters.occurrences.length).toBeGreaterThan(0);
    expect(completed.execution).toEqual(baseline.nativeFinal.execution);
    assertSingleChoice(completed);
    expect(completed.setup.firstChoice).toEqual(baseline.nativeFinal.setup.firstChoice);
    if (requireRemoval)
      expect(
        completed.spells.removalEvents.destroy + completed.spells.removalEvents.exile,
      ).toBeGreaterThan(0);
    if (requireSpells) expect(Object.keys(completed.spells.resolved).length).toBeGreaterThan(0);
    if (requireModifiers) {
      expect(Object.keys(completed.continuous.created).length).toBeGreaterThan(0);
      expect(completed.continuous.expired.length).toBeGreaterThan(0);
    }
    expect(resumed).toEqual(baseline.nativeRun);
    const replacementChoiceRetry = await retryBrowserReplacement(page, importedExpected);
    await call(page, { operation: "close" });
    await page.reload({ waitUntil: "load" });
    const imported = await call<Snapshot>(page, {
      operation: "import",
      namespace: `${namespace}-import`,
      text: saved,
    });
    expect(imported).toEqual(importedExpected);
    if (imported.revision > 0) {
      await verifyDurableRetry(page, "retryLast");
      await verifyDurableRetry(page, "retryStartingChoice");
      expect(await call<Snapshot>(page, { operation: "snapshot" })).toEqual(imported);
    }
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
    expect(importedFinal.tokens).toEqual(completed.tokens);
    expect(importedFinal.statics).toEqual(completed.statics);
    expect(importedFinal.observers).toEqual(completed.observers);
    expect(importedFinal.commanderReturns).toEqual(completed.commanderReturns);
    const importedReplacementChoiceRetry = await retryBrowserReplacement(page, importedExpected);
    caseEvidence.browser = {
      stages: browserStages,
      replacementChoiceRetry,
      importedReplacementChoiceRetry,
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
    commanderReplacementRequired: requireCommanderReplacement,
    tokenLifecycleRequired: requireTokens,
    staticLifecycleRequired: requireStatics,
    conditionalTriggerRequired: requireConditionalTriggers,
    conditionalConditionChecks: completedBrowserStates.flatMap(
      (state) => state.triggers.conditionChecks,
    ),
    observerLifecycleRequired: requireObservers,
    observerCaptures: completedBrowserStates.flatMap((state) => state.observers.captures),
    observerResolutions: completedBrowserStates.flatMap((state) => state.observers.resolved),
    staticEntries: completedBrowserStates.flatMap((state) => state.statics.entries),
    staticDepartures: completedBrowserStates.flatMap((state) => state.statics.departures),
    commanderReplacements: completedBrowserStates.flatMap(
      (state) => state.commanderReturns.occurrences,
    ),
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
