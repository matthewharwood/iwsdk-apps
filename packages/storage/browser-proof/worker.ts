import {
  ContentRelease,
  GameCommand,
  MatchManifest,
  PreparedMatchArtifact,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { z } from "zod";
// Test-only relative import avoids adding a storage -> simulation workspace cycle.
import { runGame } from "../../simulation/src/index";
import { openBrowserRepository } from "../src/browser";
import {
  Coordinator,
  exportMatch,
  importMatch,
  type Repository,
  replayMatch,
  StorageError,
} from "../src/index";
import { commanderReturnEvidence } from "./commander-return-evidence";
import { entryObserverEvidence } from "./entry-observer-evidence";
import { proofDriverForVersion } from "./proof-driver";
import {
  atProofStage,
  continuousEvidence,
  counterEvidence,
  executionEvidence,
  setupEvidence,
  spellEvidence,
  triggerEvidence,
} from "./spell-evidence";
import { staticEvidence } from "./static-evidence";
import { tokenEvidence } from "./token-evidence";

const Request = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("create"),
    namespace: z.string(),
    manifest: MatchManifest,
    artifact: PreparedMatchArtifact.nullable(),
  }),
  z.strictObject({ operation: z.literal("open"), namespace: z.string(), matchId: z.string() }),
  z.strictObject({ operation: z.literal("import"), namespace: z.string(), text: z.string() }),
  z.strictObject({
    operation: z.literal("run"),
    stopAt: z
      .enum([
        "observer-order",
        "observer-stack",
        "observer-resolved",
        "starting-player",
        "payment",
        "target",
        "pending-trigger",
        "pending-ordered-trigger",
        "active-modifier",
        "pending-counter",
        "commander-replacement",
        "pending-token",
        "active-token",
        "token-departure",
        "pending-static",
        "active-static",
        "static-departure",
      ])
      .nullable(),
    observerCohort: z.array(z.string().min(1).max(240)).max(1000).optional(),
    maxCommands: z.number().int().positive().max(20_000),
  }),
  z.strictObject({ operation: z.literal("snapshot") }),
  z.strictObject({ operation: z.literal("submit"), actor: z.string(), command: GameCommand }),
  z.strictObject({ operation: z.literal("export") }),
  z.strictObject({ operation: z.literal("retryLast") }),
  z.strictObject({ operation: z.literal("retryStartingChoice") }),
  z.strictObject({ operation: z.literal("retryCommanderReplacement"), proposal: z.string() }),
  z.strictObject({ operation: z.literal("close") }),
]);
let repo: Repository | null = null;
let coordinator: Coordinator | null = null;
let release: ContentRelease | null = null;

