import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  reachStaticResolution,
  STATIC_STORAGE_DRIVER,
  STATIC_STORAGE_SEED,
  staticStorageCard,
  staticStorageCommand,
  storageStaticFixture,
  submitStaticResponse,
} from "../test-fixtures/static-bonus-source";
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

const modes = ["full-scan", "prepared-scan", "prepared-indexed"] as const;
type Stage = "beforeEntry" | "afterEntry" | "beforeReturn" | "pendingReturn" | "departed";
type Boundary = { state: RulesState; logical: string };
type Fixture = {
  release: ContentRelease;
  file: string;
  boundaries: Record<Stage, Boundary>;
  execution: ReturnType<Coordinator["executionInfo"]>;
};
const fixtures = new Map<MatchManifest["resolver"], Fixture>();
const cleanup: (() => void)[] = [];
const fixtureDirectory = mkdtempSync(join(tmpdir(), "commander-static-fixtures-"));
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) {
    try {
      close();
    } catch {
      // A coordinator may already have closed its owned database.
    }
  }
});
function path() {
  const dir = mkdtempSync(join(tmpdir(), "commander-static-storage-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "matches.sqlite");
}
function open(file = path()) {
  const repo = openNativeRepository(file);
  cleanup.push(() => repo.close());
  return repo;
}
function fixture(mode: MatchManifest["resolver"] = "prepared-indexed") {
  const result = fixtures.get(mode);
  if (!result) throw new Error(`Missing ${mode} static durability fixture`);
  return result;
}
function frame(state: RulesState) {
  const value = state.frames.at(-1);
  if (value?.kind !== "resolving-spell") throw new Error("Missing pending Arvad return context");
  return value;
}
function owned(state: RulesState, name: string, actor = "A") {
  const card = Object.values(state.objects).find(
    (row) => row.definition === staticStorageCard(name).id && row.owner === actor,
  );
  if (!card) throw new Error(`Missing ordinary object ${actor}/${name}`);
  return card;
}
function assertView(coordinator: Coordinator, active: boolean) {
  for (const actor of ["A", "B"]) {
    const view = coordinator.view(actor);
    const dependent = view.objects.find((row) => row.card?.name === "Isamaru, Hound of Konda");
    expect(dependent?.characteristics).toEqual({
      power: active ? 4 : 2,
      toughness: active ? 4 : 2,
      keywords: [],
    });
    expect(dependent?.card?.power).toBe(2);
    expect(dependent?.card?.toughness).toBe(2);
    expect(
      view.objects
        .filter((row) => row.zone === "hand" && row.owner !== actor)
        .every((row) => row.card === null),
    ).toBe(true);
  }
  expect(coordinator.current().continuousEffects).toEqual([]);
  expect(
    coordinator
      .current()
      .players.map(
        (seat) =>
          Object.values(coordinator.current().objects).filter((row) => row.owner === seat.id)
            .length,
      ),
  ).toEqual([100, 100]);
}
async function snapshot(repo: Repository, coordinator: Coordinator, release: ContentRelease) {
  const state = coordinator.current();
  return { state, logical: await exportMatch(repo, release, state.manifest.id) };
}
beforeAll(async () => {
  for (const mode of modes) {
    const source = await storageStaticFixture(`ordinary-static-durability:${mode}`, mode);
    const file = join(fixtureDirectory, `${mode}.sqlite`);
    const repo = openNativeRepository(file);
    const coordinator = await Coordinator.create(
      repo,
      source.release,
      source.manifest,
      source.artifact,
    );
    try {
      await reachStaticResolution(coordinator, "Arvad the Cursed", 400);
      assertView(coordinator, false);
      const beforeEntry = await snapshot(repo, coordinator, source.release);
      await submitStaticResponse(coordinator, { kind: "pass" });
      assertView(coordinator, true);
      const afterEntry = await snapshot(repo, coordinator, source.release);
      await reachStaticResolution(coordinator, "Repulse", 400);
      assertView(coordinator, true);
      const beforeReturn = await snapshot(repo, coordinator, source.release);
      await submitStaticResponse(coordinator, { kind: "pass" });
      expect(coordinator.current().decision?.kind).toBe("commander-replacement");
      assertView(coordinator, true);
      const pendingReturn = await snapshot(repo, coordinator, source.release);
      await submitStaticResponse(coordinator, { kind: "commander-replacement", move: true });
      assertView(coordinator, false);
      const departed = await snapshot(repo, coordinator, source.release);
      fixtures.set(mode, {
        release: source.release,
        file,
        boundaries: { beforeEntry, afterEntry, beforeReturn, pendingReturn, departed },
        execution: coordinator.executionInfo(),
      });
    } finally {
      await coordinator.close();
    }
  }
}, 30_000);

afterAll(async () => {
  try {
    const destination = process.env.STATIC_STORAGE_EVIDENCE_DIR;
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
          source: owned(boundary.state, "Arvad the Cursed"),
          dependent: owned(boundary.state, "Isamaru, Hound of Konda"),
        });
      }
      histories.push({ mode, execution: value.execution, boundaries });
    }
    await Bun.write(
      join(destination, "report.json"),
      `${JSON.stringify(
        {
          schema: "native-static-durability/1",
          scope:
            "Ordinary legal two-seat source-bound accepted commands stopped after Arvad departure; no constructed state, completed-game, browser or OPFS claim.",
          driver: STATIC_STORAGE_DRIVER,
          seed: STATIC_STORAGE_SEED,
          histories,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});
async function restored(repo: Repository, boundary: Boundary, release: ContentRelease) {
  expect(await importMatch(repo, release, boundary.logical)).toEqual(boundary.state);
  return Coordinator.open(repo, release, boundary.state.manifest.id);
}
function assertPending(state: RulesState) {
  const context = frame(state);
  expect(state.priorityPlayer).toBeNull();
  expect(state.decision).toMatchObject({ kind: "commander-replacement", actor: "A" });
  expect(context.controller).toBe("B");
  expect(context.source).toMatchObject({ owner: "B", controller: "B", zone: "stack" });
  expect(context.pendingMovement.before).toEqual(owned(state, "Arvad the Cursed"));
  expect(context.pendingMovement.before.zone).toBe("battlefield");
  expect(context.target).toBe(context.pendingMovement.before.id);
  expect(context.program.effects.map((effect) => effect.kind)).toEqual(["return-to-hand", "draw"]);
  expect(state.events.filter((event) => event.type === "CardDrawn")).toEqual([]);
}
function assertDeparture(before: RulesState, after: RulesState, move: boolean) {
  const context = frame(before);
  const afterSource = owned(after, "Arvad the Cursed");
  expect(afterSource).toMatchObject({
    lineage: context.pendingMovement.before.lineage,
    generation: context.pendingMovement.before.generation + 1,
    zone: move ? "command" : "hand",
    owner: "A",
  });
  expect(after.objects[context.target]).toBeUndefined();
  expect(after.frames).toEqual([]);
  expect(after.decision?.kind).toBe("priority");
  expect(after.players.find((seat) => seat.id === "B")?.library.length).toBe(
    (before.players.find((seat) => seat.id === "B")?.library.length ?? 0) - 1,
  );
  const movement = after.events.find(
    (event) =>
      event.type === "ObjectMoved" &&
      GameObject.safeParse(event.data.before).data?.id === context.target,
  );
  const returned = after.events.find((event) => event.type === "ReturnInstructionCompleted");
  const draw = after.events.find((event) => event.type === "CardDrawn");
  const sourceGrave = after.events.find(
    (event) =>
      event.type === "ObjectMoved" &&
      GameObject.safeParse(event.data.before).data?.id === context.source.id,
  );
  const resolved = after.events.find((event) => event.type === "SpellResolved");
  expect(movement).toBeDefined();
  expect(GameObject.parse(movement?.data.after)).toEqual(afterSource);
  expect(movement?.index).toBeLessThan(returned?.index ?? -1);
  expect(returned?.index).toBeLessThan(draw?.index ?? -1);
  expect(draw?.index).toBeLessThan(sourceGrave?.index ?? -1);
  expect(sourceGrave?.index).toBeLessThan(resolved?.index ?? -1);
  expect(after.events.filter((event) => event.type === "CardDrawn")).toHaveLength(1);
  expect(after.events.filter((event) => event.type === "SpellResolved")).toHaveLength(1);
}
const steps: { before: Stage; after: Stage; response: Response; active: boolean }[] = [
  { before: "beforeEntry", after: "afterEntry", response: { kind: "pass" }, active: true },
  { before: "beforeReturn", after: "pendingReturn", response: { kind: "pass" }, active: true },
  {
    before: "pendingReturn",
    after: "departed",
    response: { kind: "commander-replacement", move: true },
    active: false,
  },
];

for (const mode of modes) {
  test(`${mode}: ordinary static entry and commander departure survive reopen, every-stage import, replay and exact retries`, async () => {
    const { release, boundaries } = fixture(mode);
    assertPending(boundaries.pendingReturn.state);
    assertDeparture(boundaries.pendingReturn.state, boundaries.departed.state, true);
    for (const step of steps) {
      const before = boundaries[step.before],
        after = boundaries[step.after];
      const file = path();
      const first = await restored(open(file), before, release);
      const beforeView = first.view("B");
      await first.close();
      const repo = open(file);
      const reopened = await Coordinator.open(repo, release, before.state.manifest.id);
      const imported = await restored(open(), before, release);
      expect(reopened.view("B")).toEqual(beforeView);
      const input = staticStorageCommand(before.state, step.response);
      const [accepted, duplicate, sameImport] = await Promise.all([
        reopened.submit(input.actor, input),
        reopened.submit(input.actor, input),
        imported.submit(input.actor, input),
      ]);
      expect(accepted.status).toBe("accepted");
      expect(duplicate).toEqual(accepted);
      expect(sameImport).toEqual(accepted);
      expect(reopened.current()).toEqual(after.state);
      expect(imported.current()).toEqual(after.state);
      assertView(reopened, step.active);
      expect(await replayMatch(repo, release, before.state.manifest.id)).toEqual(after.state);
      expect(repo.load(before.state.manifest.id)?.records).toHaveLength(after.state.revision);
      expect(
        await reopened.submit(input.actor, { ...input, response: { kind: "cancel-cast" } }),
      ).toMatchObject({ status: "rejected", code: "CommandConflict" });
      expect(
        await reopened.submit(input.actor, { ...input, commandId: `${input.commandId}:stale` }),
      ).toMatchObject({ status: "rejected", code: "StaleRevision" });
      expect(reopened.current()).toEqual(after.state);
      await reopened.close();
      const last = await Coordinator.open(open(file), release, before.state.manifest.id);
      expect(await last.submit(input.actor, input)).toEqual(accepted);
      const lastImport = await restored(open(), after, release);
      expect(await lastImport.submit(input.actor, input)).toEqual(accepted);
      expect(lastImport.current()).toEqual(after.state);
      assertView(lastImport, step.active);
    }
  }, 30_000);

  test(`${mode}: declining the durable commander replacement stops the bonus at actual hand movement`, async () => {
    const { release, boundaries } = fixture(mode);
    const repo = open();
    const coordinator = await restored(repo, boundaries.pendingReturn, release);
    assertView(coordinator, true);
    expect(coordinator.view("A").decision?.kind).toBe("commander-replacement");
    expect(coordinator.view("B").decision).toBeNull();
    const input = staticStorageCommand(coordinator.current(), {
      kind: "commander-replacement",
      move: false,
    });
    expect(await coordinator.submit("B", input)).toMatchObject({
      status: "rejected",
      code: "ActorMismatch",
    });
    expect(coordinator.current()).toEqual(boundaries.pendingReturn.state);
    const accepted = await coordinator.submit(input.actor, input);
    expect(accepted.status).toBe("accepted");
    assertDeparture(boundaries.pendingReturn.state, coordinator.current(), false);
    assertView(coordinator, false);
    const after = await snapshot(repo, coordinator, release);
    const imported = await restored(open(), after, release);
    expect(await imported.submit(input.actor, input)).toEqual(accepted);
    expect(imported.current()).toEqual(after.state);
    assertView(imported, false);
    expect(await replayMatch(repo, release, after.state.manifest.id)).toEqual(after.state);
  }, 20_000);
}

for (const step of steps)
  for (const failure of ["INSERT INTO commander_boundaries", "UPDATE commander_matches", "COMMIT"])
    test(`${step.before}: failure at ${failure} publishes no partial static state or continuation and retries once`, async () => {
      const { release, boundaries } = fixture();
      const before = boundaries[step.before],
        after = boundaries[step.after];
      const db = new Database(path(), { strict: true });
      let armed = false;
      const adapter: SqlDatabase = {
        exec(sql, bindings) {
          if (armed && sql.startsWith(failure)) {
            armed = false;
            throw new Error("Injected static persistence failure");
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
      const coordinator = await restored(repo, before, release);
      const observed = coordinator.view("B");
      const input = staticStorageCommand(before.state, step.response);
      armed = true;
      expect(await coordinator.submit(input.actor, input)).toMatchObject({
        status: "fault",
        code: "PersistenceFailed",
      });
      expect(coordinator.current()).toEqual(before.state);
      expect(coordinator.view("B")).toEqual(observed);
      expect(repo.load(before.state.manifest.id)?.current).toEqual(before.state);
      expect(repo.findRecord(before.state.manifest.id, input.commandId)).toBeNull();
      expect(db.query("SELECT count(*) AS count FROM commander_boundaries").get()).toEqual({
        count: before.state.revision + 1,
      });
      const accepted = await coordinator.submit(input.actor, input);
      expect(accepted.status).toBe("accepted");
      expect(await coordinator.submit(input.actor, input)).toEqual(accepted);
      expect(coordinator.current()).toEqual(after.state);
      assertView(coordinator, step.active);
      expect(await replayMatch(repo, release, before.state.manifest.id)).toEqual(after.state);
    });

test("rehashed active and suspended snapshots cannot forge current controller, source incarnation or printed static definition", async () => {
  const { release, boundaries } = fixture();
  const mutations: { stage: Stage; change: (state: RulesState) => void }[] = [
    {
      stage: "afterEntry",
      change: (state) => {
        owned(state, "Arvad the Cursed").controller = "B";
      },
    },
    {
      stage: "afterEntry",
      change: (state) => {
        owned(state, "Arvad the Cursed").definition =
          staticStorageCard("Isamaru, Hound of Konda").id;
      },
    },
    {
      stage: "afterEntry",
      change: (state) => {
        owned(state, "Arvad the Cursed").generation++;
      },
    },
    {
      stage: "pendingReturn",
      change: (state) => {
        frame(state).controller = "A";
      },
    },
    {
      stage: "pendingReturn",
      change: (state) => {
        frame(state).pendingMovement.before.controller = "B";
      },
    },
    {
      stage: "pendingReturn",
      change: (state) => {
        frame(state).pendingMovement.before.generation++;
      },
    },
    {
      stage: "pendingReturn",
      change: (state) => {
        frame(state).program.effects.pop();
      },
    },
    {
      stage: "pendingReturn",
      change: (state) => {
        frame(state).effectIndex = 1;
      },
    },
  ];
  for (const mutation of mutations) {
    const envelope = JSON.parse(boundaries[mutation.stage].logical);
    mutation.change(envelope.payload.current);
    envelope.payload.currentHash = await semanticHash(envelope.payload.current);
    envelope.checksum = await semanticHash(envelope.payload);
    const repo = open();
    await expect(importMatch(repo, release, JSON.stringify(envelope))).rejects.toThrow();
    expect(repo.list()).toEqual([]);
  }
}, 20_000);

test("rehashing an active native checkpoint cannot preserve a fabricated static controller across replay", async () => {
  const { release, boundaries } = fixture();
  const file = path();
  const coordinator = await restored(open(file), boundaries.afterEntry, release);
  const state = coordinator.current();
  owned(state, "Arvad the Cursed").controller = "B";
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
  await expect(Coordinator.open(repo, release, state.manifest.id)).rejects.toThrow();
  expect(repo.load(state.manifest.id)?.current).toEqual(state);
});
