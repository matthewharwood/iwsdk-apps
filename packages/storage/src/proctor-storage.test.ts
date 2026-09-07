import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ContentRelease,
  canonicalJson,
  type EntryCausedTriggerAbility,
  emptyMana,
  type GameCommand,
  type MatchManifest,
  ResolvingTriggerPaymentFrame,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { findPayment } from "../../simulation/src/driver";
import {
  PROCTOR_STORAGE_DRIVER,
  PROCTOR_STORAGE_SEED,
  proctorStorageCard,
  proctorStorageCommand,
  proctorStorageResponse,
  reachProctorEntry,
  storageProctorFixture,
  submitProctorResponse,
} from "../test-fixtures/proctor-source";
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
const stages = [
  "preEntry",
  "ordinaryOrder",
  "metaOrder",
  "stackedMeta",
  "paymentRequested",
  "standaloneMana",
  "declined",
  "absentReference",
  "absentPaid",
  "resolved",
] as const;
type Stage = (typeof stages)[number];
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
const directory = mkdtempSync(join(tmpdir(), "commander-proctor-fixtures-"));
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) {
    try {
      close();
    } catch {
      /* Explicitly closed coordinators own their databases. */
    }
  }
});
function path() {
  const dir = mkdtempSync(join(tmpdir(), "commander-proctor-storage-"));
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
  if (!value) throw new Error(`Missing ${mode} Proctor fixture`);
  return value;
}
function player(state: RulesState, id: string) {
  const value = state.players.find((row) => row.id === id);
  if (!value) throw new Error("Missing player");
  return value;
}
function paymentFrame(state: RulesState) {
  expect(state.frames).toHaveLength(1);
  return ResolvingTriggerPaymentFrame.parse(state.frames[0]);
}
function metaAbilities(state: RulesState) {
  return Object.values(state.abilities).filter(
    (a): a is EntryCausedTriggerAbility => a.program.schema === "commander-entry-caused-trigger/1",
  );
}
function stackAbilityIds(state: RulesState) {
  return state.stack.flatMap((row) => (row.kind === "triggered-ability" ? [row.triggerId] : []));
}
async function snapshot(
  repo: Repository,
  c: Coordinator,
  release: ContentRelease,
): Promise<Boundary> {
  const state = c.current(),
    last = repo.load(state.manifest.id)?.records.at(-1);
  if (!last) throw new Error("No accepted ordinary prefix");
  return { state, logical: await exportMatch(repo, release, state.manifest.id), last };
}
async function restored(repo: Repository, boundary: Boundary, release: ContentRelease) {
  expect(await importMatch(repo, release, boundary.logical)).toEqual(boundary.state);
  return Coordinator.open(repo, release, boundary.state.manifest.id);
}
async function respond(c: Coordinator) {
  const actor = c.pendingActor;
  if (!actor) throw new Error("Ordinary workflow ended early");
  return submitProctorResponse(c, await proctorStorageResponse(c.view(actor)));
}
async function until(c: Coordinator, predicate: (state: RulesState) => boolean) {
  for (let n = 0; n < 50; n++) {
    if (predicate(c.current())) return;
    await respond(c);
  }
  throw new Error("Proctor workflow stage not reached");
}
async function createHistory(mode: MatchManifest["resolver"]) {
  const source = await storageProctorFixture(`ordinary-proctor-durability:${mode}`, mode),
    file = join(directory, `${mode}.sqlite`),
    repo = openNativeRepository(file),
    c = await Coordinator.create(repo, source.release, source.manifest, source.artifact);
  const saved: Partial<Record<Stage, Boundary>> = {};
  const take = async (stage: Stage) => {
    saved[stage] = await snapshot(repo, c, source.release);
  };
  try {
    await reachProctorEntry(c);
    await take("preEntry");
    await submitProctorResponse(c, { kind: "pass" });
    await take("ordinaryOrder");
    await respond(c);
    await respond(c);
    await take("metaOrder");
    await respond(c);
    await respond(c);
    await take("stackedMeta");
    await submitProctorResponse(c, { kind: "pass" });
    await submitProctorResponse(c, { kind: "pass" });
    await take("paymentRequested");
    const mana = c.view(c.pendingActor ?? "").decision?.manaSources[0];
    if (!mana?.colors[0]) throw new Error("Missing owned standalone mana");
    await submitProctorResponse(c, {
      kind: "mana",
      source: { object: mana.object, color: mana.colors[0] },
    });
    await take("standaloneMana");
    await submitProctorResponse(c, { kind: "trigger-payment", pay: false });
    await take("declined");
    await until(c, (state) =>
      state.frames.some(
        (frame) =>
          frame.kind === "resolving-trigger-payment" &&
          frame.payerBasis === "last-known-referenced-ability",
      ),
    );
    await take("absentReference");
    const view = c.view(c.pendingActor ?? ""),
      actor = view.players.find((row) => row.id === view.player),
      d = view.decision;
    if (!actor || !d?.cost) throw new Error("No absent-reference payer");
    const payment = findPayment(d.cost, actor.mana, d.manaSources);
    if (!payment) throw new Error("No complete optional payment");
    await submitProctorResponse(c, { ...payment, kind: "trigger-payment", pay: true });
    await take("absentPaid");
    await until(c, (state) => state.stack.length === 0 && state.decision?.kind === "priority");
    await take("resolved");
    for (const stage of stages) if (!saved[stage]) throw new Error(`Missing actual ${stage}`);
    const boundaries = saved as Record<Stage, Boundary>,
      records = repo.load(source.manifest.id)?.records;
    if (!records) throw new Error("Missing accepted tape");
    const steps: Step[] = stages.slice(1).map((after, index) => {
      const before = stages[index];
      if (!before) throw new Error("Missing preceding checkpoint");
      return {
        before,
        after,
        inputs: records
          .slice(boundaries[before].state.revision, boundaries[after].state.revision)
          .map((record) => record.command),
      };
    });
    fixtures.set(mode, {
      release: source.release,
      file,
      boundaries,
      steps,
      execution: c.executionInfo(),
    });
  } finally {
    await c.close();
  }
}
beforeAll(async () => {
  for (const mode of modes) await createHistory(mode);
}, 120_000);
afterAll(async () => {
  try {
    const destination = process.env.PROCTOR_STORAGE_EVIDENCE_DIR;
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
      for (const stage of stages) {
        const boundary = value.boundaries[stage],
          file = `${mode}-${stage}.json`;
        await Bun.write(join(destination, file), boundary.logical);
        boundaries.push({
          stage,
          file,
          revision: boundary.state.revision,
          stateHash: await semanticHash(boundary.state),
          decision: boundary.state.decision,
          placement: boundary.state.triggerPlacement,
          abilities: boundary.state.abilities,
          stack: boundary.state.stack,
          frames: boundary.state.frames,
          players: boundary.state.players.map((row) => ({
            id: row.id,
            life: row.life,
            mana: row.mana,
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
        manifest: value.boundaries.preEntry.state.manifest,
        finalSave: `${mode}-resolved.json`,
        boundaries,
        steps: value.steps,
      });
    }
    const report = {
      schema: "native-proctor-durability/1",
      scope:
        "Ordinary legal dealt two-seat histories stopped after both Wardens/Proctors, actual Queen’s Commission token entry, both APNAP passes, owned mana/decline, linked lower counter and optional payment for that same now-absent ability. All final outcomes remain ongoing. No constructed state, completed game, browser, OPFS or all-G2 claim.",
      driver: PROCTOR_STORAGE_DRIVER,
      seed: PROCTOR_STORAGE_SEED,
      driverSeed: 1,
      seedSelection:
        "Privileged offline qualification retained separately in proctor-seed-search/attempt-1.json; actual action choices use current actor observations; the test harness separately inspects full state to name and audit checkpoints.",
      originReleaseHash: "13f3654940711c24cd84ff2665d126644687a536749d098f92dea2e52db957e4",
      sourceReleaseFile: "source-release.json",
      histories,
    };
    await Bun.write(join(destination, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const mode of modes) {
  test(`${mode}: ordinary legal token entry yields four ordinary and eight meta abilities with two distinct APNAP passes`, () => {
    const b = fixture(mode).boundaries,
      s = b.ordinaryOrder.state,
      ordinary = Object.values(s.abilities).filter(
        (a) => a.program.schema !== "commander-entry-caused-trigger/1",
      ),
      metas = metaAbilities(s);
    expect(s.activePlayer).toBe("A");
    expect(s.decision).toMatchObject({ kind: "trigger-order", actor: "A" });
    expect(s.decision?.triggers).toHaveLength(2);
    expect(ordinary).toHaveLength(4);
    expect(metas).toHaveLength(8);
    expect(s.pendingTriggers).toEqual([]);
    expect(s.triggerPlacement?.cohort).toHaveLength(12);
    expect(s.triggerPlacement?.phase).toBe("ordinary");
    expect(s.events.filter((e) => e.type === "TriggerCaptured")).toHaveLength(12);
    const tokens = Object.values(s.objects).filter((object) => object.token);
    expect(tokens).toHaveLength(2);
    for (const token of tokens)
      expect(token).toMatchObject({ owner: "A", controller: "A", zone: "battlefield" });
    for (const lower of ordinary)
      expect(metas.filter((meta) => meta.referencedTrigger.captured.id === lower.id)).toHaveLength(
        2,
      );
    for (const meta of metas) {
      expect(canonicalJson(meta.program)).toBe(
        canonicalJson(proctorStorageCard("Strict Proctor").triggerPrograms?.[0] ?? null),
      );
      expect(meta.sourceVersion).toBe(proctorStorageCard("Strict Proctor").sourceVersion);
      expect(meta.immediateCause).toEqual({
        kind: "ability-triggered",
        triggeringAbilityId: meta.referencedTrigger.captured.id,
      });
      expect(meta.referencedTrigger.immediateCause.kind).toBe("battlefield-entry");
      expect(canonicalJson(meta.referencedTrigger.captured)).toBe(
        canonicalJson(s.abilities[meta.referencedTrigger.captured.id] ?? null),
      );
      expect(meta.referencedTrigger.immediateCause.enteredObjectIds).toEqual(
        tokens.map((row) => row.id),
      );
    }
    const second = b.metaOrder.state;
    expect(second.triggerPlacement?.phase).toBe("triggered-by-trigger");
    expect(second.decision).toMatchObject({ kind: "trigger-order", actor: "A" });
    expect(second.decision?.triggers).toHaveLength(4);
    expect(stackAbilityIds(second).map((id) => second.abilities[id]?.controller)).toEqual([
      "A",
      "A",
      "B",
      "B",
    ]);
    const stacked = b.stackedMeta.state;
    expect(stacked.triggerPlacement).toBeNull();
    expect(stacked.pendingTriggers).toEqual([]);
    expect(stacked.stack).toHaveLength(12);
    expect(stackAbilityIds(stacked).map((id) => stacked.abilities[id]?.controller)).toEqual([
      "A",
      "A",
      "B",
      "B",
      "A",
      "A",
      "A",
      "A",
      "B",
      "B",
      "B",
      "B",
    ]);
    expect(
      stackAbilityIds(stacked)
        .slice(0, 4)
        .every(
          (id) => stacked.abilities[id]?.program.schema !== "commander-entry-caused-trigger/1",
        ),
    ).toBe(true);
    expect(
      stackAbilityIds(stacked)
        .slice(4)
        .every(
          (id) => stacked.abilities[id]?.program.schema === "commander-entry-caused-trigger/1",
        ),
    ).toBe(true);
    for (const state of [b.preEntry.state, s, b.resolved.state]) {
      expect(state.outcome).toEqual({ kind: "ongoing" });
      for (const actor of ["A", "B"])
        expect(
          Object.values(state.objects).filter((row) => row.owner === actor && !row.token),
        ).toHaveLength(100);
    }
  });
  test(`${mode}: owned standalone mana persists through decline and the same absent reference permits later optional payment`, () => {
    const b = fixture(mode).boundaries,
      first = paymentFrame(b.paymentRequested.state),
      later = paymentFrame(b.absentReference.state);
    expect(first.payer).toBe("B");
    expect(first.payerBasis).toBe("current-referenced-ability");
    expect(b.paymentRequested.state.priorityPlayer).toBeNull();
    expect(b.paymentRequested.state.decision).toMatchObject({
      kind: "trigger-payment",
      actor: "B",
      cost: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    });
    expect(paymentFrame(b.standaloneMana.state)).toEqual(first);
    expect(player(b.standaloneMana.state, "B").mana.W).toBe(
      player(b.paymentRequested.state, "B").mana.W + 1,
    );
    const mana = b.standaloneMana.last.command.response;
    if (mana.kind !== "mana") throw new Error("No recorded standalone activation");
    expect(b.paymentRequested.state.objects[mana.source.object]?.tapped).toBe(false);
    expect(b.standaloneMana.state.objects[mana.source.object]?.tapped).toBe(true);
    expect(b.declined.state.objects[mana.source.object]?.tapped).toBe(true);
    expect(player(b.declined.state, "B").mana).toEqual(player(b.standaloneMana.state, "B").mana);
    expect(
      b.declined.state.abilities[first.resolvingTrigger.referencedTrigger.captured.id],
    ).toBeUndefined();
    expect(
      b.declined.state.events.find((e) => e.type === "TriggeredAbilityCountered")?.data.trigger,
    ).toBe(first.resolvingTrigger.referencedTrigger.captured.id);
    expect(later.resolvingTrigger.id).not.toBe(first.resolvingTrigger.id);
    expect(later.resolvingTrigger.referencedTrigger.captured).toEqual(
      first.resolvingTrigger.referencedTrigger.captured,
    );
    expect(later.payer).toBe("B");
    expect(later.payerBasis).toBe("last-known-referenced-ability");
    expect(
      b.absentReference.state.abilities[later.resolvingTrigger.referencedTrigger.captured.id],
    ).toBeUndefined();
    expect(
      b.absentPaid.state.events.find((e) => e.type === "TriggerPaymentCompleted")?.data,
    ).toMatchObject({
      payer: "B",
      paid: true,
      referencedPresent: false,
      referencedTrigger: later.resolvingTrigger.referencedTrigger.captured.id,
    });
    expect(b.absentPaid.state.events.some((e) => e.type === "TriggeredAbilityCountered")).toBe(
      false,
    );
    expect(b.resolved.state.stack).toEqual([]);
    expect(b.resolved.state.abilities).toEqual({});
    expect(b.resolved.state.frames).toEqual([]);
    expect(b.resolved.state.players.map((p) => p.life)).toEqual(
      b.preEntry.state.players.map((p) => p.life),
    );
  });
  test(`${mode}: all10 actual checkpoints reopen, import, replay and preserve exact old accepted receipts`, async () => {
    const { release, boundaries } = fixture(mode);
    for (const boundary of Object.values(boundaries)) {
      const file = path(),
        initial = open(file);
      expect(await importMatch(initial, release, boundary.logical)).toEqual(boundary.state);
      initial.close();
      const repo = open(file),
        reopened = await Coordinator.open(repo, release, boundary.state.manifest.id),
        importedRepo = open(),
        imported = await restored(importedRepo, boundary, release);
      const views = [reopened.view("A"), reopened.view("B")];
      // Coordinator.open and importMatch each validate the complete replay prefix.
      for (const c of [reopened, imported]) {
        expect(c.current()).toEqual(boundary.state);
        expect([c.view("A"), c.view("B")]).toEqual(views);
        expect(await c.submit(boundary.last.command.actor, boundary.last.command)).toEqual({
          status: "accepted",
          receipt: boundary.last.receipt,
        });
        expect(c.current()).toEqual(boundary.state);
        expect(
          await c.submit(boundary.last.command.actor, {
            ...boundary.last.command,
            response: { kind: "cancel-cast" },
          }),
        ).toMatchObject({ status: "rejected", code: "CommandConflict" });
        expect(
          await c.submit(boundary.last.command.actor, {
            ...boundary.last.command,
            commandId: `${boundary.last.command.commandId}:stale`,
          }),
        ).toMatchObject({ status: "rejected", code: "StaleRevision" });
        expect(c.current()).toEqual(boundary.state);
        for (const viewer of ["A", "B"])
          expect(
            c
              .view(viewer)
              .objects.filter((row) => row.zone === "hand" && row.owner !== viewer)
              .every((row) => row.card === null),
          ).toBe(true);
      }
      if (boundary === boundaries.resolved)
        expect(await replayMatch(repo, release, boundary.state.manifest.id)).toEqual(
          boundary.state,
        );
    }
  }, 120_000);
  test(`${mode}: concurrent retries and imported continuations commit all nine real transitions exactly once`, async () => {
    const { release, boundaries, steps } = fixture(mode),
      before = boundaries.preEntry,
      file = path(),
      initial = open(file);
    expect(await importMatch(initial, release, before.logical)).toEqual(before.state);
    initial.close();
    const repo = open(file),
      reopened = await Coordinator.open(repo, release, before.state.manifest.id),
      imported = await restored(open(), before, release);
    for (const step of steps) {
      expect(reopened.current()).toEqual(boundaries[step.before].state);
      for (const input of step.inputs) {
        const [a, b, c] = await Promise.all([
          reopened.submit(input.actor, input),
          reopened.submit(input.actor, input),
          imported.submit(input.actor, input),
        ]);
        expect(a.status).toBe("accepted");
        expect(b).toEqual(a);
        expect(c).toEqual(a);
      }
      expect(reopened.current()).toEqual(boundaries[step.after].state);
      expect(imported.current()).toEqual(boundaries[step.after].state);
      expect(repo.load(before.state.manifest.id)?.records).toHaveLength(
        boundaries[step.after].state.revision,
      );
    }
  }, 60_000);
}

for (const stage of [
  "ordinaryOrder",
  "paymentRequested",
  "standaloneMana",
  "absentReference",
] as const)
  for (const failure of ["INSERT INTO commander_boundaries", "UPDATE commander_matches", "COMMIT"])
    test(`${stage}: ${failure} failure rolls back publication and exact retry commits once`, async () => {
      const value = fixture(),
        boundary = value.boundaries[stage],
        db = new Database(path(), { strict: true });
      let armed = false;
      const adapter: SqlDatabase = {
        exec(sql, bindings) {
          if (armed && sql.startsWith(failure)) {
            armed = false;
            throw new Error("Injected Proctor persistence failure");
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
      const c = await restored(repo, boundary, value.release),
        step = value.steps.find((row) => row.before === stage);
      if (!step) throw new Error("Missing stage continuation");
      for (const input of step.inputs.slice(0, -1))
        expect((await c.submit(input.actor, input)).status).toBe("accepted");
      const input = step.inputs.at(-1);
      if (!input) throw new Error("Missing actual command");
      const before = c.current(),
        view = c.view("A");
      armed = true;
      expect(await c.submit(input.actor, input)).toMatchObject({
        status: "fault",
        code: "PersistenceFailed",
      });
      expect(c.current()).toEqual(before);
      expect(c.view("A")).toEqual(view);
      expect(repo.load(before.manifest.id)?.current).toEqual(before);
      expect(repo.findRecord(before.manifest.id, input.commandId)).toBeNull();
      expect(db.query("SELECT count(*) AS count FROM commander_boundaries").get()).toEqual({
        count: before.revision + 1,
      });
      const accepted = await c.submit(input.actor, input);
      expect(accepted.status).toBe("accepted");
      expect(await c.submit(input.actor, input)).toEqual(accepted);
      expect(c.current()).toEqual(value.boundaries[step.after].state);
    }, 30_000);

test("reopened owned mana rejects a partial or foreign payment atomically and later decline retains the earlier activation", async () => {
  const value = fixture(),
    boundary = value.boundaries.standaloneMana,
    repo = open(),
    c = await restored(repo, boundary, value.release),
    before = c.current(),
    frame = paymentFrame(before),
    source = before.decision?.manaSources[0];
  if (!source?.colors[0]) throw new Error("Missing still available mana");
  const spend = { ...emptyMana(), W: 1 };
  const commands = [
    proctorStorageCommand(before, { kind: "trigger-payment", pay: true, sources: [], spend }),
    proctorStorageCommand(before, {
      kind: "trigger-payment",
      pay: true,
      sources: [{ object: source.object, color: source.colors[0] }],
      spend,
    }),
    proctorStorageCommand(before, { kind: "pass" }),
  ];
  for (const [index, input] of commands.entries()) {
    input.commandId += `:illegal:${index}`;
    expect((await c.submit(input.actor, input)).status).toBe("rejected");
    expect(c.current()).toEqual(before);
    expect(repo.findRecord(before.manifest.id, input.commandId)).toBeNull();
  }
  const own = proctorStorageCommand(before, { kind: "trigger-payment", pay: false }),
    foreign = {
      ...own,
      actor: frame.payer === "A" ? "B" : "A",
      commandId: `${own.commandId}:foreign`,
    };
  expect((await c.submit(foreign.actor, foreign)).status).toBe("rejected");
  expect(c.current()).toEqual(before);
  const staleReference = {
    ...own,
    decisionId: `${own.decisionId}:different`,
    commandId: `${own.commandId}:wrong-decision`,
  };
  expect((await c.submit(own.actor, staleReference)).status).toBe("rejected");
  expect(c.current()).toEqual(before);
  expect((await c.submit(own.actor, own)).status).toBe("accepted");
  expect(c.current()).toEqual(value.boundaries.declined.state);
  expect(player(c.current(), frame.payer).mana).toEqual(player(before, frame.payer).mana);
}, 30_000);

test("rehashed imports reject changed reference, controller, cause, payment frame, ordering cohort and source identity", async () => {
  const value = fixture();
  const mutations: ((state: RulesState) => void)[] = [
    (s) => {
      const frame = paymentFrame(s);
      frame.payer = "A";
      s.frames = [frame];
    },
    (s) => {
      const frame = paymentFrame(s);
      frame.payerBasis = "current-referenced-ability";
      s.frames = [frame];
    },
    (s) => {
      const frame = paymentFrame(s);
      Object.assign(frame.cost, { generic: 1 });
      s.frames = [frame];
    },
    (s) => {
      const frame = paymentFrame(s);
      frame.resolvingTrigger.sourceVersion = "0".repeat(64);
      s.frames = [frame];
    },
    (s) => {
      const frame = paymentFrame(s);
      frame.resolvingTrigger.source.generation++;
      s.frames = [frame];
    },
    (s) => {
      const frame = paymentFrame(s);
      frame.resolvingTrigger.referencedTrigger.captured.controller = "A";
      s.frames = [frame];
    },
    (s) => {
      const frame = paymentFrame(s);
      frame.resolvingTrigger.referencedTrigger.captured.id += ":unrelated";
      s.frames = [frame];
    },
    (s) => {
      const frame = paymentFrame(s);
      frame.resolvingTrigger.immediateCause.triggeringAbilityId += ":ancestry";
      s.frames = [frame];
    },
    (s) => {
      const frame = paymentFrame(s);
      frame.resolvingTrigger.referencedTrigger.immediateCause.enteredObjectIds = [];
      s.frames = [frame];
    },
    (s) => {
      const frame = paymentFrame(s);
      frame.resolvingTrigger.program.id += ":forged";
      s.frames = [frame];
    },
    (s) => {
      s.frames = [];
    },
    (s) => {
      s.priorityPlayer = "B";
    },
  ];
  for (const change of mutations) {
    const envelope = JSON.parse(value.boundaries.absentReference.logical),
      state = envelope.payload.current as RulesState;
    change(state);
    envelope.payload.currentHash = await semanticHash(state);
    envelope.checksum = await semanticHash(envelope.payload);
    const repo = open();
    await expect(importMatch(repo, value.release, JSON.stringify(envelope))).rejects.toThrow();
    expect(repo.list()).toEqual([]);
  }
  for (const stage of ["ordinaryOrder", "metaOrder"] as const) {
    const envelope = JSON.parse(value.boundaries[stage].logical),
      state = envelope.payload.current as RulesState;
    if (!state.triggerPlacement) throw new Error("Missing real ordering cohort");
    state.triggerPlacement.remainingPlayers.reverse();
    state.triggerPlacement.phase = stage === "ordinaryOrder" ? "triggered-by-trigger" : "ordinary";
    envelope.payload.currentHash = await semanticHash(state);
    envelope.checksum = await semanticHash(envelope.payload);
    const repo = open();
    await expect(importMatch(repo, value.release, JSON.stringify(envelope))).rejects.toThrow();
    expect(repo.list()).toEqual([]);
  }
  const broken = JSON.parse(value.boundaries.paymentRequested.logical);
  broken.checksum = "0".repeat(64);
  await expect(importMatch(open(), value.release, JSON.stringify(broken))).rejects.toThrow();
}, 60_000);

test("native current-context tampering remains rejected after original source capture events leave the event window", async () => {
  const value = fixture(),
    file = path(),
    c = await restored(open(file), value.boundaries.absentReference, value.release),
    state = c.current(),
    meta = metaAbilities(state).find((row) => row.referencedTrigger.captured.controller === "B");
  if (!meta) throw new Error("Missing live meta");
  expect(state.events.some((e) => e.type === "TriggerCaptured")).toBe(false);
  meta.referencedTrigger.captured.controller = "A";
  await c.close();
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
}, 30_000);
