import { Database } from "bun:sqlite";
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson, RulesState, semanticHash } from "@iwsdk-apps/contracts";
import { constructedTriggerStart, SCENARIO_ADAPTER } from "./multi-trigger-adapter";
import { triggerCommand, triggerFixtures } from "./triggers";

// Mocking is process-local. The parent unit runner and all ordinary-match tests retain
// actual createMatch; this child identifies its constructed initial-state semantics.
const realEngine = { ...(await import("../../engine/src/index")) };
mock.module("@iwsdk-apps/engine", () => ({
  ...realEngine,
  createMatch: (
    manifest: Parameters<typeof realEngine.createMatch>[0],
    registry: Parameters<typeof realEngine.createMatch>[1],
  ) => constructedTriggerStart(manifest, registry, realEngine),
}));
const { Coordinator, createRepository, exportMatch, importMatch, replayMatch } = await import(
  "../src/index"
);
const { openNativeRepository } = await import("../src/native");
const directory = mkdtempSync(join(tmpdir(), "commander-multi-trigger-child-"));
const repositories: { close(): void }[] = [];
function open(path: string) {
  const repo = openNativeRepository(join(directory, path));
  repositories.push(repo);
  return repo;
}
try {
  const { release, manifest } = await triggerFixtures("constructed-multi-trigger-storage");
  manifest.driverVersion = SCENARIO_ADAPTER;
  const repo = open("original.sqlite");
  const coordinator = await Coordinator.create(repo, release, manifest);
  const initial = coordinator.current();
  assert.equal(initial.revision, 0);
  assert.equal(initial.decision?.kind, "trigger-order");
  assert.equal(initial.decision?.actor, "A");
  const triggers = initial.decision?.triggers;
  assert.equal(triggers?.length, 2);
  if (!triggers) throw new Error("No trigger domain");
  assert.equal(coordinator.view("B").decision, null);
  assert.deepEqual(coordinator.view("A").decision?.triggers, triggers);
  assert.deepEqual(RulesState.parse(JSON.parse(canonicalJson(initial))), initial);
  assert.deepEqual(repo.load(manifest.id)?.initial, initial);
  assert.deepEqual(await replayMatch(repo, release, manifest.id), initial);
  const oldSource = Object.values(initial.abilities).find(
    (ability) =>
      ability.program.schema === "commander-trigger/1" && ability.program.effect.kind === "draw",
  )?.source;
  if (!oldSource) throw new Error("No captured draw source");
  assert.equal(initial.objects[oldSource.id], undefined);
  assert.equal(
    Object.values(initial.objects).find((entry) => entry.lineage === oldSource.lineage)?.zone,
    "graveyard",
  );
  const beforeHash = await semanticHash(initial);
  const order = triggerCommand(initial, {
    kind: "trigger-order",
    triggers: [...triggers].reverse(),
  });
  for (const bad of [
    { ...order, response: { kind: "trigger-order", triggers: [triggers[0], triggers[0]] } },
    { ...order, response: { kind: "trigger-order", triggers: [triggers[0], "foreign-ability"] } },
    { ...order, revision: 1 },
  ]) {
    const result = await coordinator.submit("A", bad);
    assert.equal(result.status, "rejected");
    assert.equal(await semanticHash(coordinator.current()), beforeHash);
  }
  assert.equal((await coordinator.submit("B", order)).status, "rejected");
  const logical = await exportMatch(repo, release, manifest.id);
  await coordinator.close();
  const restoredRepo = open("original.sqlite");
  const restored = await Coordinator.open(restoredRepo, release, manifest.id);
  const importedRepo = open("imported.sqlite");
  assert.deepEqual(await importMatch(importedRepo, release, logical), initial);
  const imported = await Coordinator.open(importedRepo, release, manifest.id);
  const result = await restored.submit("A", order);
  assert.equal(result.status, "accepted");
  if (result.status !== "accepted") throw new Error(JSON.stringify(result));
  assert.deepEqual(await imported.submit("A", order), result);
  assert.deepEqual(
    restored.current().stack,
    order.response.kind === "trigger-order"
      ? order.response.triggers.map((triggerId) => ({ kind: "triggered-ability", triggerId }))
      : [],
  );
  assert.deepEqual(restored.current(), imported.current());
  await restored.close();
  const acceptedRepo = open("original.sqlite");
  const accepted = await Coordinator.open(acceptedRepo, release, manifest.id);
  assert.deepEqual(await accepted.submit("A", order), result);
  assert.equal(accepted.current().revision, 1);
  const conflict = { ...order, response: { kind: "trigger-order", triggers } };
  assert.equal((await accepted.submit("A", conflict)).status, "rejected");
  const acceptedLogical = await exportMatch(acceptedRepo, release, manifest.id);
  const acceptedImportedRepo = open("accepted-import.sqlite");
  await importMatch(acceptedImportedRepo, release, acceptedLogical);
  const acceptedImported = await Coordinator.open(acceptedImportedRepo, release, manifest.id);
  assert.deepEqual(await acceptedImported.submit("A", order), result);
  const beforeHand = initial.players[0]?.hand.length;
  for (const session of [accepted, imported, acceptedImported]) {
    for (let pass = 0; pass < 4; pass++) {
      const command = triggerCommand(session.current(), { kind: "pass" });
      assert.equal((await session.submit(command.actor, command)).status, "accepted");
    }
    assert.equal(session.current().players[0]?.life, 43);
    assert.equal(session.current().players[0]?.hand.length, (beforeHand ?? 0) + 1);
    assert.deepEqual(session.current().abilities, {});
    assert.deepEqual(session.current().stack, []);
  }
  assert.deepEqual(accepted.current(), imported.current());
  assert.deepEqual(accepted.current(), acceptedImported.current());
  assert.deepEqual(await replayMatch(acceptedRepo, release, manifest.id), accepted.current());
  // The transaction rollback proof is specific to a pending multi-ID decision.
  const db = new Database(join(directory, "fault.sqlite"));
  let failBoundary = false;
  const faultRepo = createRepository({
    exec(sql, values = []) {
      if (failBoundary && sql.startsWith("INSERT INTO commander_boundaries"))
        throw new Error("Injected trigger boundary failure");
      if (values.length) db.query(sql).run(...values);
      else db.exec(sql);
    },
    rows(sql, values = []) {
      return db.query(sql).all(...values) as Record<string, unknown>[];
    },
    close() {
      db.close();
    },
  });
  repositories.push(faultRepo);
  const faultCoordinator = await Coordinator.create(faultRepo, release, manifest);
  failBoundary = true;
  assert.equal((await faultCoordinator.submit("A", order)).status, "fault");
  assert.deepEqual(faultCoordinator.current(), initial);
  assert.equal(faultRepo.load(manifest.id)?.records.length, 0);
  assert.equal(faultRepo.findRecord(manifest.id, order.commandId), null);
  failBoundary = false;
  assert.deepEqual(await faultCoordinator.submit("A", order), result);
  console.log(
    JSON.stringify({
      status: "passed",
      scenarioAdapter: SCENARIO_ADAPTER,
      ordinaryCommandReachable: false,
      sourceBackedCards: true,
      checks: [
        "strict-schema-roundtrip",
        "native-sqlite",
        "pending-order-reopen",
        "pending-order-import",
        "exact-retry-after-reopen-and-import",
        "conflicting-retry",
        "invalid-order-no-mutation",
        "source-incarnation-survival",
        "same-initializer-replay",
        "atomic-failure-rollback",
      ],
      initialHash: beforeHash,
      finalHash: await semanticHash(accepted.current()),
      triggerIds: triggers,
      order,
      orderReceipt: result.receipt,
      boundaryHashes: [
        acceptedRepo.load(manifest.id)?.initialHash,
        ...(acceptedRepo.load(manifest.id)?.records.map((record) => record.receipt.stateHash) ??
          []),
      ],
      acceptedCommands: accepted.current().revision,
    }),
  );
} finally {
  for (const repo of repositories.reverse()) {
    try {
      repo.close();
    } catch {
      /* Closed explicitly. */
    }
  }
  rmSync(directory, { recursive: true, force: true });
}
