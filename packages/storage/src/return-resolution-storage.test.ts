import { Database } from "bun:sqlite";
import { afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPreparedMatchArtifact } from "@iwsdk-apps/compiler/prepared";
import {
  type ContentRelease,
  canonicalJson,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  reachCommanderReplacement,
  replacementCommand,
  storageReturnFixture,
} from "../test-fixtures/return-source";
import {
  Coordinator,
  createRepository,
  exportMatch,
  importMatch,
  type Repository,
  replayMatch,
  type SqlDatabase,
} from "./index";
import { openNativeRepository } from "./native";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) {
    try {
      close();
    } catch {
      // A coordinator may already have closed its owned connection.
    }
  }
});
function path(): string {
  const directory = mkdtempSync(join(tmpdir(), "commander-return-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "matches.sqlite");
}
function open(file = path()): Repository {
  const repo = openNativeRepository(file);
  cleanup.push(() => repo.close());
  return repo;
}

let release: ContentRelease;
let logical: string;
let pending: RulesState;
beforeAll(async () => {
  const fixture = await storageReturnFixture("ordinary-return-durability");
  release = fixture.release;
  const artifact = await createPreparedMatchArtifact(
    release,
    fixture.manifest.seats.map((seat) => seat.deck),
  );
  const manifest = {
    ...fixture.manifest,
    resolver: "prepared-indexed" as const,
    preparedArtifactHash: artifact.hash,
  };
  const repo = openNativeRepository(":memory:");
  const coordinator = await Coordinator.create(repo, release, manifest, artifact);
  try {
    // Seed14 was selected by an explicit bounded initial-hand search. All160 accepted
    // setup/land/cast/payment/pass commands are retained and replayed, with no state edits.
    await reachCommanderReplacement(coordinator);
    pending = coordinator.current();
    expect(pending.revision).toBe(160);
    expect(pending.decision?.kind).toBe("commander-replacement");
    expect(coordinator.executionInfo().definitionCount).toBe(4);
    logical = await exportMatch(repo, release, manifest.id);
  } finally {
    await coordinator.close();
  }
});

async function restored(repo: Repository) {
  expect(await importMatch(repo, release, logical)).toEqual(pending);
  return Coordinator.open(repo, release, pending.manifest.id);
}
function frame(state: RulesState) {
  const result = state.frames.at(-1);
  if (result?.kind !== "resolving-spell") throw new Error("Expected durable resolving frame");
  return result;
}

for (const move of [false, true])
  test(`ordinary Repulse owner move=${move}: native reopen, logical import and concurrent exact retries execute once`, async () => {
    const file = path();
    const first = await restored(open(file));
    expect(first.current().frames).toEqual(pending.frames);
    expect(first.current().priorityPlayer).toBeNull();
    const context = frame(pending);
    const targetBefore = pending.objects[context.target];
    const sourceController = pending.players.find((seat) => seat.id === context.controller);
    if (!targetBefore || !sourceController) throw new Error("Pending source context incomplete");
    expect(context.source.owner).not.toBe(targetBefore.owner);
    expect(first.view(targetBefore.owner).decision?.kind).toBe("commander-replacement");
    expect(first.view(context.source.controller).decision).toBeNull();
    await first.close();
    const repo = open(file);
    const reopened = await Coordinator.open(repo, release, pending.manifest.id);
    const importedRepo = open();
    const imported = await restored(importedRepo);
    expect(reopened.current()).toEqual(pending);
    expect(imported.executionInfo()).toEqual(reopened.executionInfo());
    const input = replacementCommand(reopened, move);
    expect(await reopened.submit(context.source.controller, input)).toMatchObject({
      status: "rejected",
      code: "ActorMismatch",
    });
    expect(
      await reopened.submit(input.actor, {
        ...input,
        commandId: "replacement-cancel",
        response: { kind: "cancel-cast" },
      }),
    ).toMatchObject({ status: "rejected", code: "IllegalCommand" });
    expect(reopened.current()).toEqual(pending);
    const [left, duplicate, otherDatabase] = await Promise.all([
      reopened.submit(input.actor, input),
      reopened.submit(input.actor, input),
      imported.submit(input.actor, input),
    ]);
    expect(left.status).toBe("accepted");
    expect(duplicate).toEqual(left);
    expect(otherDatabase).toEqual(left);
    const completed = reopened.current();
    expect(imported.current()).toEqual(completed);
    expect(completed.revision).toBe(pending.revision + 1);
    expect(completed.frames).toEqual([]);
    expect(completed.objects[context.target]).toBeUndefined();
    const returned = Object.values(completed.objects).find(
      (object) => object.lineage === targetBefore.lineage,
    );
    expect(returned).toMatchObject({
      owner: targetBefore.owner,
      zone: move ? "command" : "hand",
      generation: targetBefore.generation + 1,
    });
    expect(completed.players.find((seat) => seat.id === context.controller)?.library.length).toBe(
      sourceController.library.length - 1,
    );
    const events = completed.events;
    const returnedEvents = events.filter((event) => event.type === "ReturnInstructionCompleted");
    const draws = events.filter((event) => event.type === "CardDrawn");
    const resolved = events.filter((event) => event.type === "SpellResolved");
    expect(returnedEvents).toHaveLength(1);
    expect(draws).toHaveLength(1);
    expect(resolved).toHaveLength(1);
    expect(returnedEvents[0]?.index).toBeLessThan(draws[0]?.index ?? -1);
    expect(draws[0]?.index).toBeLessThan(resolved[0]?.index ?? -1);
    expect(repo.load(pending.manifest.id)?.records).toHaveLength(pending.revision + 1);
    expect(await replayMatch(repo, release, pending.manifest.id)).toEqual(completed);
    const completedExport = await exportMatch(repo, release, pending.manifest.id);
    await reopened.close();
    const afterReopen = await Coordinator.open(open(file), release, pending.manifest.id);
    expect(await afterReopen.submit(input.actor, input)).toEqual(left);
    expect(
      await afterReopen.submit(input.actor, {
        ...input,
        response: { kind: "commander-replacement", move: !move },
      }),
    ).toMatchObject({ status: "rejected", code: "CommandConflict" });
    expect(afterReopen.current()).toEqual(completed);
    const completedImportRepo = open();
    await importMatch(completedImportRepo, release, completedExport);
    const completedImport = await Coordinator.open(
      completedImportRepo,
      release,
      pending.manifest.id,
    );
    expect(await completedImport.submit(input.actor, input)).toEqual(left);
    expect(completedImport.current()).toEqual(completed);
  }, 20_000);

test("concurrent opposite replacement answers sharing one command identity retain the first committed choice", async () => {
  const repo = open();
  const coordinator = await restored(repo);
  const first = replacementCommand(coordinator, false);
  const second = { ...first, response: { kind: "commander-replacement" as const, move: true } };
  const [accepted, conflict] = await Promise.all([
    coordinator.submit(first.actor, first),
    coordinator.submit(second.actor, second),
  ]);
  expect(accepted.status).toBe("accepted");
  expect(conflict).toMatchObject({ status: "rejected", code: "CommandConflict" });
  expect(coordinator.current().revision).toBe(pending.revision + 1);
  const target = frame(pending).pendingMovement.before;
  expect(
    Object.values(coordinator.current().objects).find((object) => object.lineage === target.lineage)
      ?.zone,
  ).toBe("hand");
  expect(await replayMatch(repo, release, pending.manifest.id)).toEqual(coordinator.current());
});

for (const failure of ["INSERT INTO commander_boundaries", "UPDATE commander_matches", "COMMIT"])
  test(`replacement rollback at ${failure} retains the unmoved commander, source, cursor and retryability`, async () => {
    const db = new Database(path(), { strict: true });
    let armed = false;
    const adapter: SqlDatabase = {
      exec(sql, bindings) {
        if (armed && sql.startsWith(failure)) {
          armed = false;
          throw new Error("Injected replacement persistence failure");
        }
        if (bindings) db.run(sql, bindings);
        else db.exec(sql);
      },
      rows(sql, bindings) {
        return db.query(sql).all(...(bindings ?? [])) as Record<string, unknown>[];
      },
      close: () => db.close(),
    };
    const repo = createRepository(adapter);
    cleanup.push(() => repo.close());
    const coordinator = await restored(repo);
    const input = replacementCommand(coordinator, true);
    armed = true;
    expect(await coordinator.submit(input.actor, input)).toMatchObject({
      status: "fault",
      code: "PersistenceFailed",
    });
    expect(coordinator.current()).toEqual(pending);
    expect(repo.load(pending.manifest.id)?.current).toEqual(pending);
    expect(repo.findRecord(pending.manifest.id, input.commandId)).toBeNull();
    expect(repo.load(pending.manifest.id)?.records).toHaveLength(pending.revision);
    expect(db.query("SELECT count(*) AS count FROM commander_boundaries").get()).toEqual({
      count: pending.revision + 1,
    });
    expect((await coordinator.submit(input.actor, input)).status).toBe("accepted");
    expect(await replayMatch(repo, release, pending.manifest.id)).toEqual(coordinator.current());
  });

test("rehashed logical snapshots cannot change the pending owner, program, target generation or instruction cursor", async () => {
  const mutations: ((state: RulesState) => void)[] = [
    (state) => {
      frame(state).controller = "A";
    },
    (state) => {
      frame(state).program.effects.pop();
    },
    (state) => {
      frame(state).pendingMovement.before.generation++;
    },
    (state) => {
      frame(state).effectIndex = 1;
    },
    (state) => {
      frame(state).pendingMovement.id = "different-event";
    },
  ];
  for (const mutate of mutations) {
    const envelope = JSON.parse(logical);
    mutate(envelope.payload.current);
    expect(canonicalJson(envelope.payload.current)).not.toBe(canonicalJson(pending));
    envelope.payload.currentHash = await semanticHash(envelope.payload.current);
    envelope.checksum = await semanticHash(envelope.payload);
    const repo = open();
    await expect(importMatch(repo, release, JSON.stringify(envelope))).rejects.toThrow();
    expect(repo.list()).toEqual([]);
  }
}, 20_000);

test("native checkpoint tampering fails reopen even with a recomputed state checksum", async () => {
  const file = path();
  const coordinator = await restored(open(file));
  const changed = coordinator.current();
  frame(changed).sourceVersion = "0".repeat(64);
  await coordinator.close();
  const db = new Database(file);
  try {
    db.run("UPDATE commander_matches SET current_json = ?, current_hash = ? WHERE match_id = ?", [
      canonicalJson(changed),
      await semanticHash(changed),
      pending.manifest.id,
    ]);
  } finally {
    db.close();
  }
  await expect(Coordinator.open(open(file), release, pending.manifest.id)).rejects.toThrow();
});
