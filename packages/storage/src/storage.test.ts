import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPreparedMatchArtifact } from "@iwsdk-apps/compiler/prepared";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  emptyMana,
  type GameCommand,
  type MatchManifest,
  type Response,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
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
      /* Already explicitly closed. */
    }
  }
});
function location(): string {
  const directory = mkdtempSync(join(tmpdir(), "commander-storage-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "matches.sqlite");
}
function open(path = location()): Repository {
  const repo = openNativeRepository(path);
  cleanup.push(() => repo.close());
  return repo;
}
async function fixtures(id = "fixture-match", count: 2 | 4 = 2) {
  const base: CardDefinition = {
    id: "fixture-commander",
    oracleId: "fixture-commander",
    sourceVersion: "0".repeat(64),
    name: "Synthetic storage-test commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["G"],
    colorIdentity: ["G"],
    manaCost: { ...emptyMana(), generic: 0 },
    manaValue: 0,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "commander-development-recipes/1",
  };
  const land: CardDefinition = {
    ...base,
    id: "fixture-land",
    oracleId: "fixture-land",
    name: "Synthetic storage-test basic land",
    typeLine: "Basic Land — Forest",
    types: ["Land"],
    subtypes: ["Forest"],
    supertypes: ["Basic"],
    manaCost: null,
    power: null,
    toughness: null,
    manaAbilities: ["G"],
    commanderEligible: false,
    deckLimit: null,
  };
  const payload = {
    schema: "commander-content/1" as const,
    id: "storage-fixtures",
    sourceBundle: "0".repeat(64),
    rulesHash: "0".repeat(64),
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: {
      [base.id]: base,
      [land.id]: land,
      "fixture-unused": {
        ...base,
        id: "fixture-unused",
        oracleId: "fixture-unused",
        name: "Unused synthetic fixture",
      },
    },
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "storage-test/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ContentRelease = { ...payload, hash: await semanticHash(payload) };
  const deckPayload = {
    id: "synthetic-unit-deck",
    commander: base.id,
    entries: [
      { definition: base.id, count: 1 },
      { definition: land.id, count: 99 },
    ],
  };
  const deck: DeckRevision = { ...deckPayload, hash: await semanticHash(deckPayload) };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id,
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 7,
    driverSeed: 11,
    driverVersion: "storage-test/1",
    mode: count === 2 ? "two-seat" : "four-seat",
    seats: ["A", "B", "C", "D"].slice(0, count).map((seat) => ({ id: seat, deck })),
    resolver: "full-scan",
  };
  return { release, manifest };
}
function command(coordinator: Coordinator, response?: Response): GameCommand {
  const state = coordinator.current();
  if (!state.decision) throw new Error("Fixture has no decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `command:${state.revision}`,
    actor: state.decision.actor,
    revision: state.revision,
    decisionId: state.decision.id,
    response:
      response ??
      (state.decision.kind === "starting-player"
        ? { kind: "starting-player", player: state.decision.players[0] ?? state.decision.actor }
        : state.decision.kind === "mulligan"
          ? { kind: "mulligan", keep: true }
          : { kind: "pass" }),
  };
}
async function accepted(coordinator: Coordinator, input = command(coordinator)) {
  const result = await coordinator.submit(input.actor, input);
  expect(result.status).toBe("accepted");
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return result.receipt;
}

describe("SQLite ownership and durable coordinator", () => {
  test("durable exact retry survives close/reopen and a conflicting payload fails", async () => {
    const path = location();
    const repo = open(path);
    const { release, manifest } = await fixtures();
    const coordinator = await Coordinator.create(repo, release, manifest);
    const input = command(coordinator);
    const receipt = await accepted(coordinator, input);
    await coordinator.close();
    const reopenedRepo = open(path);
    const reopened = await Coordinator.open(reopenedRepo, release, manifest.id);
    expect(await reopened.submit(input.actor, input)).toEqual({ status: "accepted", receipt });
    expect(reopened.current().revision).toBe(1);
    const conflict = await reopened.submit(input.actor, {
      ...input,
      response: { kind: "mulligan", keep: false },
    });
    expect(conflict).toMatchObject({ status: "rejected", code: "CommandConflict" });
    expect(reopenedRepo.load(manifest.id)?.records).toHaveLength(1);
    expect(await replayMatch(reopenedRepo, release, manifest.id)).toEqual(reopened.current());
  });

  test("serialized submissions deduplicate concurrent retries and reject stale/foreign actor without RNG advancement", async () => {
    const repo = open();
    const { release, manifest } = await fixtures();
    const coordinator = await Coordinator.create(repo, release, manifest);
    const input = command(coordinator);
    const [left, right] = await Promise.all([
      coordinator.submit(input.actor, input),
      coordinator.submit(input.actor, input),
    ]);
    expect(left).toEqual(right);
    expect(left.status).toBe("accepted");
    expect(coordinator.current().revision).toBe(1);
    const before = coordinator.current();
    expect(await coordinator.submit(input.actor, { ...input, commandId: "stale" })).toMatchObject({
      status: "rejected",
      code: "StaleRevision",
    });
    expect(await coordinator.submit(input.actor === "A" ? "B" : "A", input)).toMatchObject({
      status: "rejected",
      code: "ActorMismatch",
    });
    expect(coordinator.current()).toEqual(before);
    expect(
      coordinator
        .view("A")
        .objects.some(
          (entry) => entry.zone === "library" || (entry.zone === "hand" && entry.owner !== "A"),
        ),
    ).toBe(false);
    before.players[0]?.hand.pop();
    expect(coordinator.current()).not.toEqual(before);
  });

  for (const failure of [
    "INSERT INTO commander_boundaries",
    "UPDATE commander_matches",
    "COMMIT",
  ]) {
    test(`real SQLite rollback at ${failure} preserves state, receipt, events and retryability`, async () => {
      const db = new Database(location(), { strict: true });
      cleanup.push(() => db.close());
      let armed = false;
      const adapter: SqlDatabase = {
        exec(sql, bind) {
          if (armed && sql.startsWith(failure)) {
            armed = false;
            throw new Error("Injected disk failure");
          }
          if (bind) db.run(sql, bind);
          else db.exec(sql);
        },
        rows(sql, bind) {
          return db.query(sql).all(...(bind ?? [])) as Record<string, unknown>[];
        },
        close() {
          db.close();
        },
      };
      const repo = createRepository(adapter);
      const { release, manifest } = await fixtures();
      const coordinator = await Coordinator.create(repo, release, manifest);
      const before = coordinator.current();
      const input = command(coordinator);
      armed = true;
      expect(await coordinator.submit(input.actor, input)).toMatchObject({
        status: "fault",
        code: "PersistenceFailed",
      });
      expect(coordinator.current()).toEqual(before);
      expect(repo.findRecord(manifest.id, input.commandId)).toBeNull();
      expect(repo.load(manifest.id)?.current).toEqual(before);
      expect(db.query("SELECT count(*) AS count FROM commander_boundaries").get()).toEqual({
        count: 1,
      });
      await accepted(coordinator, input);
      expect((await replayMatch(repo, release, manifest.id)).revision).toBe(1);
    });
  }

  test("two native coordinators cannot overwrite a newer committed revision", async () => {
    const path = location();
    const firstRepo = open(path);
    const { release, manifest } = await fixtures();
    const first = await Coordinator.create(firstRepo, release, manifest);
    const second = await Coordinator.open(open(path), release, manifest.id);
    const old = command(second);
    old.commandId = "other-writer";
    await accepted(first);
    expect(await second.submit(old.actor, old)).toMatchObject({
      status: "fault",
      code: "ConcurrentWrite",
    });
    expect(second.current().revision).toBe(0);
    expect(firstRepo.load(manifest.id)?.records).toHaveLength(1);
  });

  test("a pending casting/payment frame resumes and logical import replays before insertion", async () => {
    const path = location();
    const repo = open(path);
    const { release, manifest } = await fixtures();
    const coordinator = await Coordinator.create(repo, release, manifest);
    for (let step = 0; step < 16 && coordinator.current().step !== "main1"; step++)
      await accepted(coordinator);
    const state = coordinator.current();
    expect(state.step).toBe("main1");
    const commander = Object.values(state.objects).find(
      (entry) => entry.commander && entry.owner === state.activePlayer,
    );
    if (!commander) throw new Error("Fixture commander unavailable");
    await accepted(coordinator, command(coordinator, { kind: "cast", card: commander.id }));
    const pending = coordinator.current();
    expect(pending.decision?.kind).toBe("payment");
    expect(pending.frames.at(-1)?.kind).toBe("casting");
    const logical = await exportMatch(repo, release, manifest.id);
    await coordinator.close();
    const reopened = await Coordinator.open(open(path), release, manifest.id);
    expect(reopened.current()).toEqual(pending);
    const importedRepo = open();
    expect(await importMatch(importedRepo, release, logical)).toEqual(pending);
    const imported = await Coordinator.open(importedRepo, release, manifest.id);
    const payment = command(reopened, { kind: "payment", sources: [], spend: emptyMana() });
    const [a, b] = await Promise.all([
      reopened.submit(payment.actor, payment),
      imported.submit(payment.actor, payment),
    ]);
    expect(a).toEqual(b);
    expect(a.status).toBe("accepted");
    expect(reopened.current()).toEqual(imported.current());
    await expect(importMatch(importedRepo, release, logical)).rejects.toThrow("already exists");
  });

  test("recomputed checkpoint checksum cannot hide a non-replayed state modification", async () => {
    const path = location();
    const repo = open(path);
    const { release, manifest } = await fixtures();
    const coordinator = await Coordinator.create(repo, release, manifest);
    await accepted(coordinator);
    const changed = coordinator.current();
    if (!changed.players[0]) throw new Error("Missing fixture seat");
    changed.players[0].life = 999;
    await coordinator.close();
    const db = new Database(path);
    cleanup.push(() => db.close());
    db.run("UPDATE commander_matches SET current_json = ?, current_hash = ? WHERE match_id = ?", [
      JSON.stringify(changed),
      await semanticHash(changed),
      manifest.id,
    ]);
    db.close();
    await expect(Coordinator.open(open(path), release, manifest.id)).rejects.toThrow(
      "not the replayed",
    );
  });

  test("missing event boundary and altered request hash are detected", async () => {
    const path = location();
    const repo = open(path);
    const { release, manifest } = await fixtures();
    const coordinator = await Coordinator.create(repo, release, manifest);
    await accepted(coordinator);
    await coordinator.close();
    const db = new Database(path);
    cleanup.push(() => db.close());
    const row = db.query("SELECT record_json FROM commander_commands").get() as {
      record_json: string;
    };
    const damaged = JSON.parse(row.record_json);
    damaged.requestHash = "0".repeat(64);
    db.run("UPDATE commander_commands SET record_json = ?", [JSON.stringify(damaged)]);
    await expect(Coordinator.open(open(path), release, manifest.id)).rejects.toThrow(
      "request hash mismatch",
    );
    db.exec("DELETE FROM commander_boundaries WHERE revision = 1");
    expect(() => open(path).load(manifest.id)).toThrow("boundary count");
  });

  test("a durable retry refuses a receipt whose boundary was damaged while the coordinator was open", async () => {
    const path = location();
    const repo = open(path);
    const { release, manifest } = await fixtures();
    const coordinator = await Coordinator.create(repo, release, manifest);
    const input = command(coordinator);
    await accepted(coordinator, input);
    const before = coordinator.current();
    const db = new Database(path);
    try {
      db.run("UPDATE commander_boundaries SET state_hash = ? WHERE revision = 1", ["0".repeat(64)]);
      expect(await coordinator.submit(input.actor, input)).toMatchObject({
        status: "fault",
        code: "IntegrityFailure",
      });
      expect(coordinator.current()).toEqual(before);
    } finally {
      db.close();
    }
  });

  test("queued input is captured before the caller can mutate it", async () => {
    const repo = open();
    const { release, manifest } = await fixtures();
    const coordinator = await Coordinator.create(repo, release, manifest);
    const input = command(coordinator);
    const original = structuredClone(input);
    const submitted = coordinator.submit(input.actor, input);
    input.actor = "not-a-seat";
    input.response = { kind: "pass" };
    expect((await submitted).status).toBe("accepted");
    expect(repo.findRecord(manifest.id, original.commandId)?.command).toEqual(original);
  });

  test("bad logical checksum, engine version and content/deck pins fail without importing", async () => {
    const repo = open();
    const target = open();
    const { release, manifest } = await fixtures();
    const coordinator = await Coordinator.create(repo, release, manifest);
    const envelope = JSON.parse(await exportMatch(repo, release, manifest.id));
    envelope.checksum = "0".repeat(64);
    await expect(importMatch(target, release, JSON.stringify(envelope))).rejects.toThrow(
      "checksum",
    );
    envelope.payload.current.manifest.engineVersion = "future-engine/99";
    await expect(importMatch(target, release, JSON.stringify(envelope))).rejects.toThrow();
    await expect(
      Coordinator.create(target, { ...release, hash: "0".repeat(64) }, manifest),
    ).rejects.toThrow("release hash");
    const invalidManifest = structuredClone(manifest);
    const seat = invalidManifest.seats[0];
    if (!seat) throw new Error("Missing fixture seat");
    seat.deck.hash = "0".repeat(64);
    await expect(Coordinator.create(target, release, invalidManifest)).rejects.toThrow(
      "Deck revision hash",
    );
    expect(target.list()).toEqual([]);
    expect(coordinator.current().revision).toBe(0);
  });

  test("unrelated and future-version databases are refused without overwriting contents", () => {
    const path = location();
    const db = new Database(path);
    db.exec("CREATE TABLE unrelated(value INTEGER); INSERT INTO unrelated VALUES (42)");
    db.close();
    expect(() => openNativeRepository(path)).toThrow("unrelated");
    const verify = new Database(path);
    cleanup.push(() => verify.close());
    expect(verify.query("SELECT value FROM unrelated").get()).toEqual({ value: 42 });
    expect(verify.query("PRAGMA user_version").get()).toEqual({ user_version: 0 });
    const ownedPath = location();
    openNativeRepository(ownedPath).close();
    const future = new Database(ownedPath);
    future.exec("PRAGMA user_version = 99");
    future.close();
    expect(() => openNativeRepository(ownedPath)).toThrow("incompatible");
  });
});

describe("persisted prepared execution registries", () => {
  for (const resolver of ["prepared-scan", "prepared-indexed"] as const) {
    test(`${resolver} executes the admitted subset, persists the artifact, and resumes/replays/imports with the exact pin`, async () => {
      const path = location();
      const repo = open(path);
      const { release, manifest } = await fixtures(`prepared-${resolver}`);
      const artifact = await createPreparedMatchArtifact(
        release,
        manifest.seats.map((seat) => seat.deck),
      );
      manifest.resolver = resolver;
      manifest.preparedArtifactHash = artifact.hash;
      const coordinator = await Coordinator.create(repo, release, manifest, artifact);
      expect(coordinator.executionInfo()).toEqual({
        sourceReleaseHash: release.hash,
        preparedArtifactHash: artifact.hash,
        definitionCount: 2,
      });
      expect(Object.keys(release.definitions)).toHaveLength(3);
      // Actual staged commander cast creates a pending payment decision before persistence/reload.
      while (coordinator.current().decision?.kind !== "priority") await accepted(coordinator);
      while (coordinator.current().step !== "main1") await accepted(coordinator);
      const commander = coordinator
        .view(coordinator.pendingActor ?? "")
        .objects.find((entry) => entry.commander && entry.owner === coordinator.pendingActor);
      if (!commander) throw new Error("Missing fixture commander");
      const castInput = command(coordinator, { kind: "cast", card: commander.id });
      const receipt = await accepted(coordinator, castInput);
      const saved = coordinator.current();
      expect(saved.decision?.kind).toBe("payment");
      expect(repo.load(manifest.id)?.preparedArtifact).toEqual(artifact);
      await coordinator.close();
      const reopenedRepo = open(path);
      const reopened = await Coordinator.open(reopenedRepo, release, manifest.id);
      expect(reopened.current()).toEqual(saved);
      expect(reopened.executionInfo().definitionCount).toBe(2);
      expect(await reopened.submit(castInput.actor, castInput)).toEqual({
        status: "accepted",
        receipt,
      });
      expect(await replayMatch(reopenedRepo, release, manifest.id)).toEqual(saved);
      const exported = await exportMatch(reopenedRepo, release, manifest.id);
      const importedRepo = open();
      expect(await importMatch(importedRepo, release, exported)).toEqual(saved);
      const imported = await Coordinator.open(importedRepo, release, manifest.id);
      expect(imported.executionInfo()).toEqual(reopened.executionInfo());
      const payment = command(reopened, { kind: "payment", sources: [], spend: emptyMana() });
      expect(await reopened.submit(payment.actor, payment)).toEqual(
        await imported.submit(payment.actor, payment),
      );
      expect(imported.current()).toEqual(reopened.current());
    });
  }
  test("missing, unexpected, conflicting and damaged artifact pins reject before insertion", async () => {
    const { release, manifest } = await fixtures("artifact-rejections");
    const artifact = await createPreparedMatchArtifact(
      release,
      manifest.seats.map((seat) => seat.deck),
    );
    const repo = open();
    await expect(Coordinator.create(repo, release, manifest, artifact)).rejects.toThrow(
      "Full-scan",
    );
    manifest.resolver = "prepared-indexed";
    await expect(Coordinator.create(repo, release, manifest)).rejects.toThrow(
      "requires its persisted artifact",
    );
    manifest.preparedArtifactHash = "f".repeat(64);
    await expect(Coordinator.create(repo, release, manifest, artifact)).rejects.toThrow(
      "pin differs",
    );
    const forged = structuredClone(artifact);
    forged.retainedDefinitions.pop();
    const { hash: _hash, ...body } = forged;
    forged.hash = await semanticHash(body);
    manifest.preparedArtifactHash = forged.hash;
    await expect(Coordinator.create(repo, release, manifest, forged)).rejects.toThrow(
      "does not match recomputed",
    );
    expect(repo.list()).toEqual([]);
  });
  test("a validly hashed source for another processor ABI is refused before match creation", async () => {
    const { release, manifest } = await fixtures("source-abi");
    const { hash: _oldHash, ...payload } = release;
    payload.processorAbi = "commander-engine/0.4.0";
    const oldSource = { ...payload, hash: await semanticHash(payload) };
    const repo = open();
    await expect(
      Coordinator.create(repo, oldSource, { ...manifest, releaseHash: oldSource.hash }),
    ).rejects.toThrow("processor ABI");
    expect(repo.list()).toEqual([]);
  });
  test("stored artifact tampering fails reopen and logical import even with a recomputed envelope checksum", async () => {
    const path = location();
    const repo = open(path);
    const { release, manifest } = await fixtures("artifact-tamper");
    const artifact = await createPreparedMatchArtifact(
      release,
      manifest.seats.map((seat) => seat.deck),
    );
    manifest.resolver = "prepared-scan";
    manifest.preparedArtifactHash = artifact.hash;
    await Coordinator.create(repo, release, manifest, artifact);
    const text = await exportMatch(repo, release, manifest.id);
    const envelope = JSON.parse(text);
    envelope.payload.preparedArtifact.retainedDefinitions[0].definitionHash = "f".repeat(64);
    envelope.checksum = await semanticHash(envelope.payload);
    const imported = open();
    await expect(importMatch(imported, release, JSON.stringify(envelope))).rejects.toThrow(
      "artifact hash mismatch",
    );
    expect(imported.list()).toEqual([]);
    const db = new Database(path);
    cleanup.push(() => db.close());
    db.query("UPDATE commander_matches SET prepared_artifact_json = ? WHERE match_id = ?").run(
      JSON.stringify(envelope.payload.preparedArtifact),
      manifest.id,
    );
    await expect(Coordinator.open(repo, release, manifest.id)).rejects.toThrow(
      "artifact hash mismatch",
    );
  });
  test("owned schema1 migration adds nullable artifact storage without rewriting checkpoint bytes", async () => {
    const path = location();
    const repo = open(path);
    const { release, manifest } = await fixtures("migration-current-fixture");
    const coordinator = await Coordinator.create(repo, release, manifest);
    await accepted(coordinator);
    await coordinator.close();
    const db = new Database(path);
    const before = db.query("SELECT initial_json, current_json FROM commander_matches").get();
    // Recreate the prior storage layout with current-engine fixture bytes, independently of old engine save compatibility.
    db.exec("ALTER TABLE commander_matches DROP COLUMN prepared_artifact_json");
    db.exec("ALTER TABLE commander_matches DROP COLUMN prepared_artifact_hash");
    db.exec("PRAGMA user_version = 1");
    db.close();
    const migrated = open(path);
    const verify = new Database(path);
    cleanup.push(() => verify.close());
    expect(verify.query("PRAGMA user_version").get()).toEqual({ user_version: 2 });
    expect(verify.query("SELECT initial_json, current_json FROM commander_matches").get()).toEqual(
      before,
    );
    expect(migrated.load(manifest.id)?.preparedArtifact).toBeNull();
    expect((await Coordinator.open(migrated, release, manifest.id)).current().revision).toBe(1);
  });
});

describe("durable chooser-owned pre-deal setup", () => {
  for (const count of [2, 4] as const) {
    for (const resolver of ["full-scan", "prepared-indexed"] as const) {
      test(`${count} seats ${resolver}: initial choice survives reopen/import and selecting another seat deals only once`, async () => {
        const path = location();
        const repo = open(path);
        const { release, manifest } = await fixtures(`starting-${count}-${resolver}`, count);
        const artifact =
          resolver === "full-scan"
            ? undefined
            : await createPreparedMatchArtifact(
                release,
                manifest.seats.map((seat) => seat.deck),
              );
        manifest.resolver = resolver;
        if (artifact) manifest.preparedArtifactHash = artifact.hash;
        const initial = await Coordinator.create(repo, release, manifest, artifact);
        const undealt = initial.current();
        const chooser = undealt.startingPlayerChooser;
        const selected = undealt.players.find((seat) => seat.id !== chooser)?.id;
        if (!selected) throw new Error("Missing alternative starting player");
        expect(undealt).toMatchObject({
          revision: 0,
          startingPlayer: null,
          activePlayer: null,
          priorityPlayer: null,
          objects: {},
        });
        for (const seat of undealt.players) {
          expect([seat.hand.length, seat.library.length, seat.graveyard.length]).toEqual([0, 0, 0]);
          const view = initial.view(seat.id);
          expect(view.objects).toEqual([]);
          expect(view.startingPlayerChooser).toBe(chooser);
          expect(view.startingPlayer).toBeNull();
          if (seat.id === chooser)
            expect(view.decision).toMatchObject({
              kind: "starting-player",
              actor: chooser,
              players: undealt.players.map((entry) => entry.id),
            });
          else expect(view.decision).toBeNull();
        }
        const choose = command(initial, { kind: "starting-player", player: selected });
        expect(await initial.submit(selected, { ...choose, actor: selected })).toMatchObject({
          status: "rejected",
          code: "WrongDecisionOwner",
        });
        expect(await initial.submit(chooser, { ...choose, revision: 1 })).toMatchObject({
          status: "rejected",
          code: "StaleRevision",
        });
        expect(
          await initial.submit(chooser, {
            ...choose,
            response: { kind: "starting-player", player: "unknown" },
          }),
        ).toMatchObject({ status: "rejected" });
        expect(initial.current()).toEqual(undealt);
        const saved = await exportMatch(repo, release, manifest.id);
        await initial.close();
        const reopenedRepo = open(path);
        const restored = await Coordinator.open(reopenedRepo, release, manifest.id);
        expect(restored.current()).toEqual(undealt);
        const importedRepo = open();
        expect(await importMatch(importedRepo, release, saved)).toEqual(undealt);
        const imported = await Coordinator.open(importedRepo, release, manifest.id);
        const receipt = await accepted(restored, choose);
        expect(await imported.submit(chooser, choose)).toEqual({ status: "accepted", receipt });
        const dealt = restored.current();
        expect(dealt).toMatchObject({
          revision: 1,
          startingPlayer: selected,
          activePlayer: selected,
          priorityPlayer: null,
        });
        expect(dealt.decision).toMatchObject({ kind: "mulligan", actor: selected });
        expect(Object.keys(dealt.objects)).toHaveLength(count * 100);
        for (const seat of dealt.players)
          expect([seat.hand.length, seat.library.length]).toEqual([7, 92]);
        expect(dealt.events.filter((event) => event.type === "StartingPlayerChosen")).toHaveLength(
          1,
        );
        const chanceAfterDeal = dealt.chanceState;
        await restored.close();
        const secondRepo = open(path);
        const second = await Coordinator.open(secondRepo, release, manifest.id);
        expect(await second.submit(chooser, choose)).toEqual({ status: "accepted", receipt });
        expect(second.current().chanceState).toBe(chanceAfterDeal);
        expect(second.current()).toEqual(dealt);
        while (second.current().decision?.kind === "mulligan") {
          const input = command(second);
          expect(await second.submit(input.actor, input)).toEqual(
            await imported.submit(input.actor, input),
          );
        }
        expect(second.current().decision).toMatchObject({ kind: "priority", actor: selected });
        expect(second.current()).toEqual(imported.current());
        expect(await replayMatch(secondRepo, release, manifest.id)).toEqual(second.current());
      });
    }
  }
});
