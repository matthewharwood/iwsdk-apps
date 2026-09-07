import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  type ContentRelease,
  canonicalJson,
  type GameCommand,
  type MatchManifest,
  PendingDamageFrame,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  DAMAGE_STORAGE_DRIVER,
  DAMAGE_STORAGE_SEEDS,
  type DamageFamily,
  damageStorageCard,
  damageStorageCommand,
  damageStorageResponse,
  storageDamageFixture,
  submitDamageResponse,
} from "../test-fixtures/damage-source";
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
const families: DamageFamily[] = ["two-doublers", "affected-controller"];
const stages = ["before-damage", "proposed", "first-rewrite", "resolved"] as const;
type Stage = (typeof stages)[number];
type Boundary = { state: RulesState; logical: string; last: CommandRecord };
type Fixture = {
  family: DamageFamily;
  mode: MatchManifest["resolver"];
  release: ContentRelease;
  file: string;
  boundaries: Record<Stage, Boundary>;
  execution: ReturnType<Coordinator["executionInfo"]>;
};
const fixtures = new Map<string, Fixture>();
const alternativeBranches = new Map<string, string>();
const directory = mkdtempSync(join(tmpdir(), "commander-damage-histories-"));
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) {
    try {
      close();
    } catch {
      /* Coordinator may already own a closed connection. */
    }
  }
});
function path() {
  const dir = mkdtempSync(join(tmpdir(), "commander-damage-native-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "matches.sqlite");
}
function open(file = path()) {
  const repo = openNativeRepository(file);
  cleanup.push(() => repo.close());
  return repo;
}
function fixture(family: DamageFamily, mode: MatchManifest["resolver"] = "prepared-indexed") {
  const value = fixtures.get(`${family}:${mode}`);
  if (!value) throw new Error(`Missing real ${family}/${mode} history`);
  return value;
}
function frame(state: RulesState) {
  expect(state.frames).toHaveLength(1);
  return PendingDamageFrame.parse(state.frames[0]);
}
function targetCreature(state: RulesState) {
  const row = Object.values(state.objects).find(
    (entry) =>
      entry.zone === "battlefield" &&
      entry.definition === damageStorageCard("Indomitable Ancients").id,
  );
  if (!row) throw new Error("Actual Indomitable Ancients is absent");
  return row;
}
function life(state: RulesState, actor = "A") {
  const row = state.players.find((entry) => entry.id === actor);
  if (!row) throw new Error("Missing seat");
  return row.life;
}
async function take(repo: Repository, c: Coordinator, release: ContentRelease): Promise<Boundary> {
  const state = c.current();
  const last = repo.load(state.manifest.id)?.records.at(-1);
  if (!last) throw new Error("No accepted ordinary command prefix");
  return { state, logical: await exportMatch(repo, release, state.manifest.id), last };
}
async function respond(
  c: Coordinator,
  family: DamageFamily,
  order: "multiply-first" | "other-first" = "multiply-first",
) {
  const actor = c.pendingActor;
  if (!actor) throw new Error("No owned damage history action");
  return submitDamageResponse(c, await damageStorageResponse(c.view(actor), family, order));
}
async function createHistory(family: DamageFamily, mode: MatchManifest["resolver"]) {
  const source = await storageDamageFixture(family, `ordinary-damage:${family}:${mode}`, mode);
  const file = join(directory, `${family}-${mode}.sqlite`);
  const repo = openNativeRepository(file);
  const c = await Coordinator.create(repo, source.release, source.manifest, source.artifact);
  try {
    let reached = false;
    for (let count = 0; count < 2500; count++) {
      const state = c.current();
      const top = state.stack.at(-1);
      if (
        state.decision?.kind === "priority" &&
        top?.kind === "spell" &&
        state.objects[top.objectId]?.definition === damageStorageCard("Sorin's Thirst").id &&
        state.consecutivePasses === state.players.length - 1
      ) {
        reached = true;
        break;
      }
      await respond(c, family);
    }
    if (!reached)
      throw new Error(`Ordinary ${family} did not reach source damage within2500commands`);
    const before = await take(repo, c, source.release);
    await submitDamageResponse(c, { kind: "pass" });
    const proposed = await take(repo, c, source.release);
    if (proposed.state.decision?.kind !== "damage-replacement")
      throw new Error("No genuine initial replacement decision");
    await respond(c, family);
    const first = await take(repo, c, source.release);
    if (first.state.decision?.kind !== "damage-replacement")
      throw new Error("No genuine first-rewrite persisted decision");
    await respond(c, family);
    const resolved = await take(repo, c, source.release);
    if (resolved.state.frames.some((row) => row.kind === "pending-damage"))
      throw new Error("Expected two replacements to finish");
    fixtures.set(`${family}:${mode}`, {
      family,
      mode,
      file,
      release: source.release,
      execution: c.executionInfo(),
      boundaries: { "before-damage": before, proposed, "first-rewrite": first, resolved },
    });
  } finally {
    await c.close();
  }
}
beforeAll(async () => {
  for (const family of families) for (const mode of modes) await createHistory(family, mode);
}, 180_000);
afterAll(async () => {
  try {
    const destination = process.env.DAMAGE_STORAGE_EVIDENCE_DIR;
    if (!destination) return;
    mkdirSync(destination, { recursive: true });
    const histories = [];
    const cases = [];
    const projectPath = (file: string) => relative(process.cwd(), file).split("\\").join("/");
    for (const value of fixtures.values()) {
      const prefix = `${value.family}-${value.mode}`;
      copyFileSync(value.file, join(destination, `${prefix}.sqlite`));
      await Bun.write(
        join(destination, "source-release.json"),
        `${JSON.stringify(value.release, null, 2)}\n`,
      );
      const checkpoints = [];
      const points = [];
      for (const stage of stages) {
        const boundary = value.boundaries[stage];
        const file = join(destination, `${prefix}-${stage}.json`);
        await Bun.write(file, boundary.logical);
        checkpoints.push({ name: stage, save: projectPath(file) });
        points.push({
          stage,
          file: `${prefix}-${stage}.json`,
          revision: boundary.state.revision,
          stateHash: await semanticHash(boundary.state),
          decision: boundary.state.decision,
          frames: boundary.state.frames,
          events: boundary.state.events,
          stack: boundary.state.stack,
          target: targetCreature(boundary.state),
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
      cases.push({
        name: prefix,
        finalSave: projectPath(join(destination, `${prefix}-resolved.json`)),
        checkpoints,
      });
      histories.push({
        family: value.family,
        mode: value.mode,
        execution: value.execution,
        manifest: value.boundaries.proposed.state.manifest,
        completedGame: false,
        points,
      });
      const alternative = alternativeBranches.get(`${value.family}:${value.mode}`);
      if (alternative)
        await Bun.write(join(destination, `${prefix}-other-order.json`), alternative);
    }
    await Bun.write(
      join(destination, "report.json"),
      `${JSON.stringify(
        {
          schema: "native-damage-durability/1",
          driver: DAMAGE_STORAGE_DRIVER,
          driverSeed: 1,
          parentReleaseHash: "77857dc934ac410326f5a1136bca66757c33ae7ae74326c9d3f0f354432810de",
          fixturePrimaryDefinitions: 12,
          auxiliaryTemplates: 0,
          seeds: DAMAGE_STORAGE_SEEDS,
          alternativeBranchFiles: [...alternativeBranches.keys()].map(
            (key) => `${key.replace(":", "-")}-other-order.json`,
          ),
          scope:
            "Two distinct ordinary legal dealt histories, each across three resolvers, stopped after real Sorin’s Thirst damage replacements and printed gain2. No gameplay-state mutation or completed game. Privileged offline shuffle qualification and state-based checkpoint naming are separate from entitled-observation action selection. Final rewrite, damage publication, remaining spell instruction and spell completion form one accepted command; no artificial intervening checkpoint.",
          histories,
        },
        null,
        2,
      )}\n`,
    );
    await Bun.write(
      join(destination, "checkpoint-plan.json"),
      `${JSON.stringify({ schema: "commander-checkpoint-proof/1", release: projectPath(join(destination, "source-release.json")), cases }, null, 2)}\n`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
async function restored(repo: Repository, boundary: Boundary, release: ContentRelease) {
  expect(await importMatch(repo, release, boundary.logical)).toEqual(boundary.state);
  return Coordinator.open(repo, release, boundary.state.manifest.id);
}

for (const family of families)
  for (const mode of modes) {
    test(`${family}/${mode}: ordinary spell damage pauses twice for the affected controller and resumes gain2 exactly once`, () => {
      const b = fixture(family, mode).boundaries;
      const initial = frame(b.proposed.state),
        first = frame(b["first-rewrite"].state);
      const affected = family === "two-doublers" ? "B" : "C";
      expect(b.proposed.state.decision).toMatchObject({
        actor: affected,
        kind: "damage-replacement",
      });
      expect(initial.host).toMatchObject({
        kind: "spell-instruction",
        controller: "A",
        effectIndex: 0,
      });
      expect(initial.occurrences).toHaveLength(1);
      expect(initial.occurrences[0]).toMatchObject({
        amount: 2,
        applied: [],
        original: { affectedPlayer: affected, amount: 2, source: { isSpell: true } },
      });
      expect(initial.version).toBe(0);
      expect(initial.rewrites).toEqual([]);
      expect(first.eventId).toBe(initial.eventId);
      expect(first.origin).toEqual(initial.origin);
      expect(first.host).toEqual(initial.host);
      expect(first.version).toBe(1);
      expect(first.occurrences[0]?.amount).toBe(4);
      expect(first.occurrences[0]?.applied).toHaveLength(1);
      expect(first.rewrites).toHaveLength(1);
      expect(first.rewrites[0]).toMatchObject({
        actor: affected,
        before: 2,
        after: 4,
        prevented: 0,
      });
      for (const state of [b.proposed.state, b["first-rewrite"].state]) {
        expect(targetCreature(state).damage).toBe(0);
        expect(state.players.map((row) => row.life)).toEqual(
          b["before-damage"].state.players.map((row) => row.life),
        );
        expect(state.priorityPlayer).toBeNull();
        expect(state.stack).toHaveLength(1);
        expect(
          state.events.some((row) =>
            ["NoncombatDamageDealt", "LifeGained", "SpellResolved"].includes(row.type),
          ),
        ).toBe(false);
      }
      const final = b.resolved.state;
      expect(targetCreature(final).damage).toBe(family === "two-doublers" ? 8 : 3);
      expect(life(final)).toBe(life(b["before-damage"].state) + 2);
      expect(final.frames).toEqual([]);
      expect(final.stack).toEqual([]);
      expect(final.decision?.kind).toBe("priority");
      const kinds = final.events.map((row) => row.type);
      expect(kinds.filter((kind) => kind === "NoncombatDamageDealt")).toHaveLength(1);
      expect(kinds.filter((kind) => kind === "LifeGained")).toHaveLength(1);
      expect(kinds.filter((kind) => kind === "SpellResolved")).toHaveLength(1);
      expect(kinds.indexOf("NoncombatDamageDealt")).toBeLessThan(kinds.indexOf("LifeGained"));
      expect(kinds.indexOf("LifeGained")).toBeLessThan(kinds.indexOf("SpellResolved"));
      expect(final.outcome).toEqual({ kind: "ongoing" });
      for (const player of final.players)
        expect(
          Object.values(final.objects).filter((row) => row.owner === player.id && !row.token),
        ).toHaveLength(100);
    });
    test(`${family}/${mode}: every genuine checkpoint reopens/imports with exact old receipts and unmodified entitled observations`, async () => {
      const value = fixture(family, mode);
      for (const boundary of Object.values(value.boundaries)) {
        const file = path(),
          initial = open(file);
        expect(await importMatch(initial, value.release, boundary.logical)).toEqual(boundary.state);
        initial.close();
        const reopened = await Coordinator.open(
          open(file),
          value.release,
          boundary.state.manifest.id,
        );
        const imported = await restored(open(), boundary, value.release);
        for (const c of [reopened, imported]) {
          expect(c.current()).toEqual(boundary.state);
          for (const seat of boundary.state.players) {
            expect(c.view(seat.id)).toEqual(reopened.view(seat.id));
            expect(
              c.view(seat.id).objects.some((row) => row.zone === "hand" && row.owner !== seat.id),
            ).toBe(false);
            if (boundary.state.decision?.actor !== seat.id)
              expect(c.view(seat.id).decision).toBeNull();
          }
          expect(await c.submit(boundary.last.command.actor, boundary.last.command)).toEqual({
            status: "accepted",
            receipt: boundary.last.receipt,
          });
          expect(
            await c.submit(boundary.last.command.actor, {
              ...boundary.last.command,
              response: { kind: "cancel-cast" },
            }),
          ).toMatchObject({ status: "rejected", code: "CommandConflict" });
          expect(
            await c.submit(boundary.last.command.actor, {
              ...boundary.last.command,
              commandId: `${boundary.last.command.commandId}:fresh-stale`,
            }),
          ).toMatchObject({ status: "rejected", code: "StaleRevision" });
          expect(c.current()).toEqual(boundary.state);
        }
      }
    }, 180_000);
    test(`${family}/${mode}: original continuation is replayed once and the other legal owned order has the source-derived result`, async () => {
      const value = fixture(family, mode);
      const repo = open();
      const c = await restored(repo, value.boundaries.proposed, value.release);
      for (const stage of ["first-rewrite", "resolved"] as const) {
        const input = value.boundaries[stage].last.command;
        const [a, b] = await Promise.all([
          c.submit(input.actor, input),
          c.submit(input.actor, input),
        ]);
        expect(a.status).toBe("accepted");
        expect(b).toEqual(a);
        expect(c.current()).toEqual(value.boundaries[stage].state);
      }
      expect(await replayMatch(repo, value.release, c.current().manifest.id)).toEqual(c.current());
      const otherRepo = open();
      const other = await restored(otherRepo, value.boundaries.proposed, value.release);
      await respond(other, family, "other-first");
      expect(frame(other.current()).occurrences[0]?.amount).toBe(family === "two-doublers" ? 4 : 1);
      expect(targetCreature(other.current()).damage).toBe(0);
      expect(life(other.current())).toBe(life(value.boundaries.proposed.state));
      await respond(other, family, "other-first");
      expect(targetCreature(other.current()).damage).toBe(family === "two-doublers" ? 8 : 2);
      expect(life(other.current())).toBe(life(value.boundaries.proposed.state) + 2);
      expect(await replayMatch(otherRepo, value.release, other.current().manifest.id)).toEqual(
        other.current(),
      );
      alternativeBranches.set(
        `${family}:${mode}`,
        await exportMatch(otherRepo, value.release, other.current().manifest.id),
      );
    }, 60_000);
  }

for (const family of families)
  for (const stage of ["before-damage", "proposed", "first-rewrite"] as const) {
    test(`${family}/${stage}: each transactional failure preserves the published boundary and retries once`, async () => {
      const value = fixture(family);
      const after = stages[stages.indexOf(stage) + 1];
      if (!after) throw new Error("Missing following stage");
      const input = value.boundaries[after].last.command;
      for (const failure of [
        "INSERT INTO commander_boundaries",
        "UPDATE commander_matches",
        "COMMIT",
      ]) {
        const db = new Database(path(), { strict: true });
        let armed = false;
        const adapter: SqlDatabase = {
          exec(sql, bindings) {
            if (armed && sql.startsWith(failure)) {
              armed = false;
              throw new Error("Injected damage transaction failure");
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
        const c = await restored(repo, value.boundaries[stage], value.release);
        const before = c.current();
        armed = true;
        expect(await c.submit(input.actor, input)).toMatchObject({
          status: "fault",
          code: "PersistenceFailed",
        });
        expect(c.current()).toEqual(before);
        expect(repo.load(before.manifest.id)?.current).toEqual(before);
        expect(repo.findRecord(before.manifest.id, input.commandId)).toBeNull();
        expect(db.query("SELECT count(*) AS count FROM commander_boundaries").get()).toEqual({
          count: before.revision + 1,
        });
        const accepted = await c.submit(input.actor, input);
        expect(accepted.status).toBe("accepted");
        expect(await c.submit(input.actor, input)).toEqual(accepted);
        expect(c.current()).toEqual(value.boundaries[after].state);
      }
    }, 60_000);
  }
for (const family of families) {
  test(`${family}: fresh reuse, wrong affected owner, stale event version and nonreplacement actions reject atomically`, async () => {
    const value = fixture(family),
      boundary = value.boundaries["first-rewrite"],
      repo = open();
    const c = await restored(repo, boundary, value.release),
      before = c.current();
    const actor = c.pendingActor;
    if (!actor) throw new Error("No affected actor");
    const valid = damageStorageCommand(
      c.view(actor),
      await damageStorageResponse(c.view(actor), family),
    );
    if (valid.response.kind !== "damage-replacement") throw new Error("No valid damage response");
    const prior = boundary.last.command.response;
    if (prior.kind !== "damage-replacement") throw new Error("No used replacement");
    const land = c
      .view(actor)
      .objects.find(
        (row) =>
          row.zone === "battlefield" &&
          row.controller === actor &&
          !row.tapped &&
          row.card?.manaAbilities.length,
      );
    const color = land?.card?.manaAbilities[0];
    if (!land || !color)
      throw new Error("No otherwise-usable owned mana source for the workflow contrast");
    expect(c.view(actor).decision?.manaSources).toEqual([]);
    const candidates: GameCommand[] = [
      { ...valid, actor: "A" },
      { ...valid, response: { ...valid.response, eventVersion: 0 } },
      { ...valid, response: { ...valid.response, effectId: prior.effectId } },
      { ...valid, response: { ...valid.response, occurrenceId: "different-occurrence" } },
      { ...valid, response: { ...valid.response, eventId: "different-event" } },
      { ...valid, response: { kind: "pass" } },
      { ...valid, response: { kind: "cancel-cast" } },
      { ...valid, response: { kind: "mana", source: { object: land.id, color } } },
    ];
    for (const [index, input] of candidates.entries()) {
      input.commandId += `:invalid:${index}`;
      expect((await c.submit(input.actor, input)).status).toBe("rejected");
      expect(c.current()).toEqual(before);
      expect(repo.findRecord(before.manifest.id, input.commandId)).toBeNull();
    }
  }, 30_000);
}

for (const family of families)
  test(`${family}: all three resolver modes have identical normalized checkpoint semantics`, () => {
    const project = (state: RulesState) => {
      const result = structuredClone(state);
      const id = result.manifest.id;
      result.manifest.id = "normalized-match";
      result.manifest.resolver = "full-scan";
      delete result.manifest.preparedArtifactHash;
      if (result.decision) result.decision.id = result.decision.id.replace(id, "normalized-match");
      return result;
    };
    for (const stage of stages) {
      const expected = project(fixture(family, "full-scan").boundaries[stage].state);
      for (const mode of modes.slice(1))
        expect(project(fixture(family, mode).boundaries[stage].state)).toEqual(expected);
    }
  });
test("rehashed pending imports reject forged origin, original/current amounts, source/recipient pins, chooser and rewrite/host history", async () => {
  const value = fixture("affected-controller"),
    boundary = value.boundaries["first-rewrite"];
  const mutations: ((s: RulesState, f: PendingDamageFrame) => void)[] = [
    (_, f) => {
      f.version++;
    },
    (_, f) => {
      f.eventId += ":forged";
    },
    (_, f) => {
      f.origin.type = "OtherProposal";
    },
    (_, f) => {
      f.origin.cause += ":forged";
    },
    (_, f) => {
      const o = f.occurrences[0];
      if (o) o.original.amount++;
    },
    (_, f) => {
      const o = f.occurrences[0];
      if (o) o.amount++;
    },
    (_, f) => {
      const o = f.occurrences[0];
      if (o) o.original.affectedPlayer = "A";
    },
    (_, f) => {
      const o = f.occurrences[0];
      if (o) o.original.source.object.generation++;
    },
    (_, f) => {
      const o = f.occurrences[0];
      if (o) o.original.source.sourceVersion = "0".repeat(64);
    },
    (_, f) => {
      const o = f.occurrences[0];
      if (o) o.original.source.isSpell = false;
    },
    (_, f) => {
      const o = f.occurrences[0];
      if (o?.original.recipient.kind === "creature") o.original.recipient.object.generation++;
    },
    (_, f) => {
      const o = f.occurrences[0];
      if (o) o.applied = [];
    },
    (_, f) => {
      const r = f.rewrites[0];
      if (r) r.after++;
    },
    (_, f) => {
      const r = f.rewrites[0];
      if (r) r.prevented = 1;
    },
    (_, f) => {
      const r = f.rewrites[0];
      if (r) r.effect.provider.generation++;
    },
    (_, f) => {
      const r = f.rewrites[0];
      if (r) r.actor = "B";
    },
    (_, f) => {
      f.rewrites = [];
    },
    (_, f) => {
      if (f.host.kind === "spell-instruction") f.host.effectIndex++;
    },
    (_, f) => {
      if (f.host.kind === "spell-instruction") f.host.controller = "B";
    },
    (s) => {
      s.priorityPlayer = "A";
    },
  ];
  for (const mutate of mutations) {
    const envelope = JSON.parse(boundary.logical);
    const state = envelope.payload.current as RulesState;
    const pending = frame(state);
    mutate(state, pending);
    state.frames = [pending];
    envelope.payload.currentHash = await semanticHash(state);
    envelope.checksum = await semanticHash(envelope.payload);
    const repo = open();
    await expect(importMatch(repo, value.release, JSON.stringify(envelope))).rejects.toThrow();
    expect(repo.list()).toEqual([]);
  }
  const broken = JSON.parse(boundary.logical);
  broken.checksum = "0".repeat(64);
  await expect(importMatch(open(), value.release, JSON.stringify(broken))).rejects.toThrow();
}, 180_000);
test("native replay rejects rehashed current-state tampering after the original proposal leaves the latest event batch", async () => {
  const value = fixture("two-doublers"),
    boundary = value.boundaries["first-rewrite"],
    file = path();
  const c = await restored(open(file), boundary, value.release);
  const state = c.current(),
    pending = frame(state);
  expect(state.events.some((row) => row.type === "DamageBatchProposed")).toBe(false);
  const occurrence = pending.occurrences[0];
  if (!occurrence) throw new Error("No occurrence");
  occurrence.amount++;
  state.frames = [pending];
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
  await expect(Coordinator.open(open(file), value.release, state.manifest.id)).rejects.toThrow();
}, 30_000);
