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
  type Response,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  KEYWORD_STORAGE_DRIVER,
  KEYWORD_STORAGE_SEED,
  keywordStorageCard,
  keywordStorageCommand,
  storageKeywordFixture,
  submitKeywordResponse,
} from "../test-fixtures/static-keyword-source";
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
  "before-provider",
  "provider-active",
  "protected-recipient",
  "before-damage",
  "marked-damage",
  "before-return",
  "pending-return",
  "departed",
] as const;
type Stage = (typeof stages)[number];
type Boundary = { state: RulesState; logical: string; last: CommandRecord };
type History = {
  release: ContentRelease;
  file: string;
  execution: ReturnType<Coordinator["executionInfo"]>;
  boundaries: Record<Stage, Boundary>;
  hand: Boundary;
};
const output =
  process.env.KEYWORD_STORAGE_EVIDENCE_DIR ?? mkdtempSync(join(tmpdir(), "keyword-native-proof-"));
mkdirSync(output, { recursive: true });
const histories = new Map<MatchManifest["resolver"], History>();
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) {
    try {
      close();
    } catch {
      /* Owned repository may already be closed. */
    }
  }
});
function temp() {
  const dir = mkdtempSync(join(tmpdir(), "keyword-storage-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "matches.sqlite");
}
function open(file = temp()) {
  const r = openNativeRepository(file);
  cleanup.push(() => r.close());
  return r;
}
function required<T>(x: T | undefined | null, message: string): T {
  if (x === undefined || x === null) throw new Error(message);
  return x;
}
function history(mode: MatchManifest["resolver"] = "prepared-indexed") {
  return required(histories.get(mode), "Missing ordinary keyword history");
}
function owned(state: RulesState, name: string, actor = "A") {
  return required(
    Object.values(state.objects).find(
      (x) => x.owner === actor && x.definition === keywordStorageCard(name).id,
    ),
    `Missing${actor}/${name}`,
  );
}
function frame(state: RulesState) {
  const f = state.frames.at(-1);
  if (f?.kind !== "resolving-spell") throw new Error("Missing Hivelord return continuation");
  return f;
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
    last: required(repo.load(state.manifest.id)?.records.at(-1), "Missing boundary receipt"),
  };
}
function stage(state: RulesState, release: ContentRelease): Stage | null {
  if (state.decision?.kind === "starting-player") return null;
  const p = owned(state, "Sliver Hivelord"),
    t = owned(state, "Metallic Sliver"),
    top = state.stack.at(-1);
  const name =
    top?.kind === "spell"
      ? release.definitions[
          required(state.objects[top.objectId], "Missing actual stacked card").definition
        ]?.name
      : undefined;
  const nextResolves = state.decision?.kind === "priority" && state.consecutivePasses === 1;
  if (name === "Sliver Hivelord" && nextResolves) return "before-provider";
  if (name === "Sorin's Thirst" && nextResolves) return "before-damage";
  if (name === "Repulse" && nextResolves) return "before-return";
  if (state.decision?.kind === "commander-replacement") return "pending-return";
  if (p.zone === "battlefield" && t.zone === "battlefield" && t.damage === 2)
    return "marked-damage";
  if (p.zone === "battlefield" && t.zone === "battlefield") return "protected-recipient";
  if (p.zone === "battlefield") return "provider-active";
  return t.zone === "graveyard" ? "departed" : null;
}
beforeAll(async () => {
  for (const mode of modes) {
    const source = await storageKeywordFixture(`ordinary-keyword:${mode}`, mode);
    await Bun.write(join(output, "source-release.json"), canonicalJson(source.release));
    const file = join(output, `${mode}.sqlite`),
      repo = openNativeRepository(file);
    const c = await Coordinator.create(repo, source.release, source.manifest, source.artifact);
    const boundaries: Partial<Record<Stage, Boundary>> = {};
    try {
      for (let n = 0; n < 1000; n++) {
        const name = stage(c.current(), source.release);
        if (name && !boundaries[name]) boundaries[name] = await retain(repo, c, source.release);
        if (name === "departed") break;
        await submitKeywordResponse(c);
      }
      for (const name of stages) required(boundaries[name], `Ordinary history missed${name}`);
      const all = boundaries as Record<Stage, Boundary>;
      const branchRepo = openNativeRepository(join(output, `${mode}-hand.sqlite`));
      let hand: Boundary;
      try {
        await importMatch(branchRepo, source.release, all["pending-return"].logical);
        const branch = await Coordinator.open(branchRepo, source.release, source.manifest.id);
        await submitKeywordResponse(branch, { kind: "commander-replacement", move: false });
        hand = await retain(branchRepo, branch, source.release);
        await branch.close();
      } finally {
        branchRepo.close();
      }
      histories.set(mode, {
        release: source.release,
        file,
        execution: c.executionInfo(),
        boundaries: all,
        hand,
      });
    } finally {
      await c.close();
    }
  }
}, 120_000);
afterAll(async () => {
  const cases = [],
    reports = [];
  const projectPath = (file: string) => relative(process.cwd(), file).split("\\").join("/");
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
        provider: owned(b.state, "Sliver Hivelord"),
        recipient: owned(b.state, "Metallic Sliver"),
        decision: b.state.decision,
        frames: b.state.frames,
        events: b.state.events,
        lastCommand: b.last.command,
        lastReceipt: b.last.receipt,
      });
    }
    await Bun.write(join(output, `${mode}-departed-hand.json`), h.hand.logical);
    const shared = stages
      .filter((n) => n !== "departed")
      .map((name) => ({ name, save: projectPath(join(output, `${mode}-${name}.json`)) }));
    for (const destination of ["command", "hand"] as const) {
      const final =
        destination === "command" ? `${mode}-departed.json` : `${mode}-departed-hand.json`;
      cases.push({
        name: `${mode}-${destination}`,
        finalSave: projectPath(join(output, final)),
        checkpoints: [
          ...shared,
          { name: `departed-${destination}`, save: projectPath(join(output, final)) },
        ],
      });
    }
    reports.push({
      mode,
      execution: h.execution,
      manifest: h.boundaries["before-provider"].state.manifest,
      points,
      handBranch: {
        file: `${mode}-departed-hand.json`,
        revision: h.hand.state.revision,
        stateHash: await semanticHash(h.hand.state),
        events: h.hand.state.events,
      },
      completedGame: false,
      outcome: h.boundaries.departed.state.outcome,
    });
  }
  await Bun.write(
    join(output, "report.json"),
    `${JSON.stringify(
      {
        schema: "native-static-keyword-durability/1",
        driver: KEYWORD_STORAGE_DRIVER,
        driverSeed: 1,
        seed: KEYWORD_STORAGE_SEED,
        parentReleaseHash: "dbecdf4f6b9440e17b291af1784b9994a0d78b7eea5fe426251e769443c7ffb4",
        fixtureDefinitions: 9,
        auxiliaryTemplates: 0,
        scope:
          "One ordinary legal two-seat deck/game-seed family across three actual resolver factories, stopped after real protected Sorin damage and Repulse commander replacement, with two final owner choices from the same pending prefix. No gameplay-state edits, completed game or browser claim. Privileged seed/stage qualification is separate from observation-only policy.",
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
function assertView(c: Coordinator, protectedCreature: boolean, damage = 0) {
  for (const actor of ["A", "B"]) {
    const view = c.view(actor),
      t = required(
        view.objects.find((x) => x.card?.name === "Metallic Sliver"),
        "Missing visible Metallic",
      );
    expect(t.characteristics).toEqual({
      power: 1,
      toughness: 1,
      keywords: protectedCreature ? ["indestructible"] : [],
    });
    expect(t.card?.keywords).toEqual([]);
    expect(t.damage).toBe(damage);
    expect(
      view.objects
        .filter((x) => x.zone === "hand" && x.owner !== actor)
        .every((x) => x.card === null),
    ).toBe(true);
  }
  expect(c.current().continuousEffects).toEqual([]);
  expect(
    c
      .current()
      .players.map(
        (p) =>
          Object.values(c.current().objects).filter((x) => x.owner === p.id && !x.token).length,
      ),
  ).toEqual([100, 100]);
}
function assertPending(state: RulesState) {
  const f = frame(state);
  expect(state.priorityPlayer).toBeNull();
  expect(state.decision).toMatchObject({ kind: "commander-replacement", actor: "A" });
  expect(f.controller).toBe("B");
  expect(f.source).toMatchObject({ owner: "B", controller: "B", zone: "stack" });
  expect(f.pendingMovement.before).toEqual(owned(state, "Sliver Hivelord"));
  expect(f.target).toBe(f.pendingMovement.before.id);
  expect(f.program.effects.map((x) => x.kind)).toEqual(["return-to-hand", "draw"]);
  expect(state.events.some((x) => x.type === "CardDrawn")).toBe(false);
  expect(owned(state, "Metallic Sliver")).toMatchObject({ zone: "battlefield", damage: 2 });
}
function assertDeparture(before: RulesState, after: RulesState, toCommand: boolean) {
  const f = frame(before),
    p = owned(after, "Sliver Hivelord"),
    t = owned(after, "Metallic Sliver");
  expect(p).toMatchObject({
    lineage: f.pendingMovement.before.lineage,
    generation: f.pendingMovement.before.generation + 1,
    zone: toCommand ? "command" : "hand",
  });
  expect(after.objects[f.target]).toBeUndefined();
  expect(t.zone).toBe("graveyard");
  expect(t.generation).toBe(owned(before, "Metallic Sliver").generation + 1);
  expect(after.frames).toEqual([]);
  expect(after.decision?.kind).toBe("priority");
  expect(after.players.find((x) => x.id === "B")?.library.length).toBe(
    required(
      before.players.find((x) => x.id === "B"),
      "Missing B",
    ).library.length - 1,
  );
  const events = after.events;
  const at = (type: string) =>
    required(
      events.find((x) => x.type === type),
      `Missing${type}`,
    ).index;
  const movement = required(
    events.find(
      (x) => x.type === "ObjectMoved" && GameObject.safeParse(x.data.before).data?.id === f.target,
    ),
    "No commander movement",
  );
  const sourceGrave = required(
    events.find(
      (x) =>
        x.type === "ObjectMoved" && GameObject.safeParse(x.data.before).data?.id === f.source.id,
    ),
    "No source grave",
  );
  expect(GameObject.parse(movement.data.after)).toEqual(p);
  expect(movement.index).toBeLessThan(at("ReturnInstructionCompleted"));
  expect(at("ReturnInstructionCompleted")).toBeLessThan(at("CardDrawn"));
  expect(at("CardDrawn")).toBeLessThan(sourceGrave.index);
  expect(sourceGrave.index).toBeLessThan(at("SpellResolved"));
  expect(at("SpellResolved")).toBeLessThan(at("CreaturesDiedBatch"));
  expect(events.filter((x) => x.type === "CardDrawn")).toHaveLength(1);
  expect(events.filter((x) => x.type === "SpellResolved")).toHaveLength(1);
  expect(after.coverage["rule:704.5g"]).toBe(1);
  expect(after.outcome.kind).toBe("ongoing");
}
for (const mode of modes) {
  test(`${mode}: ordinary authenticated Hivelord damage and return continuation have exact native stage semantics`, async () => {
    const h = history(mode),
      b = h.boundaries;
    expect(Object.keys(h.release.definitions)).toHaveLength(9);
    expect(h.execution.definitionCount).toBe(9);
    expect(h.execution.tokenTemplateCount).toBe(0);
    expect(stages.map((s) => b[s].state.revision)).toEqual([
      333, 334, 338, 343, 344, 349, 350, 351,
    ]);
    expect(owned(b["before-provider"].state, "Sliver Hivelord").zone).toBe("stack");
    const r = await restored(open(), b["marked-damage"], h.release);
    assertView(r, true, 2);
    expect(b["marked-damage"].state.players.find((x) => x.id === "B")?.life).toBe(42);
    expect(owned(b["marked-damage"].state, "Sorin's Thirst", "B").zone).toBe("graveyard");
    assertPending(b["pending-return"].state);
    assertDeparture(b["pending-return"].state, b.departed.state, true);
    assertDeparture(b["pending-return"].state, h.hand.state, false);
  }, 30_000);
  test(`${mode}: every real checkpoint survives native reopen, logical import, replay and exact prior-command retries`, async () => {
    const h = history(mode);
    for (const b of [...stages.map((s) => h.boundaries[s]), h.hand]) {
      const file = temp();
      const first = await restored(open(file), b, h.release);
      const view = first.view("B");
      await first.close();
      const repo = open(file),
        reopened = await Coordinator.open(repo, h.release, b.state.manifest.id),
        imported = await restored(open(), b, h.release);
      expect(reopened.view("B")).toEqual(view);
      expect(imported.view("B")).toEqual(view);
      const accepted = { status: "accepted" as const, receipt: b.last.receipt };
      expect(await reopened.submit(b.last.command.actor, b.last.command)).toEqual(accepted);
      expect(await imported.submit(b.last.command.actor, b.last.command)).toEqual(accepted);
      expect(reopened.current()).toEqual(b.state);
      expect(imported.current()).toEqual(b.state);
      expect(await replayMatch(repo, h.release, b.state.manifest.id)).toEqual(b.state);
      expect(repo.load(b.state.manifest.id)?.records).toHaveLength(b.state.revision);
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
  }, 180_000);
  for (const toCommand of [true, false])
    test(`${mode}: persisted owner choice ${toCommand ? "command" : "hand"} rejects wrong actor and duplicate submit commits once`, async () => {
      const h = history(mode),
        b = h.boundaries["pending-return"],
        repo = open(),
        c = await restored(repo, b, h.release);
      assertView(c, true, 2);
      expect(c.view("A").decision?.kind).toBe("commander-replacement");
      expect(c.view("B").decision).toBeNull();
      const input = keywordStorageCommand(b.state, {
        kind: "commander-replacement",
        move: toCommand,
      });
      expect(await c.submit("B", input)).toMatchObject({
        status: "rejected",
        code: "ActorMismatch",
      });
      expect(c.current()).toEqual(b.state);
      const [a, duplicate] = await Promise.all([c.submit("A", input), c.submit("A", input)]);
      expect(a.status).toBe("accepted");
      expect(duplicate).toEqual(a);
      const expected = toCommand ? h.boundaries.departed : h.hand;
      expect(c.current()).toEqual(expected.state);
      assertDeparture(b.state, c.current(), toCommand);
      const after = await retain(repo, c, h.release),
        other = await restored(open(), after, h.release);
      expect(await other.submit("A", input)).toEqual(a);
      expect(other.current()).toEqual(expected.state);
    }, 30_000);
}
const operations: { before: Stage; after: Stage; response: Response }[] = [
  { before: "before-provider", after: "provider-active", response: { kind: "pass" } },
  { before: "before-damage", after: "marked-damage", response: { kind: "pass" } },
  { before: "before-return", after: "pending-return", response: { kind: "pass" } },
  {
    before: "pending-return",
    after: "departed",
    response: { kind: "commander-replacement", move: true },
  },
];
for (const op of operations)
  for (const failure of ["INSERT INTO commander_boundaries", "UPDATE commander_matches", "COMMIT"])
    test(`${op.before}: ${failure} fault rolls back exact damage/grant/continuation state and accepts retry once`, async () => {
      const h = history(),
        b = h.boundaries[op.before],
        expected = h.boundaries[op.after],
        db = new Database(temp(), { strict: true });
      let armed = false;
      const adapter: SqlDatabase = {
        exec(sql, bindings) {
          if (armed && sql.startsWith(failure)) {
            armed = false;
            throw new Error("Injected keyword persistence fault");
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
        view = c.view("B"),
        input = keywordStorageCommand(b.state, op.response);
      armed = true;
      expect(await c.submit(input.actor, input)).toMatchObject({
        status: "fault",
        code: "PersistenceFailed",
      });
      expect(c.current()).toEqual(b.state);
      expect(c.view("B")).toEqual(view);
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
    }, 30_000);
test("rehashed logical grant/damage/commander snapshots cannot fabricate a current source or resolution history", async () => {
  const h = history();
  const mutants: { stage: Stage; change: (s: RulesState) => void }[] = [
    {
      stage: "marked-damage",
      change: (s) => {
        owned(s, "Sliver Hivelord").controller = "B";
      },
    },
    {
      stage: "marked-damage",
      change: (s) => {
        owned(s, "Sliver Hivelord").generation++;
      },
    },
    {
      stage: "marked-damage",
      change: (s) => {
        owned(s, "Metallic Sliver").damage = 0;
      },
    },
    {
      stage: "marked-damage",
      change: (s) => {
        owned(s, "Metallic Sliver").deathtouchDamage = true;
      },
    },
    {
      stage: "pending-return",
      change: (s) => {
        frame(s).controller = "A";
      },
    },
    {
      stage: "pending-return",
      change: (s) => {
        frame(s).pendingMovement.before.controller = "B";
      },
    },
    {
      stage: "pending-return",
      change: (s) => {
        frame(s).pendingMovement.before.generation++;
      },
    },
    {
      stage: "pending-return",
      change: (s) => {
        frame(s).program.effects.pop();
      },
    },
    {
      stage: "pending-return",
      change: (s) => {
        frame(s).effectIndex = 1;
      },
    },
  ];
  for (const m of mutants) {
    const envelope = JSON.parse(h.boundaries[m.stage].logical);
    m.change(envelope.payload.current);
    envelope.payload.currentHash = await semanticHash(envelope.payload.current);
    envelope.checksum = await semanticHash(envelope.payload);
    const repo = open();
    await expect(importMatch(repo, h.release, JSON.stringify(envelope))).rejects.toThrow();
    expect(repo.list()).toEqual([]);
  }
}, 120_000);
test("rehashed native protected-damage checkpoint fails real replay instead of trusting its changed state hash", async () => {
  const h = history(),
    b = h.boundaries["marked-damage"],
    file = temp(),
    c = await restored(open(file), b, h.release),
    state = c.current();
  owned(state, "Metallic Sliver").damage = 0;
  await c.close();
  const db = new Database(file);
  try {
    db.run("UPDATE commander_matches SET current_json=?,current_hash=? WHERE match_id=?", [
      canonicalJson(state),
      await semanticHash(state),
      state.manifest.id,
    ]);
  } finally {
    db.close();
  }
  await expect(Coordinator.open(open(file), h.release, state.manifest.id)).rejects.toThrow();
}, 30_000);
