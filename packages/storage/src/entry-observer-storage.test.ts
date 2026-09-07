import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ContentRelease,
  canonicalJson,
  EntryObserverAbility,
  type GameCommand,
  type MatchManifest,
  type Response,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  OBSERVER_STORAGE_DRIVER,
  OBSERVER_STORAGE_SEED,
  observerStorageCard,
  observerStorageCommand,
  reachObserverLand,
  storageObserverFixture,
  submitObserverResponse,
} from "../test-fixtures/entry-observer-source";
import {
  type CommandRecord,
  Coordinator,
  createRepository,
  exportMatch,
  importMatch,
  type Repository,
  replayMatch,
  type SqlDatabase,
} from "./index";
import { openNativeRepository } from "./native";

const modes = ["full-scan", "prepared-scan", "prepared-indexed"] as const;
type Stage = "preEntry" | "capturedOrder" | "onStack" | "afterFirst" | "resolved";
type Boundary = { state: RulesState; logical: string; last: CommandRecord };
type Step = { before: Stage; after: Stage; inputs: GameCommand[] };
type Fixture = {
  release: ContentRelease;
  file: string;
  boundaries: Record<Stage, Boundary>;
  steps: Step[];
  execution: ReturnType<Coordinator["executionInfo"]>;
};
const fixtures = new Map<MatchManifest["resolver"], Fixture>();
const cleanup: (() => void)[] = [];
const directory = mkdtempSync(join(tmpdir(), "commander-observer-fixtures-"));
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) {
    try {
      close();
    } catch {
      /* Explicitly closed coordinator owns its database. */
    }
  }
});
function path() {
  const dir = mkdtempSync(join(tmpdir(), "commander-observer-storage-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "matches.sqlite");
}
function open(file = path()) {
  const repo = openNativeRepository(file);
  cleanup.push(() => repo.close());
  return repo;
}
function fixture(mode: MatchManifest["resolver"] = "prepared-indexed") {
  const value = fixtures.get(mode);
  if (!value) throw new Error(`Missing ${mode} observer fixture`);
  return value;
}
function abilities(state: RulesState) {
  return Object.values(state.abilities).map((row) => EntryObserverAbility.parse(row));
}
function actor(state: RulesState) {
  const value = state.players.find((row) => row.id === "A");
  if (!value) throw new Error("Missing A");
  return value;
}
function assertInventory(state: RulesState) {
  expect(state.players.every((player) => !player.lost)).toBe(true);
  for (const player of state.players)
    expect(Object.values(state.objects).filter((row) => row.owner === player.id)).toHaveLength(100);
}
function assertCaptured(state: RulesState, count: number) {
  const captured = abilities(state);
  expect(captured).toHaveLength(count);
  for (const ability of captured) {
    const source = Object.values(state.objects).find((row) => row.id === ability.source.id);
    if (!source) throw new Error("Captured physical source is absent at this checkpoint");
    expect(ability.source).toEqual(source);
    expect(ability.source).toMatchObject({ owner: "A", controller: "A", zone: "battlefield" });
    expect(ability.controller).toBe("A");
    const card = observerStorageCard(
      ability.source.definition === observerStorageCard("Tatyova, Benthic Druid").id
        ? "Tatyova, Benthic Druid"
        : "Jaddi Offshoot",
    );
    expect(ability.sourceVersion).toBe(card.sourceVersion);
    const program = card.triggerPrograms?.[0];
    if (program?.schema !== "commander-entry-observer/1")
      throw new Error("Missing pinned observer program");
    expect(ability.program).toEqual(program);
    const subject = state.objects[ability.entry.subject.id];
    if (!subject) throw new Error("Entered land is absent at this checkpoint");
    expect(ability.entry.subject).toEqual(subject);
    expect(subject).toMatchObject({
      owner: "A",
      controller: "A",
      zone: "battlefield",
      generation: 2,
    });
    expect(ability.entry.subject.id).not.toBe(ability.source.id);
    expect(ability.entry.facts.types).toEqual(["Land"]);
    const land = ["Forest", "Island"]
      .map(observerStorageCard)
      .find((row) => row.id === subject?.definition);
    if (!land) throw new Error("Entered subject does not match either authenticated basic land");
    expect(ability.entry.subjectVersion).toBe(land.sourceVersion);
    expect(ability.entry.facts.subtypes).toEqual(land.subtypes);
    expect(ability.entry.batchId).toBe(`entry:${ability.eventIndex}`);
    expect(ability.entry.programIndex).toBe(0);
    expect(ability.occurrenceOrdinal).toBe(0);
  }
  if (count === 2) {
    expect(new Set(captured.map((row) => row.id)).size).toBe(2);
    expect(new Set(captured.map((row) => row.source.id)).size).toBe(2);
    expect(new Set(captured.map((row) => row.entry.subject.id)).size).toBe(1);
    expect(new Set(captured.map((row) => row.eventIndex)).size).toBe(1);
  }
  assertInventory(state);
}
function assertPrivateView(coordinator: Coordinator) {
  for (const viewer of ["A", "B"]) {
    const view = coordinator.view(viewer);
    expect(
      view.objects
        .filter((row) => row.zone === "hand" && row.owner !== viewer)
        .every((row) => row.card === null),
    ).toBe(true);
    expect(view.abilities.map((row) => row.id).sort()).toEqual(
      Object.keys(coordinator.current().abilities).sort(),
    );
    for (const ability of view.abilities)
      expect(ability.sourceCard.id).toBe(ability.source.definition);
  }
  if (coordinator.current().decision?.kind === "trigger-order") {
    expect(coordinator.view("A").decision?.kind).toBe("trigger-order");
    expect(coordinator.view("B").decision).toBeNull();
  }
}
async function snapshot(
  repo: Repository,
  coordinator: Coordinator,
  release: ContentRelease,
): Promise<Boundary> {
  const state = coordinator.current(),
    last = repo.load(state.manifest.id)?.records.at(-1);
  if (!last) throw new Error("Ordinary checkpoint lacks accepted history");
  return { state, logical: await exportMatch(repo, release, state.manifest.id), last };
}
async function restored(repo: Repository, boundary: Boundary, release: ContentRelease) {
  expect(await importMatch(repo, release, boundary.logical)).toEqual(boundary.state);
  return Coordinator.open(repo, release, boundary.state.manifest.id);
}
function order(state: RulesState, tatyovaFirst = true): Response {
  const entries = abilities(state);
  const tatyova = entries.find(
      (row) => row.source.definition === observerStorageCard("Tatyova, Benthic Druid").id,
    ),
    jaddi = entries.find(
      (row) => row.source.definition === observerStorageCard("Jaddi Offshoot").id,
    );
  if (!tatyova || !jaddi) throw new Error("Both actual observer occurrences are required");
  return {
    kind: "trigger-order",
    triggers: tatyovaFirst ? [jaddi.id, tatyova.id] : [tatyova.id, jaddi.id],
  };
}
beforeAll(async () => {
  for (const mode of modes) {
    const source = await storageObserverFixture(`ordinary-entry-observer-durability:${mode}`, mode);
    const file = join(directory, `${mode}.sqlite`),
      repo = openNativeRepository(file);
    const coordinator = await Coordinator.create(
      repo,
      source.release,
      source.manifest,
      source.artifact,
    );
    try {
      const land = await reachObserverLand(coordinator);
      const preEntry = await snapshot(repo, coordinator, source.release);
      const entry = await submitObserverResponse(coordinator, land);
      const capturedOrder = await snapshot(repo, coordinator, source.release);
      expect(capturedOrder.state.decision).toMatchObject({
        kind: "trigger-order",
        actor: "A",
        count: 2,
      });
      // priorityPlayer retains the future recipient; only the owned ordering decision is actionable.
      const illegalPass = observerStorageCommand(capturedOrder.state, { kind: "pass" });
      expect(await coordinator.submit(illegalPass.actor, illegalPass)).toMatchObject({
        status: "rejected",
        code: "IllegalCommand",
      });
      expect(coordinator.current()).toEqual(capturedOrder.state);
      expect(capturedOrder.state.stack).toEqual([]);
      assertCaptured(capturedOrder.state, 2);
      expect(actor(capturedOrder.state).life).toBe(actor(preEntry.state).life);
      const ordered = await submitObserverResponse(coordinator, order(coordinator.current()));
      const onStack = await snapshot(repo, coordinator, source.release);
      const firstInputs = [
        (await submitObserverResponse(coordinator, { kind: "pass" })).input,
        (await submitObserverResponse(coordinator, { kind: "pass" })).input,
      ];
      const afterFirst = await snapshot(repo, coordinator, source.release);
      const lastInputs = [
        (await submitObserverResponse(coordinator, { kind: "pass" })).input,
        (await submitObserverResponse(coordinator, { kind: "pass" })).input,
      ];
      const resolved = await snapshot(repo, coordinator, source.release);
      fixtures.set(mode, {
        release: source.release,
        file,
        boundaries: { preEntry, capturedOrder, onStack, afterFirst, resolved },
        execution: coordinator.executionInfo(),
        steps: [
          { before: "preEntry", after: "capturedOrder", inputs: [entry.input] },
          { before: "capturedOrder", after: "onStack", inputs: [ordered.input] },
          { before: "onStack", after: "afterFirst", inputs: firstInputs },
          { before: "afterFirst", after: "resolved", inputs: lastInputs },
        ],
      });
    } finally {
      await coordinator.close();
    }
  }
}, 30_000);
afterAll(async () => {
  try {
    const destination = process.env.OBSERVER_STORAGE_EVIDENCE_DIR;
    if (!destination) return;
    mkdirSync(destination, { recursive: true });
    const histories = [];
    for (const [mode, value] of fixtures) {
      copyFileSync(value.file, join(destination, `${mode}.sqlite`));
      const boundaries = [];
      for (const [stage, boundary] of Object.entries(value.boundaries)) {
        const file = `${mode}-${stage}.json`;
        await Bun.write(join(destination, file), boundary.logical);
        boundaries.push({
          stage,
          file,
          revision: boundary.state.revision,
          stateHash: await semanticHash(boundary.state),
          decision: boundary.state.decision,
          abilities: abilities(boundary.state),
          stack: boundary.state.stack,
          life: actor(boundary.state).life,
          libraryCount: actor(boundary.state).library.length,
          lastReceipt: boundary.last.receipt,
        });
      }
      histories.push({
        mode,
        execution: value.execution,
        manifest: value.boundaries.preEntry.state.manifest,
        boundaries,
      });
    }
    await Bun.write(
      join(destination, "report.json"),
      `${JSON.stringify({ schema: "native-entry-observer-durability/1", scope: "Ordinary legal two-seat commands stopped after two land-entry observers resolve; no constructed game state, completed game, browser or OPFS claim.", driver: OBSERVER_STORAGE_DRIVER, seed: OBSERVER_STORAGE_SEED, sourceReleaseHash: "19b625376b02555521b2f0cea2a33097299bac813e65b682725982e61bfd948d", histories }, null, 2)}\n`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const mode of modes) {
  test(`${mode}: ordinary land entry retains distinct source/subject occurrences and ordered gain then draw`, () => {
    const { boundaries: b } = fixture(mode);
    assertCaptured(b.capturedOrder.state, 2);
    assertCaptured(b.onStack.state, 2);
    assertCaptured(b.afterFirst.state, 1);
    expect(
      b.capturedOrder.state.events.filter((row) => row.type === "BattlefieldEntryBatch"),
    ).toHaveLength(1);
    expect(
      b.capturedOrder.state.events.filter((row) => row.type === "TriggerCaptured"),
    ).toHaveLength(2);
    expect(
      b.capturedOrder.state.events.some(
        (row) => row.type === "CardDrawn" || row.type === "LifeGained",
      ),
    ).toBe(false);
    expect(b.onStack.state.stack).toHaveLength(2);
    expect(b.onStack.state.triggerPlacement).toBeNull();
    expect(b.onStack.state.priorityPlayer).toBe("A");
    expect(
      b.afterFirst.state.events
        .filter((row) => ["LifeGained", "CardDrawn", "TriggeredAbilityResolved"].includes(row.type))
        .map((row) => row.type),
    ).toEqual(["LifeGained", "CardDrawn", "TriggeredAbilityResolved"]);
    expect(actor(b.afterFirst.state).life).toBe(actor(b.preEntry.state).life + 1);
    expect(actor(b.afterFirst.state).library.length).toBe(
      actor(b.preEntry.state).library.length - 1,
    );
    expect(b.resolved.state.abilities).toEqual({});
    expect(b.resolved.state.stack).toEqual([]);
    expect(actor(b.resolved.state).life).toBe(actor(b.preEntry.state).life + 2);
    expect(actor(b.resolved.state).library.length).toBe(actor(b.preEntry.state).library.length - 1);
    expect(
      b.resolved.state.events
        .filter((row) => ["LifeGained", "CardDrawn", "TriggeredAbilityResolved"].includes(row.type))
        .map((row) => row.type),
    ).toEqual(["LifeGained", "TriggeredAbilityResolved"]);
    assertInventory(b.resolved.state);
  });
  test(`${mode}: all five checksummed checkpoints reopen, import and replay with exact old-envelope receipts`, async () => {
    const { release, boundaries } = fixture(mode);
    for (const boundary of Object.values(boundaries)) {
      const file = path(),
        initial = await restored(open(file), boundary, release);
      const views = [initial.view("A"), initial.view("B")];
      await initial.close();
      const repo = open(file),
        reopened = await Coordinator.open(repo, release, boundary.state.manifest.id);
      const importedRepo = open(),
        imported = await restored(importedRepo, boundary, release);
      for (const coordinator of [reopened, imported]) {
        expect(coordinator.current()).toEqual(boundary.state);
        expect([coordinator.view("A"), coordinator.view("B")]).toEqual(views);
        expect(
          await coordinator.submit(boundary.last.command.actor, boundary.last.command),
        ).toEqual({ status: "accepted", receipt: boundary.last.receipt });
        expect(coordinator.current()).toEqual(boundary.state);
        assertPrivateView(coordinator);
        expect(
          await coordinator.submit(boundary.last.command.actor, {
            ...boundary.last.command,
            response: { kind: "cancel-cast" },
          }),
        ).toMatchObject({ status: "rejected", code: "CommandConflict" });
        expect(
          await coordinator.submit(boundary.last.command.actor, {
            ...boundary.last.command,
            commandId: `${boundary.last.command.commandId}:stale`,
          }),
        ).toMatchObject({ status: "rejected", code: "StaleRevision" });
        expect(coordinator.current()).toEqual(boundary.state);
      }
      expect(await replayMatch(repo, release, boundary.state.manifest.id)).toEqual(boundary.state);
      expect(await replayMatch(importedRepo, release, boundary.state.manifest.id)).toEqual(
        boundary.state,
      );
    }
  }, 60_000);
  test(`${mode}: imported and reopened continuations publish each capture/order/resolution once`, async () => {
    const { release, boundaries, steps } = fixture(mode);
    for (const step of steps) {
      const before = boundaries[step.before],
        after = boundaries[step.after],
        file = path();
      const initial = await restored(open(file), before, release);
      await initial.close();
      const repo = open(file),
        reopened = await Coordinator.open(repo, release, before.state.manifest.id);
      const imported = await restored(open(), before, release);
      for (const input of step.inputs) {
        const [accepted, duplicate, sameImport] = await Promise.all([
          reopened.submit(input.actor, input),
          reopened.submit(input.actor, input),
          imported.submit(input.actor, input),
        ]);
        expect(accepted.status).toBe("accepted");
        expect(duplicate).toEqual(accepted);
        expect(sameImport).toEqual(accepted);
      }
      expect(reopened.current()).toEqual(after.state);
      expect(imported.current()).toEqual(after.state);
      expect(repo.load(before.state.manifest.id)?.records).toHaveLength(after.state.revision);
      expect(await replayMatch(repo, release, before.state.manifest.id)).toEqual(after.state);
    }
  }, 30_000);
  test(`${mode}: the actual ordering owner may choose Jaddi first and persist that different resolution order`, async () => {
    const { release, boundaries } = fixture(mode),
      repo = open(),
      coordinator = await restored(repo, boundaries.capturedOrder, release);
    const input = observerStorageCommand(
      coordinator.current(),
      order(coordinator.current(), false),
    );
    expect(await coordinator.submit("B", input)).toMatchObject({
      status: "rejected",
      code: "ActorMismatch",
    });
    expect(coordinator.current()).toEqual(boundaries.capturedOrder.state);
    expect((await coordinator.submit(input.actor, input)).status).toBe("accepted");
    await submitObserverResponse(coordinator, { kind: "pass" });
    await submitObserverResponse(coordinator, { kind: "pass" });
    expect(actor(coordinator.current()).life).toBe(actor(boundaries.preEntry.state).life + 1);
    expect(actor(coordinator.current()).library.length).toBe(
      actor(boundaries.preEntry.state).library.length,
    );
    expect(coordinator.current().events.some((event) => event.type === "CardDrawn")).toBe(false);
    const halfway = await snapshot(repo, coordinator, release),
      imported = await restored(open(), halfway, release);
    for (const current of [coordinator, imported]) {
      await submitObserverResponse(current, { kind: "pass" });
      await submitObserverResponse(current, { kind: "pass" });
    }
    expect(imported.current()).toEqual(coordinator.current());
    expect(actor(coordinator.current()).life).toBe(actor(boundaries.preEntry.state).life + 2);
    expect(actor(coordinator.current()).library.length).toBe(
      actor(boundaries.preEntry.state).library.length - 1,
    );
    expect(await replayMatch(repo, release, coordinator.current().manifest.id)).toEqual(
      coordinator.current(),
    );
  }, 20_000);
}

for (const stage of ["preEntry", "capturedOrder", "onStack"] as const)
  for (const failure of ["INSERT INTO commander_boundaries", "UPDATE commander_matches", "COMMIT"])
    test(`${stage}: ${failure} failure rolls back observer state and retries exactly once`, async () => {
      const value = fixture(),
        boundary = value.boundaries[stage],
        db = new Database(path(), { strict: true });
      let armed = false;
      const adapter: SqlDatabase = {
        exec(sql, bindings) {
          if (armed && sql.startsWith(failure)) {
            armed = false;
            throw new Error("Injected observer persistence failure");
          }
          if (bindings) db.run(sql, bindings);
          else db.exec(sql);
        },
        rows: (sql, bindings) =>
          db.query(sql).all(...(bindings ?? [])) as Record<string, unknown>[],
        close: () => db.close(),
      };
      const repo = createRepository(adapter);
      cleanup.push(() => repo.close());
      const coordinator = await restored(repo, boundary, value.release);
      if (stage === "onStack") await submitObserverResponse(coordinator, { kind: "pass" });
      const before = coordinator.current(),
        view = coordinator.view("A");
      const step = value.steps.find((row) => row.before === stage),
        input =
          stage === "onStack" ? observerStorageCommand(before, { kind: "pass" }) : step?.inputs[0];
      if (!step || !input) throw new Error("Missing ordinary checkpoint input");
      armed = true;
      expect(await coordinator.submit(input.actor, input)).toMatchObject({
        status: "fault",
        code: "PersistenceFailed",
      });
      expect(coordinator.current()).toEqual(before);
      expect(coordinator.view("A")).toEqual(view);
      expect(repo.load(before.manifest.id)?.current).toEqual(before);
      expect(repo.findRecord(before.manifest.id, input.commandId)).toBeNull();
      expect(db.query("SELECT count(*) AS count FROM commander_boundaries").get()).toEqual({
        count: before.revision + 1,
      });
      const accepted = await coordinator.submit(input.actor, input);
      expect(accepted.status).toBe("accepted");
      expect(await coordinator.submit(input.actor, input)).toEqual(accepted);
      expect(coordinator.current()).toEqual(value.boundaries[step.after].state);
      expect(await replayMatch(repo, value.release, before.manifest.id)).toEqual(
        coordinator.current(),
      );
    }, 20_000);

test("checksummed imports cannot forge captured source, subject, selector facts or ordering context", async () => {
  const value = fixture();
  const mutations: ((ability: EntryObserverAbility, state: RulesState) => void)[] = [
    (ability) => {
      ability.controller = "B";
    },
    (ability) => {
      ability.source.controller = "B";
    },
    (ability) => {
      ability.source.generation++;
    },
    (ability) => {
      ability.sourceVersion = "0".repeat(64);
    },
    (ability) => {
      ability.entry.subject.controller = "B";
    },
    (ability) => {
      ability.entry.subject.owner = "B";
    },
    (ability) => {
      ability.entry.subject.generation++;
    },
    (ability) => {
      ability.entry.subjectVersion = "0".repeat(64);
    },
    (ability) => {
      ability.entry.facts.types = ["Creature"];
    },
    (ability) => {
      ability.entry.batchId = "entry:0";
    },
    (ability) => {
      ability.occurrenceOrdinal++;
    },
    (ability) => {
      ability.program.effects = [{ kind: "draw", recipient: "trigger-controller", amount: 1 }];
    },
    (_ability, state) => {
      if (state.triggerPlacement) state.triggerPlacement.remainingPlayers.reverse();
    },
  ];
  for (const mutate of mutations) {
    const envelope = JSON.parse(value.boundaries.capturedOrder.logical),
      state = envelope.payload.current as RulesState;
    const first = Object.values(state.abilities)[0];
    if (!first || !("entry" in first)) throw new Error("Missing captured observer");
    mutate(first, state);
    envelope.payload.currentHash = await semanticHash(state);
    envelope.checksum = await semanticHash(envelope.payload);
    const repo = open();
    await expect(importMatch(repo, value.release, JSON.stringify(envelope))).rejects.toThrow();
    expect(repo.list()).toEqual([]);
  }
  const broken = JSON.parse(value.boundaries.capturedOrder.logical);
  broken.checksum = "0".repeat(64);
  await expect(importMatch(open(), value.release, JSON.stringify(broken))).rejects.toThrow();
}, 30_000);

test("a rehashed native checkpoint cannot alter entry subject context after its capture events leave the current event window", async () => {
  const value = fixture(),
    file = path(),
    coordinator = await restored(open(file), value.boundaries.onStack, value.release);
  const state = coordinator.current(),
    first = Object.values(state.abilities)[0];
  if (!first || !("entry" in first)) throw new Error("Missing observer");
  expect(state.events.some((event) => event.type === "TriggerCaptured")).toBe(false);
  first.entry.subject.tapped = !first.entry.subject.tapped;
  await coordinator.close();
  const db = new Database(file);
  try {
    db.run("UPDATE commander_matches SET current_json = ?, current_hash = ? WHERE match_id = ?", [
      canonicalJson(state),
      await semanticHash(state),
      state.manifest.id,
    ]);
  } finally {
    db.close();
  }
  const repo = open(file);
  await expect(Coordinator.open(repo, value.release, state.manifest.id)).rejects.toThrow();
  expect(repo.load(state.manifest.id)?.current).toEqual(state);
});
