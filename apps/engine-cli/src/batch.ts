import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CHANCE_VERSION,
  ContentRelease,
  DeckRevision,
  ENGINE_VERSION,
  type MatchManifest,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { DRIVER_VERSION, runGame } from "@iwsdk-apps/simulation";
import { Coordinator, replayMatch } from "@iwsdk-apps/storage";
import { openNativeRepository } from "@iwsdk-apps/storage/native";
import { z } from "zod";
import { archiveBuild, writeEvidence } from "./evidence";

/** Predeclare all attempts, retain failures, and replay outcomes separately from game counts. */
export async function runBatch(
  directory: string,
  options: { id: string; two: number; four: number; seed: number; maxCommands: number },
): Promise<void> {
  const content = ContentRelease.parse(
    await Bun.file(resolve(directory, "development-release.json")).json(),
  );
  const decks = z
    .array(DeckRevision)
    .min(12)
    .parse(await Bun.file(resolve(directory, "development-decks.json")).json());
  const root = resolve(directory, "batches", options.id);
  await mkdir(root, { recursive: false });
  const buildHash = await archiveBuild(directory);
  const assignments: MatchManifest[] = [];
  for (let index = 0; index < options.two + options.four; index++) {
    const two = index < options.two;
    const deckOffset = index % decks.length;
    const manifest: MatchManifest = {
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
    };
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
  const dispositions: unknown[] = [];
  let completed = 0;
  for (const [index, manifest] of assignments.entries()) {
    const repo = openNativeRepository(resolve(root, `${index}.sqlite`));
    let coordinator: Coordinator | undefined;
    try {
      coordinator = await Coordinator.create(repo, content, manifest);
      const result = await runGame(coordinator, {
        seed: manifest.driverSeed,
        maxCommands: options.maxCommands,
      });
      const replay = await replayMatch(repo, content, manifest.id);
      const replayHash = await semanticHash(replay);
      if (replayHash !== result.stateHash)
        throw new Error("Replay did not reproduce final boundary");
      const disposition = {
        index,
        ...result,
        replay: { verified: true, stateHash: replayHash },
        buildHash,
      };
      dispositions.push(disposition);
      await writeEvidence(resolve(root, `${index}.result.json`), disposition);
      if (result.status === "completed") completed++;
      console.log(
        `${index + 1}/${assignments.length} ${manifest.mode}: ${result.status}, ${result.commands} commands, turn ${result.turn}, replay verified`,
      );
    } catch (error) {
      const disposition = {
        index,
        matchId: manifest.id,
        status: "host-failed",
        message: error instanceof Error ? error.message : String(error),
        buildHash,
      };
      dispositions.push(disposition);
      await writeEvidence(resolve(root, `${index}.result.json`), disposition);
      console.error(`${index + 1}/${assignments.length}: ${disposition.message}`);
    } finally {
      if (coordinator) await coordinator.close();
      else repo.close();
    }
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
  });
  console.log(`Retained batch: ${root}`);
  if (completed !== assignments.length) process.exitCode = 1;
}
