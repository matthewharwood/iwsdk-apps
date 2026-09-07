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
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  reachTokenResolution,
  storageTokenFixture,
  TOKEN_STORAGE_DRIVER,
  tokenStorageCommand,
} from "../test-fixtures/token-source";
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
const fixtureDirectory = mkdtempSync(join(tmpdir(), "commander-token-fixtures-"));
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) {
    try {
      close();
    } catch {
      // The test may have already closed a coordinator's owned database connection.
    }
  }
});
function path(): string {
  const directory = mkdtempSync(join(tmpdir(), "commander-token-storage-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "matches.sqlite");
}
function open(file = path()): Repository {
  const repo = openNativeRepository(file);
  cleanup.push(() => repo.close());
  return repo;
}
const modes = ["full-scan", "prepared-scan", "prepared-indexed"] as const;
type BoundaryName = "beforeCreation" | "created" | "beforeDeparture" | "departed";
type Boundary = { state: RulesState; logical: string };
type Fixture = {
  release: ContentRelease;
  file: string;
  boundaries: Record<BoundaryName, Boundary>;
  execution: ReturnType<Coordinator["executionInfo"]>;
};
const fixtures = new Map<MatchManifest["resolver"], Fixture>();
function fixture(mode: MatchManifest["resolver"] = "prepared-indexed"): Fixture {
  const value = fixtures.get(mode);
  if (!value) throw new Error(`Missing retained ${mode} fixture`);
  return value;
}
function tokens(state: RulesState) {
  return Object.values(state.objects).filter((object) => object.token);
}
function physicalCounts(state: RulesState) {
  return state.players.map(
    (seat) =>
      Object.values(state.objects).filter((object) => object.owner === seat.id && !object.token)
        .length,
  );
}
async function snapshot(repo: Repository, coordinator: Coordinator, release: ContentRelease) {
  const state = coordinator.current();
  return { state, logical: await exportMatch(repo, release, state.manifest.id) };
}
async function resolve(coordinator: Coordinator) {
  const input = tokenStorageCommand(coordinator.current(), { kind: "pass" });
  const result = await coordinator.submit(input.actor, input);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return { input, result };
}

beforeAll(async () => {
  for (const mode of modes) {
    const source = await storageTokenFixture(`ordinary-token-durability:${mode}`, mode);
    const file = join(fixtureDirectory, `${mode}.sqlite`);
    const repo = openNativeRepository(file);
    const coordinator = await Coordinator.create(
      repo,
      source.release,
      source.manifest,
      source.artifact,
    );
    try {
      // Seed14 is the first qualifying initial deal in the retained bounded 1..4000
      // search (14 actual initial deals inspected). Every subsequent action is ordinary.
      await reachTokenResolution(coordinator, "Raise the Alarm", 300);
      const beforeCreation = await snapshot(repo, coordinator, source.release);
      await resolve(coordinator);
      const created = await snapshot(repo, coordinator, source.release);
      await reachTokenResolution(coordinator, "Repulse", 300);
      const beforeDeparture = await snapshot(repo, coordinator, source.release);
      await resolve(coordinator);
      const departed = await snapshot(repo, coordinator, source.release);
      fixtures.set(mode, {
        release: source.release,
        file,
        boundaries: { beforeCreation, created, beforeDeparture, departed },
        execution: coordinator.executionInfo(),
      });
    } finally {
      await coordinator.close();
    }
  }
}, 30_000);

afterAll(async () => {
  try {
    const destination = process.env.TOKEN_STORAGE_EVIDENCE_DIR;
    if (!destination) return;
    mkdirSync(destination, { recursive: true });
    const histories = [];
    for (const [mode, record] of fixtures) {
      copyFileSync(record.file, join(destination, `${mode}.sqlite`));
      const boundaries = [];
      for (const [name, boundary] of Object.entries(record.boundaries)) {
        const file = `${mode}-${name}.json`;
        await Bun.write(join(destination, file), boundary.logical);
        boundaries.push({
          name,
          file,
          revision: boundary.state.revision,
          stateHash: await semanticHash(boundary.state),
          tokenIds: tokens(boundary.state).map((token) => token.id),
          physicalCounts: physicalCounts(boundary.state),
        });
      }
      histories.push({ mode, execution: record.execution, boundaries });
    }
    await Bun.write(
      join(destination, "report.json"),
      `${JSON.stringify(
        {
          schema: "native-token-durability/1",
          scope:
            "Ordinary legal source-bound command histories stopped after token departure; no constructed state, completed-game count, browser or OPFS claim.",
          driver: TOKEN_STORAGE_DRIVER,
          seed: 14,
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
function assertCreation(state: RulesState) {
  const created = state.events.find((event) => event.type === "TokensCreated");
  expect(created).toBeDefined();
  expect(created?.data.count).toBe(2);
  const objects = created?.data.objects;
  if (!Array.isArray(objects)) throw new Error("Token creation lacks its recorded batch");
  const parsed = objects.map((value) => GameObject.parse(value));
  expect(new Set(parsed.map((token) => token.id)).size).toBe(2);
  expect(tokens(state)).toHaveLength(2);
  expect(physicalCounts(state)).toEqual([100, 100]);
  for (const token of parsed) {
    expect(state.objects[token.id]).toEqual(token);
    expect(token).toMatchObject({
      owner: "A",
      controller: "A",
      zone: "battlefield",
      generation: 0,
    });
    expect(token.token).toMatchObject({ creator: "A", creationEvent: created?.index });
  }
  const entered = state.events.find((event) => event.type === "BattlefieldEntryBatch");
  const completed = state.events.find((event) => event.type === "SpellResolved");
  expect(created?.index).toBeLessThan(entered?.index ?? -1);
  expect(entered?.index).toBeLessThan(completed?.index ?? -1);
}
function assertDeparture(before: RulesState, after: RulesState) {
  const top = before.stack.at(-1);
  if (top?.kind !== "spell") throw new Error("Expected paid Repulse spell");
  const target = before.objects[top.objectId]?.spellState?.target;
  if (!target) throw new Error("Repulse has no retained target");
  const moved = after.events.find(
    (event) =>
      event.type === "ObjectMoved" && GameObject.safeParse(event.data.before).data?.id === target,
  );
  const returned = after.events.find((event) => event.type === "ReturnInstructionCompleted");
  const drawn = after.events.find((event) => event.type === "CardDrawn");
  const completed = after.events.find((event) => event.type === "SpellResolved");
  const ceased = after.events.find((event) => event.type === "TokensCeased");
  expect(GameObject.parse(moved?.data.after)).toMatchObject({
    zone: "hand",
    owner: "A",
    generation: 1,
    token: before.objects[target]?.token,
  });
  expect(moved?.index).toBeLessThan(returned?.index ?? -1);
  expect(returned?.index).toBeLessThan(drawn?.index ?? -1);
  expect(drawn?.index).toBeLessThan(completed?.index ?? -1);
  expect(completed?.index).toBeLessThan(ceased?.index ?? -1);
  expect(after.objects[target]).toBeUndefined();
  expect(tokens(after)).toHaveLength(1);
  expect(after.frames).toEqual([]);
  expect(after.decision?.kind).toBe("priority");
  expect(after.players.find((seat) => seat.id === "B")?.library.length).toBe(
    (before.players.find((seat) => seat.id === "B")?.library.length ?? 0) - 1,
  );
  expect(physicalCounts(after)).toEqual([100, 100]);
  expect(after.players.flatMap((seat) => [...seat.hand, ...seat.graveyard])).not.toContain(
    `${before.objects[target]?.lineage}@1`,
  );
}

for (const mode of modes)
  test(`${mode}: ordinary token creation and Repulse departure survive native reopen, import, replay and exact retries`, async () => {
    const { release, boundaries } = fixture(mode);
    assertCreation(boundaries.created.state);
    assertDeparture(boundaries.beforeDeparture.state, boundaries.departed.state);
    for (const name of ["beforeCreation", "beforeDeparture"] as const) {
      const before = boundaries[name];
      const after = boundaries[name === "beforeCreation" ? "created" : "departed"];
      const file = path();
      const first = await restored(open(file), before, release);
      await first.close();
      const repo = open(file);
      const reopened = await Coordinator.open(repo, release, before.state.manifest.id);
      const other = await restored(open(), before, release);
      const input = tokenStorageCommand(before.state, { kind: "pass" });
      const [accepted, duplicate, imported] = await Promise.all([
        reopened.submit(input.actor, input),
        reopened.submit(input.actor, input),
        other.submit(input.actor, input),
      ]);
      expect(accepted.status).toBe("accepted");
      expect(duplicate).toEqual(accepted);
      expect(imported).toEqual(accepted);
      expect(reopened.current()).toEqual(after.state);
      expect(other.current()).toEqual(after.state);
      expect(repo.load(before.state.manifest.id)?.records).toHaveLength(after.state.revision);
      expect(await replayMatch(repo, release, before.state.manifest.id)).toEqual(after.state);
      const visible = reopened.view("B").objects.filter((object) => object.token);
      expect(
        visible.every(
          (object) =>
            object.card === null && object.tokenTemplate?.characteristics.name === "Soldier Token",
        ),
      ).toBe(true);
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
      const finalImport = await restored(open(), after, release);
      expect(await finalImport.submit(input.actor, input)).toEqual(accepted);
      expect(finalImport.current()).toEqual(after.state);
    }
  }, 30_000);

for (const boundaryName of ["beforeCreation", "beforeDeparture"] as const)
  for (const failure of ["INSERT INTO commander_boundaries", "UPDATE commander_matches", "COMMIT"])
    test(`${boundaryName}: rollback at ${failure} publishes neither tokens nor cessation and retries exactly once`, async () => {
      const { release, boundaries } = fixture();
      const before = boundaries[boundaryName];
      const after = boundaries[boundaryName === "beforeCreation" ? "created" : "departed"];
      const db = new Database(path(), { strict: true });
      let armed = false;
      const adapter: SqlDatabase = {
        exec(sql, bindings) {
          if (armed && sql.startsWith(failure)) {
            armed = false;
            throw new Error("Injected token persistence failure");
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
      const input = tokenStorageCommand(before.state, { kind: "pass" });
      armed = true;
      expect(await coordinator.submit(input.actor, input)).toMatchObject({
        status: "fault",
        code: "PersistenceFailed",
      });
      expect(coordinator.current()).toEqual(before.state);
      expect(repo.load(before.state.manifest.id)?.current).toEqual(before.state);
      expect(repo.findRecord(before.state.manifest.id, input.commandId)).toBeNull();
      expect(db.query("SELECT count(*) AS count FROM commander_boundaries").get()).toEqual({
        count: before.state.revision + 1,
      });
      const accepted = await coordinator.submit(input.actor, input);
      expect(accepted.status).toBe("accepted");
      expect(await coordinator.submit(input.actor, input)).toEqual(accepted);
      expect(coordinator.current()).toEqual(after.state);
      expect(await replayMatch(repo, release, before.state.manifest.id)).toEqual(after.state);
    });

test("rehashing a logical token checkpoint cannot change origin, ordinal, ownership or template identity", async () => {
  const { release, boundaries } = fixture();
  const mutations: ((token: GameObject) => void)[] = [
    (token) => {
      if (token.token) token.token.sourceVersion = "0".repeat(64);
    },
    (token) => {
      if (token.token) token.token.creationEvent++;
    },
    (token) => {
      if (token.token) token.token.ordinal = 3;
    },
    (token) => {
      if (token.token) token.token.source.owner = "B";
    },
    (token) => {
      token.owner = "B";
    },
    (token) => {
      token.definition = `token-template:${"0".repeat(64)}`;
    },
    (token) => {
      token.commander = true;
    },
    (token) => {
      delete token.token;
    },
  ];
  for (const mutate of mutations) {
    const envelope = JSON.parse(boundaries.created.logical);
    const token = tokens(envelope.payload.current)[0];
    if (!token) throw new Error("Missing actual saved token");
    mutate(token);
    envelope.payload.currentHash = await semanticHash(envelope.payload.current);
    envelope.checksum = await semanticHash(envelope.payload);
    const repo = open();
    await expect(importMatch(repo, release, JSON.stringify(envelope))).rejects.toThrow();
    expect(repo.list()).toEqual([]);
  }
}, 20_000);

test("prepared logical import rejects an altered retained token-template hash even after artifact and envelope rehashing", async () => {
  const { release, boundaries } = fixture();
  const envelope = JSON.parse(boundaries.created.logical);
  const artifact = envelope.payload.preparedArtifact;
  expect(artifact.retainedTokenTemplates).toHaveLength(1);
  artifact.retainedTokenTemplates[0].templateHash = "0".repeat(64);
  const { hash: _hash, ...payload } = artifact;
  artifact.hash = await semanticHash(payload);
  for (const state of [envelope.payload.initial, envelope.payload.current])
    state.manifest.preparedArtifactHash = artifact.hash;
  envelope.payload.initialHash = await semanticHash(envelope.payload.initial);
  envelope.payload.currentHash = await semanticHash(envelope.payload.current);
  envelope.checksum = await semanticHash(envelope.payload);
  const repo = open();
  await expect(importMatch(repo, release, JSON.stringify(envelope))).rejects.toThrow();
  expect(repo.list()).toEqual([]);
});

test("native rehashed current token context cannot replace the replayed historical token origin", async () => {
  const { release, boundaries } = fixture();
  const file = path();
  const coordinator = await restored(open(file), boundaries.created, release);
  const changed = coordinator.current();
  const token = tokens(changed)[0];
  if (!token?.token) throw new Error("Missing saved token origin");
  token.token.source.definition = changed.manifest.seats[0]?.deck.commander ?? "";
  await coordinator.close();
  const db = new Database(file);
  try {
    db.run("UPDATE commander_matches SET current_json = ?, current_hash = ? WHERE match_id = ?", [
      canonicalJson(changed),
      await semanticHash(changed),
      changed.manifest.id,
    ]);
  } finally {
    db.close();
  }
  const repo = open(file);
  await expect(Coordinator.open(repo, release, changed.manifest.id)).rejects.toThrow();
  expect(repo.load(changed.manifest.id)?.current).toEqual(changed);
});
