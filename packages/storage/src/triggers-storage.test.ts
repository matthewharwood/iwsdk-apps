import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyMana, type GameCommand, type Response, semanticHash } from "@iwsdk-apps/contracts";
import { reachFirstMain, triggerCommand, triggerFixtures } from "../test-fixtures/triggers";
import { Coordinator, exportMatch, importMatch, type Repository, replayMatch } from "./index";
import { openNativeRepository } from "./native";

const closes: (() => void)[] = [];
afterEach(() => {
  for (const close of closes.splice(0).reverse()) {
    try {
      close();
    } catch {
      /* Closed explicitly. */
    }
  }
});
function location() {
  const directory = mkdtempSync(join(tmpdir(), "commander-trigger-storage-"));
  closes.push(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "matches.sqlite");
}
function open(path = location()): Repository {
  const repo = openNativeRepository(path);
  closes.push(() => repo.close());
  return repo;
}
async function send(coordinator: Coordinator, response?: Response) {
  const input = triggerCommand(coordinator.current(), response);
  const result = await coordinator.submit(input.actor, input);
  expect(result.status).toBe("accepted");
  if (result.status !== "accepted") throw new Error(JSON.stringify(result));
  return { input, receipt: result.receipt };
}
async function passCycle(coordinator: Coordinator) {
  await send(coordinator);
  await send(coordinator);
}

describe("durable captured self-entry ability", () => {
  test("ordinary casts: source removal, exact retry, reload and import preserve the captured controller and incarnation", async () => {
    const { release, manifest, registry } = await triggerFixtures("ordinary-trigger-storage");
    // Deterministic fixture seed search changes no live state: find an authentic opening hand
    // containing the singleton synthetic removal card. Every persisted action starts at setup.
    for (let seed = 1; seed <= 100; seed++) {
      manifest.gameSeed = seed;
      const initial = reachFirstMain(manifest, registry);
      if (
        initial.players
          .find((seat) => seat.id === "A")
          ?.hand.some((id) => initial.objects[id]?.definition === "synthetic-removal")
      )
        break;
      if (seed === 100) throw new Error("Bounded fixture seed search found no removal hand");
    }
    const path = location();
    const repo = open(path);
    const coordinator = await Coordinator.create(repo, release, manifest);
    for (let step = 0; step < 20 && coordinator.current().step !== "main1"; step++)
      await send(coordinator);
    const commander = Object.values(coordinator.current().objects).find(
      (object) => object.commander && object.owner === "A",
    );
    if (!commander) throw new Error("Missing fixture commander");
    await send(coordinator, { kind: "cast", card: commander.id });
    await send(coordinator, { kind: "payment", sources: [], spend: emptyMana() });
    await passCycle(coordinator);
    const capturedState = coordinator.current();
    expect(capturedState.stack).toHaveLength(1);
    expect(capturedState.stack[0]?.kind).toBe("triggered-ability");
    const ability = Object.values(capturedState.abilities)[0];
    if (!ability) throw new Error("No captured entry ability");
    expect(ability.controller).toBe("A");
    expect(ability.source.zone).toBe("battlefield");
    expect(capturedState.players[0]?.life).toBe(40);
    const removal = capturedState.players[0]?.hand.find(
      (id) => capturedState.objects[id]?.definition === "synthetic-removal",
    );
    if (!removal) throw new Error("Fixture removal absent from opening hand");
    await send(coordinator, { kind: "cast", card: removal });
    await send(coordinator, { kind: "target", target: ability.source.id });
    await send(coordinator, { kind: "payment", sources: [], spend: emptyMana() });
    expect(coordinator.current().stack.map((entry) => entry.kind)).toEqual([
      "triggered-ability",
      "spell",
    ]);
    await passCycle(coordinator);
    expect(coordinator.current().decision?.kind).toBe("commander-zone");
    const last = await send(coordinator, { kind: "commander-zone", move: true });
    const pending = coordinator.current();
    expect(pending.objects[ability.source.id]).toBeUndefined();
    expect(
      Object.values(pending.objects).find((object) => object.lineage === ability.source.lineage)
        ?.zone,
    ).toBe("command");
    expect(pending.abilities[ability.id]).toEqual(ability);
    expect(pending.stack).toEqual([{ kind: "triggered-ability", triggerId: ability.id }]);
    expect(pending.players[0]?.life).toBe(40);
    const logical = await exportMatch(repo, release, manifest.id);
    await coordinator.close();
    const reopenedRepo = open(path);
    const reopened = await Coordinator.open(reopenedRepo, release, manifest.id);
    expect(reopened.current()).toEqual(pending);
    expect(await reopened.submit(last.input.actor, last.input)).toEqual({
      status: "accepted",
      receipt: last.receipt,
    });
    const conflicting: GameCommand = {
      ...last.input,
      response: { kind: "commander-zone", move: false },
    };
    expect(await reopened.submit(conflicting.actor, conflicting)).toMatchObject({
      status: "rejected",
      code: "CommandConflict",
    });
    expect(reopened.current()).toEqual(pending);
    const importedRepo = open();
    expect(await importMatch(importedRepo, release, logical)).toEqual(pending);
    const imported = await Coordinator.open(importedRepo, release, manifest.id);
    expect(imported.view("B").abilities).toMatchObject([ability]);
    expect(imported.view("B").abilities[0]?.sourceCard.id).toBe(ability.source.definition);
    for (const session of [reopened, imported]) {
      await passCycle(session);
      expect(session.current().players[0]?.life).toBe(43);
      expect(session.current().stack).toEqual([]);
      expect(session.current().abilities).toEqual({});
      expect(
        session
          .current()
          .events.some(
            (event) =>
              event.type === "TriggeredAbilityResolved" && event.data.source === ability.source.id,
          ),
      ).toBe(true);
    }
    expect(await semanticHash(reopened.current())).toBe(await semanticHash(imported.current()));
    expect(await replayMatch(reopenedRepo, release, manifest.id)).toEqual(reopened.current());
    expect(await replayMatch(importedRepo, release, manifest.id)).toEqual(imported.current());
  });
});

test("constructed multi-trigger ordering: isolated initialization adapter exercises actual SQLite, transitions and replay", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL("../test-fixtures/multi-trigger-child.ts", import.meta.url).pathname,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new globalThis.Response(child.stdout).text(),
    new globalThis.Response(child.stderr).text(),
  ]);
  expect({ status, stderr }).toEqual({ status: 0, stderr: "" });
  const evidence = JSON.parse(stdout);
  expect(evidence.status).toBe("passed");
  expect(evidence.ordinaryCommandReachable).toBe(false);
  expect(evidence.sourceBackedCards).toBe(false);
  expect(evidence.triggerIds).toHaveLength(2);
  expect(evidence.acceptedCommands).toBe(5);
}, 15_000);