function requireOpen() {
  if (!repo || !coordinator || !release) throw new Error("No match is open in this test worker");
  return { repo, coordinator, release };
}
async function connect(namespace: string) {
  if (repo) throw new Error("Close the existing test connection first");
  release = ContentRelease.parse(await (await fetch("/release.json")).json());
  repo = await openBrowserRepository(namespace, new URL("/sqlite3.wasm", self.location.href).href);
  return { repo, release };
}
async function snapshot() {
  const session = requireOpen();
  const state = session.coordinator.current();
  const archive = session.repo.load(state.manifest.id);
  if (!archive) throw new Error("Stored match vanished");
  const replayed = await replayMatch(session.repo, session.release, state.manifest.id);
  return {
    revision: state.revision,
    stateHash: await semanticHash(state),
    replayHash: await semanticHash(replayed),
    boundaryHashes: [
      archive.initialHash,
      ...archive.records.map((record) => record.receipt.stateHash),
    ],
    decision: state.decision,
    outcome: state.outcome,
    spells: spellEvidence(archive, session.release),
    triggers: triggerEvidence(archive),
    continuous: continuousEvidence(archive, session.coordinator),
    counters: counterEvidence(archive, session.release),
    tokens: tokenEvidence(archive, session.release, session.coordinator),
    statics: staticEvidence(archive, session.release, session.coordinator),
    observers: entryObserverEvidence(archive, session.release),
    commanderReturns: commanderReturnEvidence(archive, session.release, session.coordinator),
    execution: executionEvidence(session.release, session.coordinator.executionInfo()),
    setup: setupEvidence(session.coordinator, archive),
    storage: {
      secureContext: globalThis.isSecureContext,
      opfs: !!navigator.storage?.getDirectory,
      locks: !!navigator.locks,
    },
  };
}
async function handle(input: unknown): Promise<unknown> {
  const request = Request.parse(input);
  switch (request.operation) {
    case "create": {
      const session = await connect(request.namespace);
      coordinator = await Coordinator.create(
        session.repo,
        session.release,
        request.manifest,
        request.artifact ?? undefined,
      );
      return snapshot();
    }
    case "open": {
      const session = await connect(request.namespace);
      coordinator = await Coordinator.open(session.repo, session.release, request.matchId);
      return snapshot();
    }
    case "import": {
      const session = await connect(request.namespace);
      const state = await importMatch(session.repo, session.release, request.text);
      coordinator = await Coordinator.open(session.repo, session.release, state.manifest.id);
      return snapshot();
    }
    case "run": {
      const session = requireOpen();
      return runGame(session.coordinator, {
        seed: session.coordinator.current().manifest.driverSeed,
        driver: proofDriverForVersion(session.coordinator.current().manifest.driverVersion),
        maxCommands: request.maxCommands,
        ...(request.stopAt
          ? {
              stopAt: (observation) =>
                request.stopAt !== null &&
                atProofStage(
                  observation,
                  request.stopAt,
                  session.coordinator.current().events,
                  session.release,
                  session.coordinator.current().continuousEffects,
                  request.observerCohort,
                ),
            }
          : {}),
        onProgress: (revision) => self.postMessage({ progress: revision }),
      });
    }
    case "snapshot":
      return snapshot();
    case "submit":
      return requireOpen().coordinator.submit(request.actor, request.command);
    case "export": {
      const session = requireOpen();
      return exportMatch(session.repo, session.release, session.coordinator.current().manifest.id);
    }
    case "retryLast":
    case "retryStartingChoice": {
      const session = requireOpen();
      const archive = session.repo.load(session.coordinator.current().manifest.id);
      const record =
        request.operation === "retryLast"
          ? archive?.records.at(-1)
          : archive?.records.find((entry) => entry.command.response.kind === "starting-player");
      if (!record) throw new Error("No durable command to retry");
      return {
        expected: record.receipt,
        result: await session.coordinator.submit(record.command.actor, record.command),
      };
    }
    case "retryCommanderReplacement": {
      const session = requireOpen();
      const archive = session.repo.load(session.coordinator.current().manifest.id);
      const record = archive?.records.find(
        (entry) =>
          entry.command.response.kind === "commander-replacement" &&
          entry.events.some(
            (event) =>
              event.type === "CommanderHandReplacementChosen" &&
              event.data.proposal === request.proposal,
          ),
      );
      if (!record) throw new Error("No accepted replacement command matches the captured proposal");
      return {
        command: record.command,
        expected: record.receipt,
        result: await session.coordinator.submit(record.command.actor, record.command),
      };
    }
    case "close": {
      if (coordinator) await coordinator.close();
      else repo?.close();
      coordinator = null;
      repo = null;
      return { closed: true };
    }
  }
}

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<unknown>) => {
  const envelope = z.strictObject({ id: z.number().int(), request: z.unknown() }).parse(event.data);
  queue = queue.then(async () => {
    try {
      self.postMessage({ id: envelope.id, ok: true, value: await handle(envelope.request) });
    } catch (error) {
      self.postMessage({
        id: envelope.id,
        ok: false,
        error: {
          code: error instanceof StorageError ? error.code : "TestWorkerFailure",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
};
