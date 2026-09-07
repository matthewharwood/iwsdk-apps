import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  type ContentRelease,
  canonicalJson,
  GameObject,
  type MatchManifest,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  ATTACHMENT_STORAGE_DRIVER,
  ATTACHMENT_STORAGE_SEED,
  attachmentStorageCard,
  attachmentStorageCommand,
  storageAttachmentFixture,
  submitAttachmentResponse,
} from "../test-fixtures/attachment-source";
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
  "aura-target",
  "aura-payment",
  "before-aura",
  "aura-attached",
  "before-equipment",
  "equipment-unattached",
  "equip-target",
  "equip-payment",
  "equip-paid",
  "before-equip",
  "both-attached",
  "before-return",
  "departed",
] as const;
type Stage = (typeof stages)[number];
type Boundary = { state: RulesState; logical: string; last: CommandRecord };
type History = {
  release: ContentRelease;
  file: string;
  execution: ReturnType<Coordinator["executionInfo"]>;
  boundaries: Record<Stage, Boundary>;
};
const output =
  process.env.ATTACHMENT_STORAGE_EVIDENCE_DIR ??
  mkdtempSync(join(tmpdir(), "attachment-native-proof-"));
mkdirSync(output, { recursive: true });
const histories = new Map<MatchManifest["resolver"], History>();
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) {
    try {
      close();
    } catch {
      /* Owned handle may already be closed. */
    }
  }
});
function temp() {
  const dir = mkdtempSync(join(tmpdir(), "attachment-storage-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "matches.sqlite");
}
function open(file = temp()) {
  const repo = openNativeRepository(file);
  cleanup.push(() => repo.close());
  return repo;
}
function required<T>(x: T | undefined | null, message: string): T {
  if (x === undefined || x === null) throw Error(message);
  return x;
}
function history(mode: MatchManifest["resolver"] = "prepared-indexed") {
  return required(histories.get(mode), "Missing ordinary attachment history");
}
function owned(state: RulesState, name: string, actor = "A") {
  return required(
    Object.values(state.objects).find(
      (row) => row.owner === actor && row.definition === attachmentStorageCard(name).id,
    ),
    `Missing ${actor}/${name}`,
  );
}
async function retain(
  repo: Repository,
  c: Coordinator,
  release: ContentRelease,
): Promise<Boundary> {
  const state = c.current();
  return {
    state,
    logical: await exportMatch(repo, release, state.manifest.id),
    last: required(repo.load(state.manifest.id)?.records.at(-1), "Missing receipt"),
  };
}
function pendingEquip(state: RulesState) {
  const top = state.stack.at(-1);
  if (top?.kind !== "activated-ability") throw Error("Missing equip stack entry");
  return required(state.activatedAbilities?.[top.abilityId], "Missing actual equip ability");
}
function equipStage(state: RulesState): Stage | null {
  const ability = pendingEquip(state);
  if (ability.program.schema !== "commander-equip/1") return null;
  if (state.decision?.kind === "activation-target") return "equip-target";
  if (state.decision?.kind === "activation-payment") return "equip-payment";
  if (state.decision?.kind === "priority" && state.consecutivePasses === 1) return "before-equip";
  return ability.payment !== null ? "equip-paid" : null;
}
function auraStage(state: RulesState): Stage | null {
  if (state.decision?.kind === "target") return "aura-target";
  if (state.decision?.kind === "payment") return "aura-payment";
  return state.decision?.kind === "priority" && state.consecutivePasses === 1
    ? "before-aura"
    : null;
}
function stage(state: RulesState, release: ContentRelease): Stage | null {
  if (state.decision?.kind === "starting-player") return null;
  const target = owned(state, "Memnite"),
    aura = owned(state, "Holy Strength"),
    equipment = owned(state, "Shuko"),
    top = state.stack.at(-1);
  const name =
    top?.kind === "spell"
      ? release.definitions[
          required(state.objects[top.objectId], "Missing stack source").definition
        ]?.name
      : undefined;
  const nextResolves = state.decision?.kind === "priority" && state.consecutivePasses === 1;
  if (name === "Holy Strength") return auraStage(state);
  if (name === "Shuko" && nextResolves) return "before-equipment";
  if (top?.kind === "activated-ability") return equipStage(state);
  if (name === "Repulse" && nextResolves) return "before-return";
  if (target.zone === "hand" && aura.zone === "graveyard" && equipment.zone === "battlefield")
    return "departed";
  if (state.attachments?.[aura.id] && state.attachments?.[equipment.id]) return "both-attached";
  if (equipment.zone === "battlefield" && !state.attachments?.[equipment.id])
    return "equipment-unattached";
  return state.attachments?.[aura.id] ? "aura-attached" : null;
}
beforeAll(async () => {
  for (const mode of modes) {
    const source = await storageAttachmentFixture(`ordinary-attachment:${mode}`, mode);
    await Bun.write(join(output, "source-release.json"), canonicalJson(source.release));
    const file = join(output, `${mode}.sqlite`),
      repo = openNativeRepository(file);
    const c = await Coordinator.create(repo, source.release, source.manifest, source.artifact);
    const boundaries: Partial<Record<Stage, Boundary>> = {};
    try {
      for (let n = 0; n < 2000; n++) {
        const name = stage(c.current(), source.release);
        if (name && !boundaries[name]) boundaries[name] = await retain(repo, c, source.release);
        if (name === "departed") break;
        await submitAttachmentResponse(c);
      }
      for (const name of stages) required(boundaries[name], `Ordinary history missed ${name}`);
      histories.set(mode, {
        release: source.release,
        file,
        execution: c.executionInfo(),
        boundaries: boundaries as Record<Stage, Boundary>,
      });
    } finally {
      await c.close();
    }
  }
}, 180000);
afterAll(async () => {
  const cases = [],
    reports = [];
  const projectPath = (path: string) => relative(process.cwd(), path).split("\\").join("/");
  for (const [mode, h] of histories) {
    const points = [];
    for (const name of stages) {
      const b = h.boundaries[name],
        file = `${mode}-${name}.json`;
      await Bun.write(join(output, file), b.logical);
      points.push({
        name,
        file,
        revision: b.state.revision,
        stateHash: await semanticHash(b.state),
        target: owned(b.state, "Memnite"),
        aura: owned(b.state, "Holy Strength"),
        equipment: owned(b.state, "Shuko"),
        attachments: b.state.attachments ?? {},
        decision: b.state.decision,
        stack: b.state.stack,
        events: b.state.events,
        lastCommand: b.last.command,
        lastReceipt: b.last.receipt,
      });
    }
    cases.push({
      name: mode,
      finalSave: projectPath(join(output, `${mode}-departed.json`)),
      checkpoints: stages.map((name) => ({
        name,
        save: projectPath(join(output, `${mode}-${name}.json`)),
      })),
    });
    reports.push({
      mode,
      execution: h.execution,
      manifest: h.boundaries.departed.state.manifest,
      points,
      completedGame: false,
      outcome: h.boundaries.departed.state.outcome,
    });
  }
  await Bun.write(
    join(output, "report.json"),
    `${JSON.stringify(
      {
        schema: "native-attachment-durability/1",
        driver: ATTACHMENT_STORAGE_DRIVER,
        seed: ATTACHMENT_STORAGE_SEED,
        driverSeed: 1,
        parentReleaseHash: "c70aa375fb6bf828af53a74dc8046dcf0bae115f444b1fa476b791dba6b8276b",
        fixtureDefinitions: 7,
        auxiliaryTemplates: 0,
        scope:
          "One ordinary legal two-seat deck/seed family across all three real factories. No state or hand modification; entitled quiet policy is separate from privileged setup/stage qualification. Stopped after Aura/equip resolution and Repulse recipient departure; no completed-game or browser claim.",
        histories: reports,
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(output, "checkpoint-plan.json"),
    `${JSON.stringify(
      {
        schema: "commander-checkpoint-proof/1",
        release: projectPath(join(output, "source-release.json")),
        cases,
      },
      null,
      2,
    )}\n`,
  );
});
async function restored(repo: Repository, b: Boundary, release: ContentRelease) {
  expect(await importMatch(repo, release, b.logical)).toEqual(b.state);
  return Coordinator.open(repo, release, b.state.manifest.id);
}
function assertView(c: Coordinator, power: number, toughness: number, links: number) {
  for (const actor of ["A", "B"]) {
    const view = c.view(actor),
      target = required(
        view.objects.find((row) => row.card?.name === "Memnite"),
        "Visible recipient",
      );
    expect(target.characteristics).toEqual({ power, toughness, keywords: [] });
    expect(view.attachments ?? []).toHaveLength(links);
    expect(
      view.objects
        .filter((row) => row.zone === "hand" && row.owner !== actor)
        .every((row) => row.card === null),
    ).toBe(true);
  }
  expect(c.current().continuousEffects).toEqual([]);
  expect(
    c
      .current()
      .players.map(
        (p) =>
          Object.values(c.current().objects).filter((row) => row.owner === p.id && !row.token)
            .length,
      ),
  ).toEqual([100, 100]);
}
function assertDeparture(before: RulesState, after: RulesState) {
  const target = owned(before, "Memnite"),
    aura = owned(before, "Holy Strength"),
    equipment = owned(before, "Shuko"),
    returned = owned(after, "Memnite");
  expect(returned).toMatchObject({
    lineage: target.lineage,
    generation: target.generation + 1,
    zone: "hand",
  });
  expect(after.objects[target.id]).toBeUndefined();
  expect(owned(after, "Holy Strength")).toMatchObject({
    lineage: aura.lineage,
    generation: aura.generation + 1,
    zone: "graveyard",
  });
  expect(owned(after, "Shuko")).toEqual(equipment);
  expect(after.attachments ?? {}).toEqual({});
  expect(after.frames).toEqual([]);
  expect(after.players.find((p) => p.id === "B")?.library.length).toBe(
    required(
      before.players.find((p) => p.id === "B"),
      "B",
    ).library.length - 1,
  );
  const events = after.events,
    at = (type: string) =>
      required(
        events.find((e) => e.type === type),
        `Missing ${type}`,
      ).index;
  const moved = (id: string) =>
    required(
      events.find(
        (e) => e.type === "ObjectMoved" && GameObject.safeParse(e.data.before).data?.id === id,
      ),
      "Missing actual movement",
    );
  const source = owned(before, "Repulse", "B");
  expect(events.filter((e) => e.type === "AttachmentEnded")).toHaveLength(2);
  for (const event of events.filter((e) => e.type === "AttachmentEnded")) {
    expect(event.data.target).toBe(target.id);
    expect(canonicalJson(event.data.before)).toBe(
      canonicalJson(before.attachments?.[String(event.data.source)]),
    );
    expect(event.index).toBeLessThan(moved(target.id).index);
  }
  expect(moved(target.id).index).toBeLessThan(at("ReturnInstructionCompleted"));
  expect(at("ReturnInstructionCompleted")).toBeLessThan(at("CardDrawn"));
  expect(at("CardDrawn")).toBeLessThan(moved(source.id).index);
  expect(moved(source.id).index).toBeLessThan(at("SpellResolved"));
  expect(at("SpellResolved")).toBeLessThan(moved(aura.id).index);
  expect(events.filter((e) => e.type === "CardDrawn")).toHaveLength(1);
  expect(owned(after, "Repulse", "B").zone).toBe("graveyard");
  expect(after.outcome.kind).toBe("ongoing");
}
for (const mode of modes) {
  test(`${mode}: ordinary Aura and equip target/payment/link/departure semantics`, async () => {
    const h = history(mode),
      b = h.boundaries;
    expect(Object.keys(h.release.definitions)).toHaveLength(7);
    expect(h.execution.definitionCount).toBe(7);
    expect(h.execution.tokenTemplateCount).toBe(0);
    expect(stages.map((s) => b[s].state.revision)).toEqual([
      227, 228, 230, 231, 234, 235, 236, 237, 238, 239, 240, 245, 246,
    ]);
    expect(b["aura-target"].state.decision).toMatchObject({ kind: "target", actor: "A" });
    expect(b["aura-payment"].state.decision).toMatchObject({ kind: "payment", actor: "A" });
    expect(b["before-aura"].state.attachments ?? {}).toEqual({});
    const auraState = b["aura-attached"].state,
      aura = owned(auraState, "Holy Strength");
    const auraOrigin = required(auraState.attachments?.[aura.id], "Aura link").origin;
    expect(auraOrigin.kind).toBe("aura-spell");
    if (auraOrigin.kind !== "aura-spell") throw Error("Wrong retained Aura origin");
    expect(auraOrigin.sourceVersion).toBe(attachmentStorageCard("Holy Strength").sourceVersion);
    expect(auraOrigin.source).toMatchObject({
      definition: aura.definition,
      owner: "A",
      controller: "A",
      zone: "stack",
      generation: aura.generation - 1,
    });
    expect(auraOrigin.target).toEqual(owned(auraState, "Memnite"));
    await assertView(await restored(open(), b["aura-attached"], h.release), 2, 3, 1);
    expect(owned(b["equipment-unattached"].state, "Shuko").zone).toBe("battlefield");
    const pending = pendingEquip(b["equip-payment"].state);
    expect(pending.program).toMatchObject({
      schema: "commander-equip/1",
      timing: "sorcery",
      target: "creature-you-control",
      cost: { mana: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, tapSource: false },
    });
    expect(pending.source).toEqual(owned(b["equip-payment"].state, "Shuko"));
    expect(pending.target).toBe(owned(b["equip-payment"].state, "Memnite").id);
    const paid = pendingEquip(b["equip-paid"].state);
    expect(paid.payment).not.toBeNull();
    expect(paid.sourceVersion).toBe(attachmentStorageCard("Shuko").sourceVersion);
    expect(paid.payment?.sources).toEqual([]);
    expect(paid.payment?.spend).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(Object.keys(b["equip-paid"].state.attachments ?? {})).toHaveLength(1);
    await assertView(await restored(open(), b["both-attached"], h.release), 3, 3, 2);
    assertDeparture(b["before-return"].state, b.departed.state);
  }, 30000);
  test(`${mode}: every checkpoint survives reopen, import, exact retry and replay`, async () => {
    const h = history(mode);
    for (const name of stages) {
      const b = h.boundaries[name],
        file = temp(),
        initial = await restored(open(file), b, h.release),
        view = initial.view("A");
      await initial.close();
      const repo = open(file),
        reopened = await Coordinator.open(repo, h.release, b.state.manifest.id),
        imported = await restored(open(), b, h.release);
      expect(reopened.view("A")).toEqual(view);
      expect(imported.view("A")).toEqual(view);
      const accepted = { status: "accepted" as const, receipt: b.last.receipt };
      expect(await reopened.submit(b.last.command.actor, b.last.command)).toEqual(accepted);
      expect(await imported.submit(b.last.command.actor, b.last.command)).toEqual(accepted);
      expect(reopened.current()).toEqual(b.state);
      expect(imported.current()).toEqual(b.state);
      expect(await replayMatch(repo, h.release, b.state.manifest.id)).toEqual(b.state);
      expect(await exportMatch(repo, h.release, b.state.manifest.id)).toBe(b.logical);
      expect(
        await reopened.submit(b.last.command.actor, {
          ...b.last.command,
          response: { kind: "pass" },
        }),
      ).toMatchObject(
        b.last.command.response.kind === "pass"
          ? { status: "accepted" }
          : { status: "rejected", code: "CommandConflict" },
      );
      expect(
        await reopened.submit(b.last.command.actor, {
          ...b.last.command,
          commandId: `${b.last.command.commandId}:stale`,
        }),
      ).toMatchObject({ status: "rejected", code: "StaleRevision" });
      expect(reopened.current()).toEqual(b.state);
    }
  }, 240000);
  test(`${mode}: concurrent equip payment retry commits once, rejects wrong actor and survives import`, async () => {
    const h = history(mode),
      b = h.boundaries["equip-payment"],
      expected = h.boundaries["equip-paid"];
    const repo = open(),
      c = await restored(repo, b, h.release),
      input = expected.last.command;
    expect(await c.submit("B", input)).toMatchObject({ status: "rejected", code: "ActorMismatch" });
    const [a, duplicate] = await Promise.all([
      c.submit(input.actor, input),
      c.submit(input.actor, input),
    ]);
    expect(a).toEqual({ status: "accepted", receipt: expected.last.receipt });
    expect(duplicate).toEqual(a);
    expect(c.current()).toEqual(expected.state);
    const after = await retain(repo, c, h.release),
      imported = await restored(open(), after, h.release);
    expect(await imported.submit(input.actor, input)).toEqual(a);
    expect(imported.current()).toEqual(expected.state);
  }, 30000);
}
const operations: { before: Stage; after: Stage }[] = [
  { before: "before-aura", after: "aura-attached" },
  { before: "before-equip", after: "both-attached" },
  { before: "before-return", after: "departed" },
];
for (const mode of modes)
  for (const op of operations)
    for (const failure of [
      "INSERT INTO commander_boundaries",
      "UPDATE commander_matches",
      "COMMIT",
    ])
      test(`${mode}/${op.before}: ${failure} rolls back before publication and permits one exact retry`, async () => {
        const h = history(mode),
          b = h.boundaries[op.before],
          expected = h.boundaries[op.after],
          db = new Database(temp(), { strict: true });
        let armed = false;
        let observeFailure = () => {};
        const adapter: SqlDatabase = {
          exec(sql, bindings) {
            if (armed && sql.startsWith(failure)) {
              armed = false;
              observeFailure();
              throw Error("Injected attachment write failure");
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
        const c = await restored(repo, b, h.release),
          view = c.view("A"),
          input = attachmentStorageCommand(b.state, { kind: "pass" });
        observeFailure = () => {
          expect(c.current()).toEqual(b.state);
          expect(c.view("A")).toEqual(view);
        };
        armed = true;
        expect(await c.submit(input.actor, input)).toMatchObject({
          status: "fault",
          code: "PersistenceFailed",
        });
        expect(c.current()).toEqual(b.state);
        expect(c.view("A")).toEqual(view);
        expect(repo.load(b.state.manifest.id)?.current).toEqual(b.state);
        expect(repo.findRecord(b.state.manifest.id, input.commandId)).toBeNull();
        expect(db.query("SELECT count(*) AS count FROM commander_boundaries").get()).toEqual({
          count: b.state.revision + 1,
        });
        const accepted = await c.submit(input.actor, input);
        expect(accepted.status).toBe("accepted");
        expect(await c.submit(input.actor, input)).toEqual(accepted);
        expect(c.current()).toEqual(expected.state);
        expect(await replayMatch(repo, h.release, b.state.manifest.id)).toEqual(expected.state);
      }, 30000);
for (const mode of modes)
  test(`${mode}: coherently rehashed attachment source, recipient and retained origin cannot replace history`, async () => {
    const h = history(mode),
      boundary = h.boundaries["both-attached"];
    const mutations: ((s: RulesState) => void)[] = [
      (s) => {
        owned(s, "Shuko").generation++;
      },
      (s) => {
        const link = required(s.attachments?.[owned(s, "Shuko").id], "link");
        link.target = owned(s, "Holy Strength").id;
      },
      (s) => {
        const link = required(s.attachments?.[owned(s, "Shuko").id], "link");
        link.source = owned(s, "Holy Strength").id;
      },
      (s) => {
        const link = required(s.attachments?.[owned(s, "Shuko").id], "link");
        link.attachedAtEvent++;
      },
      (s) => {
        const origin = required(s.attachments?.[owned(s, "Shuko").id], "link").origin;
        if (origin.kind !== "equip") throw Error("equip");
        origin.ability.source.generation++;
      },
      (s) => {
        const origin = required(s.attachments?.[owned(s, "Shuko").id], "link").origin;
        if (origin.kind !== "equip") throw Error("equip");
        origin.ability.controller = "B";
      },
      (s) => {
        const origin = required(s.attachments?.[owned(s, "Shuko").id], "link").origin;
        if (origin.kind !== "equip") throw Error("equip");
        origin.ability.sourceVersion = "0".repeat(64);
      },
      (s) => {
        const origin = required(s.attachments?.[owned(s, "Holy Strength").id], "link").origin;
        if (origin.kind !== "aura-spell") throw Error("aura");
        origin.target.generation++;
      },
      (s) => {
        s.attachments = {};
      },
    ];
    for (const change of mutations) {
      const envelope = JSON.parse(boundary.logical);
      change(envelope.payload.current);
      envelope.payload.currentHash = await semanticHash(envelope.payload.current);
      envelope.payload.records.at(-1).receipt.stateHash = envelope.payload.currentHash;
      envelope.checksum = await semanticHash(envelope.payload);
      const repo = open();
      await expect(importMatch(repo, h.release, JSON.stringify(envelope))).rejects.toThrow();
      expect(repo.list()).toEqual([]);
    }
  }, 120000);
test("coherently rehashed native attachment checkpoint rejects on reopening", async () => {
  const h = history(),
    b = h.boundaries["both-attached"],
    file = temp(),
    c = await restored(open(file), b, h.release),
    state = c.current();
  state.attachments = {};
  await c.close();
  const db = new Database(file);
  try {
    db.run("UPDATE commander_matches SET current_json=?,current_hash=? WHERE match_id=?", [
      canonicalJson(state),
      await semanticHash(state),
      state.manifest.id,
    ]);
    const last = structuredClone(b.last);
    last.receipt.stateHash = await semanticHash(state);
    db.run("UPDATE commander_commands SET record_json=? WHERE match_id=? AND command_id=?", [
      canonicalJson(last),
      state.manifest.id,
      last.command.commandId,
    ]);
    db.run("UPDATE commander_boundaries SET state_hash=? WHERE match_id=? AND revision=?", [
      last.receipt.stateHash,
      state.manifest.id,
      state.revision,
    ]);
  } finally {
    db.close();
  }
  await expect(Coordinator.open(open(file), h.release, state.manifest.id)).rejects.toThrow();
}, 30000);

test("all three ordinary histories accept the same owned response sequence and final attachment outcome", () => {
  const tapes = modes.map((mode) =>
    JSON.parse(history(mode).boundaries.departed.logical).payload.records.map(
      (row: CommandRecord) => {
        expect(row.command.decisionId.startsWith(`${row.command.matchId}:decision:`)).toBe(true);
        return {
          actor: row.command.actor,
          revision: row.command.revision,
          // Match identity is intentionally distinct for each resolver's retained save.
          decisionIdSuffix: row.command.decisionId.slice(row.command.matchId.length),
          response: row.command.response,
        };
      },
    ),
  );
  expect(tapes[1]).toEqual(tapes[0]);
  expect(tapes[2]).toEqual(tapes[0]);
});
