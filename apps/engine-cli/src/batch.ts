import { mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { verifySourceRelease } from "@iwsdk-apps/compiler/prepared";
import {
  CHANCE_VERSION,
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  MatchManifest,
  type PreparedMatchArtifact,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { admitDeck } from "@iwsdk-apps/engine";
import { DRIVER_VERSION, runGame } from "@iwsdk-apps/simulation";
import { Coordinator, replayMatch } from "@iwsdk-apps/storage";
import { openNativeRepository } from "@iwsdk-apps/storage/native";
import { z } from "zod";
import { archiveBuild, writeEvidence } from "./evidence";
import {
  AttemptTelemetry,
  HOST_TELEMETRY_VERSION,
  hostRuntimeDeclaration,
  writeNewTelemetry,
} from "./host-telemetry";

/** Diversity accounting only; preserve original IDs and row order in execution/replay pins. */
export function deckCompositionKey(deck: DeckRevision): string {
  return canonicalJson({
    commander: deck.commander,
    entries: [...deck.entries].sort((a, b) =>
      a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0,
    ),
  });
}

/** Predeclare all attempts, retain failures, and replay outcomes separately from game counts. */
export async function runBatch(
  directory: string,
  options: { id: string; two: number; four: number; seed: number; maxCommands: number },
  contentPath = resolve(directory, "development-release.json"),
  decksPath = resolve(directory, "development-decks.json"),
): Promise<void> {
  const content = ContentRelease.parse(await Bun.file(contentPath).json());
  const decks = z
    .array(DeckRevision)
    .min(12)
    .parse(await Bun.file(decksPath).json());
  await verifySourceRelease(content);
  if (content.processorAbi !== ENGINE_VERSION) throw new Error("Batch release ABI mismatch");
  for (const deck of decks) {
    const { hash, ...body } = deck;
    if ((await semanticHash(body)) !== hash) throw new Error("Batch deck hash is invalid");
    admitDeck(deck, content);
  }
  if (new Set(decks.map(deckCompositionKey)).size < 12)
    throw new Error("Batch requires at least twelve distinct deck compositions");
  const root = resolve(directory, "batches", options.id);
  await mkdir(root, { recursive: false });
  const buildHash = await archiveBuild(directory);
  const assignments: MatchManifest[] = [];
  for (let index = 0; index < options.two + options.four; index++) {
    const two = index < options.two;
    const deckOffset = index % decks.length;
    const manifest = MatchManifest.parse({
      schema: "commander-match/1",
      id: `${options.id}:${index}`,
      releaseHash: content.hash,
      engineVersion: ENGINE_VERSION,
      serializer: SERIALIZER_VERSION,
      chance: CHANCE_VERSION,
      gameSeed: options.seed + index,
      driverSeed: options.seed + index + 104729,
      driverVersion: DRIVER_VERSION,
      mode: two ? "two-seat" : "four-seat",
      resolver: "full-scan",
      seats: Array.from({ length: two ? 2 : 4 }, (_, seat) => {
        const deck = decks[(deckOffset + seat * 3) % decks.length];
        if (!deck) throw new Error("Missing declared deck");
        return { id: `seat-${seat + 1}`, deck };
      }),
    });
    assignments.push(manifest);
  }
  await writeEvidence(resolve(root, "assignments.json"), {
    schema: "commander-batch/1",
    phase: "development-discovery",
    buildHash,
    releaseHash: content.hash,
    maxCommands: options.maxCommands,
    assignments,
  });
  await writeEvidence(resolve(root, "release.json"), content);
  await executeAssignedGames(root, buildHash, content, assignments, options.maxCommands);
}

async function runAssignedAttempt(
  root: string,
  index: number,
  buildHash: string,
  content: ContentRelease,
  manifest: MatchManifest,
  maxCommands: number,
  artifacts: Readonly<Record<string, PreparedMatchArtifact>>,
): Promise<Record<string, unknown>> {
  const telemetry = new AttemptTelemetry({ index, matchId: manifest.id, buildHash });
  let repo: ReturnType<typeof openNativeRepository> | undefined;
  let coordinator: Coordinator | undefined;
  let gameStatus = "not-started",
    acceptedCommands: number | null = 0,
    resultReportedCommands: number | null = null;
  let replayVerified = false,
    hostError: string | null = null;
  let disposition: Record<string, unknown>;
  try {
    const session = await telemetry.measure("create", async () => {
      repo = openNativeRepository(resolve(root, `${index}.sqlite`));
      const artifact = manifest.preparedArtifactHash
        ? artifacts[manifest.preparedArtifactHash]
        : undefined;
      coordinator = await Coordinator.create(repo, content, manifest, artifact);
      return { repo, coordinator };
    });
    gameStatus = "no-game-result";
    const result = await telemetry.measure("game", () =>
      runGame(session.coordinator, {
        seed: manifest.driverSeed,
        maxCommands,
        onProgress: (revision) => telemetry.sample("progress", revision),
      }),
    );
    gameStatus = result.status;
    resultReportedCommands = result.commands;
    const replayHash = await telemetry.measure("replay", async () => {
      const replay = await replayMatch(session.repo, content, manifest.id);
      const hash = await semanticHash(replay);
      if (hash !== result.stateHash) throw new Error("Replay did not reproduce final boundary");
      return hash;
    });
    replayVerified = true;
    disposition = {
      index,
      ...result,
      replay: { verified: true, stateHash: replayHash },
      buildHash,
    };
  } catch (error) {
    hostError = error instanceof Error ? error.message : String(error);
    disposition = {
      index,
      matchId: manifest.id,
      status: "host-failed",
      message: hostError,
      buildHash,
    };
  } finally {
    if (repo) {
      try {
        acceptedCommands = repo.load(manifest.id)?.records.length ?? 0;
      } catch (error) {
        acceptedCommands = null;
        hostError = [
          hostError,
          `Could not read accepted-command receipts: ${error instanceof Error ? error.message : String(error)}`,
        ]
          .filter(Boolean)
          .join("; ");
      }
    }
    try {
      await telemetry.measure("close", async () => {
        if (coordinator) await coordinator.close();
        else repo?.close();
      });
    } catch (error) {
      hostError = [
        hostError,
        `Close failed: ${error instanceof Error ? error.message : String(error)}`,
      ]
        .filter(Boolean)
        .join("; ");
    }
  }
  if (hostError) disposition = { ...disposition, status: "host-failed", message: hostError };
  const telemetryFile = `${index}.telemetry.json`;
  const report = telemetry.finish({
    gameStatus,
    acceptedCommands,
    resultReportedCommands,
    replayVerified,
    hostError,
  });
  await writeNewTelemetry(resolve(root, telemetryFile), report);
  return {
    ...disposition,
    telemetry: { schema: HOST_TELEMETRY_VERSION, path: telemetryFile, acceptedCommands },
  };
}

async function startBatchTelemetry(root: string): Promise<void> {
  const existing = await readdir(root);
  if (
    existing.some(
      (name) =>
        ["report.json", "progress.json", "host-runtime.json"].includes(name) ||
        /^\d+\.(?:result\.json|telemetry\.json|sqlite(?:-wal|-shm)?)$/.test(name),
    )
  )
    throw new Error(
      "Batch execution output already exists; refusing to replace historical results or telemetry",
    );
  await writeNewTelemetry(resolve(root, "host-runtime.json"), hostRuntimeDeclaration());
}

/** Execute retained assignments; new host metrics never alter canonical game inputs or count replay as play. */
export async function executeAssignedGames(
  root: string,
  buildHash: string,
  content: ContentRelease,
  assignments: MatchManifest[],
  maxCommands: number,
  artifacts: Readonly<Record<string, PreparedMatchArtifact>> = {},
): Promise<void> {
  await startBatchTelemetry(root);
  const dispositions: Record<string, unknown>[] = [];
  let completed = 0;
  for (const [index, manifest] of assignments.entries()) {
    const disposition = await runAssignedAttempt(
      root,
      index,
      buildHash,
      content,
      manifest,
      maxCommands,
      artifacts,
    );
    dispositions.push(disposition);
    await writeEvidence(resolve(root, `${index}.result.json`), disposition);
    if (disposition.status === "completed") completed++;
    console.log(
      `${index + 1}/${assignments.length} ${manifest.mode}: ${disposition.status}, telemetry retained`,
    );
    await writeEvidence(resolve(root, "progress.json"), {
      assigned: assignments.length,
      accounted: dispositions.length,
      completed,
      pending: assignments.length - dispositions.length,
    });
  }
  await writeEvidence(resolve(root, "report.json"), {
    schema: "commander-batch-report/1",
    buildHash,
    releaseHash: content.hash,
    assigned: assignments.length,
    accounted: dispositions.length,
    completed,
    pending: 0,
    dispositions,
    assurance: "development-subset",
    fullSnapshotSupported: false,
    hostTelemetry: {
      schema: HOST_TELEMETRY_VERSION,
      runtime: "host-runtime.json",
      attempts: assignments.map((_, index) => `${index}.telemetry.json`),
      scope:
        "Measurements collected during this invocation only; process-wide CPU/memory, separate create/game/replay/close phases.",
    },
  });
  console.log(`Retained batch: ${root}`);
  if (completed !== assignments.length) process.exitCode = 1;
}
