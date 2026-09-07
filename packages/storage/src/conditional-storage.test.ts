import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConditionalSelfEntryAbility,
  type ContentRelease,
  canonicalJson,
  type GameCommand,
  type MatchManifest,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  CONDITIONAL_STORAGE_DRIVER,
  CONDITIONAL_STORAGE_SEED,
  conditionalStorageCard,
  conditionalStorageResponse,
  reachConditionalCapture,
  storageConditionalFixture,
  submitConditionalResponse,
} from "../test-fixtures/conditional-source";
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
type Stage = "preCapture" | "captured" | "afterWitnessLeft" | "afterRemoved";
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
const directory = mkdtempSync(join(tmpdir(), "commander-conditional-fixtures-"));
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
  const dir = mkdtempSync(join(tmpdir(), "commander-conditional-storage-"));
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
  if (!value) throw new Error(`Missing ${mode} conditional fixture`);
  return value;
}
function player(state: RulesState, id: string) {
  const value = state.players.find((row) => row.id === id);
  if (!value) throw new Error(`Missing ${id}`);
  return value;
}
function memnite(state: RulesState) {
  const object = Object.values(state.objects).find(
    (row) => row.owner === "A" && row.definition === conditionalStorageCard("Memnite").id,
  );
  if (!object) throw new Error("Missing actual Memnite");
  return object;
}
function ability(state: RulesState) {
  const all = Object.values(state.abilities);
  expect(all).toHaveLength(1);
  return ConditionalSelfEntryAbility.parse(all[0]);
}
function assertInventory(state: RulesState) {
  expect(state.players.every((row) => !row.lost)).toBe(true);
  for (const seat of state.players)
    expect(
      Object.values(state.objects).filter((row) => row.owner === seat.id && !row.token),
    ).toHaveLength(100);
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
    for (const captured of view.abilities)
      expect(captured.sourceCard.id).toBe(captured.source.definition);
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
async function returnWitness(coordinator: Coordinator): Promise<GameCommand[]> {
  const inputs: GameCommand[] = [];
  for (let step = 0; step < 20; step++) {
    const state = coordinator.current();
    if (memnite(state).zone === "hand") return inputs;
    const actor = coordinator.pendingActor;
    if (!actor) throw new Error("No priority before actual witness departure");
    const response = await conditionalStorageResponse(coordinator.view(actor));
    inputs.push((await submitConditionalResponse(coordinator, response)).input);
  }
  throw new Error("Repulse did not return the controlled artifact within ordinary decisions");
}
beforeAll(async () => {
  for (const mode of modes) {
    const source = await storageConditionalFixture(`ordinary-conditional-durability:${mode}`, mode);
    const file = join(directory, `${mode}.sqlite`),
      repo = openNativeRepository(file);
    const coordinator = await Coordinator.create(
      repo,
      source.release,
      source.manifest,
      source.artifact,
    );
    try {
      await reachConditionalCapture(coordinator);
      const preCapture = await snapshot(repo, coordinator, source.release);
      const entry = await submitConditionalResponse(coordinator, { kind: "pass" });
      const captured = await snapshot(repo, coordinator, source.release);
      const capturedAbility = ability(captured.state);
      expect(captured.state.stack).toEqual([
        { kind: "triggered-ability", triggerId: capturedAbility.id },
      ]);
      expect(memnite(captured.state).zone).toBe("battlefield");
      const returnInputs = await returnWitness(coordinator);
      const afterWitnessLeft = await snapshot(repo, coordinator, source.release);
      expect(ability(afterWitnessLeft.state)).toEqual(capturedAbility);
      expect(afterWitnessLeft.state.stack).toEqual(captured.state.stack);
      const removalInputs = [
        (await submitConditionalResponse(coordinator, { kind: "pass" })).input,
        (await submitConditionalResponse(coordinator, { kind: "pass" })).input,
      ];
      const afterRemoved = await snapshot(repo, coordinator, source.release);
      expect(afterRemoved.state.stack).toEqual([]);
      expect(afterRemoved.state.abilities).toEqual({});
      fixtures.set(mode, {
        release: source.release,
        file,
        boundaries: { preCapture, captured, afterWitnessLeft, afterRemoved },
        execution: coordinator.executionInfo(),
        steps: [
          { before: "preCapture", after: "captured", inputs: [entry.input] },
          { before: "captured", after: "afterWitnessLeft", inputs: returnInputs },
          { before: "afterWitnessLeft", after: "afterRemoved", inputs: removalInputs },
        ],
      });
    } finally {
      await coordinator.close();
    }
  }
}, 30_000);
afterAll(async () => {
  try {
    const destination = process.env.CONDITIONAL_STORAGE_EVIDENCE_DIR;
    if (!destination) return;
    mkdirSync(destination, { recursive: true });
    const histories = [];
    for (const [mode, value] of fixtures) {
      copyFileSync(value.file, join(destination, `${mode}.sqlite`));
      await Bun.write(
        join(destination, "source-release.json"),
        `${JSON.stringify(value.release, null, 2)}\n`,
      );
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
          abilities: boundary.state.abilities,
          stack: boundary.state.stack,
          memnite: memnite(boundary.state),
          players: boundary.state.players.map((row) => ({
            id: row.id,
            life: row.life,
            handCount: row.hand.length,
            libraryCount: row.library.length,
          })),
          lastCommand: boundary.last.command,
          lastReceipt: boundary.last.receipt,
        });
      }
      histories.push({
        mode,
        execution: value.execution,
        manifest: value.boundaries.preCapture.state.manifest,
        finalSave: `${mode}-afterRemoved.json`,
        boundaries,
        steps: value.steps,
      });
    }
    await Bun.write(
      join(destination, "report.json"),
      `${JSON.stringify({ schema: "native-conditional-durability/1", scope: "Ordinary legal two-seat commands stopped after Memnite/Scholar true capture, opponent Repulse returning the artifact and drawing, then false conditional ability removal without A drawing. No constructed game state, completed game, browser or OPFS claim.", driver: CONDITIONAL_STORAGE_DRIVER, seed: CONDITIONAL_STORAGE_SEED, driverSeed: 1, originReleaseHash: "ee7d9fe069b1c829325ac3a87d8622fab2893c2dc85e7e065537fb2cfb9782a0", sourceReleaseFile: "source-release.json", histories }, null, 2)}\n`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const mode of modes) {
  test(`${mode}: ordinary IF03 capture is true, Repulse draws for B, and current false condition removes A's ability without draw`, () => {
    const { boundaries: b } = fixture(mode),
      captured = ability(b.captured.state);
    expect(captured.controller).toBe("A");
    expect(captured.source.owner).toBe("A");
    expect(captured.source.controller).toBe("A");
    expect(captured.source.zone).toBe("battlefield");
    expect(captured.source.definition).toBe(conditionalStorageCard("Scholar of Stars").id);
    expect(captured.sourceVersion).toBe(conditionalStorageCard("Scholar of Stars").sourceVersion);
    expect(canonicalJson(captured.program)).toBe(
      canonicalJson(conditionalStorageCard("Scholar of Stars").triggerPrograms?.[0]),
    );
    expect(captured.program.interveningIf).toEqual({
      kind: "controls-permanent",
      types: ["Artifact"],
    });
    expect(
      b.captured.state.events.find((row) => row.type === "TriggerConditionEvaluated")?.data,
    ).toMatchObject({ phase: "capture", matched: true, controller: "A" });
    expect(b.captured.state.events.filter((row) => row.type === "TriggerCaptured")).toHaveLength(1);
    expect(b.captured.state.events.some((row) => row.type === "CardDrawn")).toBe(false);
    expect(memnite(b.preCapture.state).zone).toBe("battlefield");
    expect(memnite(b.afterWitnessLeft.state)).toMatchObject({
      zone: "hand",
      owner: "A",
      controller: "A",
      generation: memnite(b.captured.state).generation + 1,
      lineage: memnite(b.captured.state).lineage,
    });
    expect(
      b.afterWitnessLeft.state.events
        .filter((row) => row.type === "CardDrawn")
        .map((row) => row.data.player),
    ).toEqual(["B"]);
    expect(player(b.afterWitnessLeft.state, "B").library.length).toBe(
      player(b.captured.state, "B").library.length - 1,
    );
    expect(player(b.afterWitnessLeft.state, "A").library).toEqual(
      player(b.captured.state, "A").library,
    );
    expect(player(b.afterWitnessLeft.state, "A").hand.length).toBe(
      player(b.captured.state, "A").hand.length + 1,
    );
    expect(ability(b.afterWitnessLeft.state)).toEqual(captured);
    expect(
      b.afterRemoved.state.events.find((row) => row.type === "TriggerConditionEvaluated")?.data,
    ).toMatchObject({ phase: "resolution", matched: false, controller: "A" });
    expect(
      b.afterRemoved.state.events.find((row) => row.type === "TriggeredAbilityRemoved")?.data,
    ).toMatchObject({ trigger: captured.id, reason: "intervening-if-false" });
    expect(
      b.afterRemoved.state.events.some((row) =>
        ["CardDrawn", "TriggeredAbilityResolved", "SpellCountered"].includes(row.type),
      ),
    ).toBe(false);
    expect(player(b.afterRemoved.state, "A").hand).toEqual(
      player(b.afterWitnessLeft.state, "A").hand,
    );
    expect(player(b.afterRemoved.state, "A").library).toEqual(
      player(b.afterWitnessLeft.state, "A").library,
    );
    assertInventory(b.afterRemoved.state);
  });
  test(`${mode}: four exact checkpoints reopen, import, replay and preserve accepted old-command receipts`, async () => {
    const { release, boundaries } = fixture(mode);
    for (const boundary of Object.values(boundaries)) {
      const file = path(),
        initial = await restored(open(file), boundary, release),
        views = [initial.view("A"), initial.view("B")];
      await initial.close();
      const repo = open(file),
        reopened = await Coordinator.open(repo, release, boundary.state.manifest.id),
        importedRepo = open(),
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
  test(`${mode}: reopened and imported continuations commit each capture, artifact departure and false removal once`, async () => {
    const { release, boundaries, steps } = fixture(mode);
    for (const step of steps) {
      const before = boundaries[step.before],
        after = boundaries[step.after],
        file = path(),
        initial = await restored(open(file), before, release);
      await initial.close();
      const repo = open(file),
        reopened = await Coordinator.open(repo, release, before.state.manifest.id),
        imported = await restored(open(), before, release);
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
  }, 40_000);
}

for (const stage of ["preCapture", "captured", "afterWitnessLeft"] as const)
  for (const failure of ["INSERT INTO commander_boundaries", "UPDATE commander_matches", "COMMIT"])
    test(`${stage}: ${failure} failure rolls back the conditional history and retries once`, async () => {
      const value = fixture(),
        boundary = value.boundaries[stage],
        db = new Database(path(), { strict: true });
      let armed = false;
      const adapter: SqlDatabase = {
        exec(sql, bindings) {
          if (armed && sql.startsWith(failure)) {
            armed = false;
            throw new Error("Injected conditional persistence failure");
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
      const coordinator = await restored(repo, boundary, value.release),
        step = value.steps.find((row) => row.before === stage);
      if (!step) throw new Error("Missing conditional step");
      for (const input of step.inputs.slice(0, -1))
        expect((await coordinator.submit(input.actor, input)).status).toBe("accepted");
      const input = step.inputs.at(-1);
      if (!input) throw new Error("Missing final ordinary boundary command");
      const before = coordinator.current(),
        view = coordinator.view("A");
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

test("rehashed imports cannot forge captured controller, condition, source provenance or current witness", async () => {
  const value = fixture();
  const mutations: ((captured: ConditionalSelfEntryAbility, state: RulesState) => void)[] = [
    (a) => {
      a.controller = "B";
    },
    (a) => {
      a.source.controller = "B";
    },
    (a) => {
      a.source.owner = "B";
    },
    (a) => {
      a.source.generation++;
    },
    (a) => {
      a.sourceVersion = "0".repeat(64);
    },
    (a) => {
      a.eventIndex++;
    },
    (a) => {
      a.program.id += "-forged";
    },
    (a) => {
      Object.assign(a.program.interveningIf, { cached: true });
    },
    (a) => {
      Object.assign(a.program.interveningIf, { witness: "remembered-artifact" });
    },
    (a) => {
      Object.assign(a.program.interveningIf, { types: ["Land"] });
    },
    (_a, state) => {
      memnite(state).zone = "battlefield";
    },
  ];
  for (const mutate of mutations) {
    const envelope = JSON.parse(value.boundaries.afterWitnessLeft.logical),
      state = envelope.payload.current as RulesState,
      first = Object.values(state.abilities)[0];
    if (!first || first.program.schema !== "commander-conditional-self-entry/1")
      throw new Error("Missing pending conditional context");
    mutate(first as ConditionalSelfEntryAbility, state);
    envelope.payload.currentHash = await semanticHash(state);
    envelope.checksum = await semanticHash(envelope.payload);
    const repo = open();
    await expect(importMatch(repo, value.release, JSON.stringify(envelope))).rejects.toThrow();
    expect(repo.list()).toEqual([]);
  }
  const broken = JSON.parse(value.boundaries.captured.logical);
  broken.checksum = "0".repeat(64);
  await expect(importMatch(open(), value.release, JSON.stringify(broken))).rejects.toThrow();
}, 30_000);

test("a rehashed native pending condition cannot change its captured controller after capture events leave the current window", async () => {
  const value = fixture(),
    file = path(),
    coordinator = await restored(open(file), value.boundaries.afterWitnessLeft, value.release),
    state = coordinator.current();
  const first = Object.values(state.abilities)[0];
  if (!first) throw new Error("Missing pending condition");
  expect(state.events.some((row) => row.type === "TriggerCaptured")).toBe(false);
  first.controller = "B";
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
