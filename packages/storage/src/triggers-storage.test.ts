import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyMana,
  type GameCommand,
  MANA_COLORS,
  type Response,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  reachFirstMain,
  TRIGGER_CARDS,
  triggerCommand,
  triggerFixtures,
} from "../test-fixtures/triggers";
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

// Every ordinary scenario starts with a legal shuffled/dealt game. Selection is
// deterministic and bounded; no opening hand or battlefield is rewritten.
async function ordinaryFixture(id: string, commander = false) {
  const fixture = await triggerFixtures(id, commander);
  for (let seed = 1; seed <= 2000; seed++) {
    fixture.manifest.gameSeed = seed;
    const state = reachFirstMain(fixture.manifest, fixture.registry);
    const a = state.players.find((seat) => seat.id === "A");
    const b = state.players.find((seat) => seat.id === "B");
    const has = (hand: string[] | undefined, definition: string) =>
      hand?.some((id) => state.objects[id]?.definition === definition);
    if (
      has(b?.hand, TRIGGER_CARDS.removal) &&
      (commander ||
        (has(a?.hand, TRIGGER_CARDS.life) &&
          has(a?.hand, TRIGGER_CARDS.plains) &&
          has(a?.hand, TRIGGER_CARDS.forest)))
    )
      return fixture;
  }
  throw new Error("Bounded real-card opening-hand search exhausted");
}
async function prepareLands(coordinator: Coordinator) {
  for (let steps = 0; steps < 300; steps++) {
    const state = coordinator.current();
    if (state.turn === 7 && state.step === "main1" && state.decision?.actor === "A") return;
    const actor = state.players.find((seat) => seat.id === state.decision?.actor);
    if (
      state.decision?.kind === "priority" &&
      state.step === "main1" &&
      state.activePlayer === actor?.id &&
      actor.landsPlayed === 0
    ) {
      const controlled = Object.values(state.objects).filter(
        (object) => object.zone === "battlefield" && object.controller === actor.id,
      );
      const landIds = state.decision.cards.filter((id) => {
        const object = state.objects[id];
        return (
          object &&
          !object.commander &&
          ![TRIGGER_CARDS.life, TRIGGER_CARDS.draw, TRIGGER_CARDS.removal].includes(
            object.definition,
          )
        );
      });
      const wanted = [TRIGGER_CARDS.plains, TRIGGER_CARDS.forest].find(
        (definition) =>
          !controlled.some((object) => object.definition === definition) &&
          landIds.some((id) => state.objects[id]?.definition === definition),
      );
      const land = landIds.find((id) => state.objects[id]?.definition === wanted) ?? landIds[0];
      if (!land) throw new Error("Actual fixture has no legal land play");
      await send(coordinator, { kind: "land", card: land });
    } else await send(coordinator);
  }
  throw new Error("Ordinary turn preparation exceeded bound");
}
async function pay(coordinator: Coordinator) {
  const decision = coordinator.current().decision;
  if (decision?.kind !== "payment" || !decision.cost) throw new Error("No payment decision");
  const available = [...decision.manaSources];
  const sources: Extract<Response, { kind: "payment" }>["sources"] = [];
  const spend = emptyMana();
  for (const color of MANA_COLORS) {
    for (let i = 0; i < decision.cost[color]; i++) {
      const index = available.findIndex((source) => source.colors.includes(color));
      const source = available.splice(index, 1)[0];
      if (index < 0 || !source) throw new Error("Missing required colored mana");
      sources.push({ object: source.object, color });
      spend[color]++;
    }
  }
  for (let i = 0; i < decision.cost.generic; i++) {
    const source = available.shift();
    const color = source?.colors[0];
    if (!source || !color) throw new Error("Missing required generic mana");
    sources.push({ object: source.object, color });
    spend[color]++;
  }
  return send(coordinator, { kind: "payment", sources, spend });
}
async function murder(coordinator: Coordinator, source: string) {
  await send(coordinator); // A passes priority; B owns the actual removal card.
  expect(coordinator.pendingActor).toBe("B");
  const state = coordinator.current();
  const removal = state.players
    .find((seat) => seat.id === "B")
    ?.hand.find((id) => state.objects[id]?.definition === TRIGGER_CARDS.removal);
  if (!removal) throw new Error("Authenticated Murder is absent");
  await send(coordinator, { kind: "cast", card: removal });
  await send(coordinator, { kind: "target", target: source });
  await pay(coordinator);
  await send(coordinator);
  return send(coordinator);
}
describe("durable captured self-entry ability", () => {
  test("ordinary casts: source removal, exact retry, reload and import preserve the captured controller and incarnation", async () => {
    const { release, manifest } = await ordinaryFixture("ordinary-trigger-storage");
    const path = location();
    const repo = open(path);
    const coordinator = await Coordinator.create(repo, release, manifest);
    await prepareLands(coordinator);
    const source = coordinator
      .current()
      .players.find((seat) => seat.id === "A")
      ?.hand.find((id) => coordinator.current().objects[id]?.definition === TRIGGER_CARDS.life);
    if (!source) throw new Error("Actual Centaur Healer absent");
    await send(coordinator, { kind: "cast", card: source });
    await pay(coordinator);
    await passCycle(coordinator);
    const capturedState = coordinator.current();
    expect(capturedState.stack).toHaveLength(1);
    expect(capturedState.stack[0]?.kind).toBe("triggered-ability");
    const ability = Object.values(capturedState.abilities)[0];
    if (!ability) throw new Error("No captured entry ability");
    expect(ability.controller).toBe("A");
    expect(ability.source.zone).toBe("battlefield");
    expect(capturedState.players[0]?.life).toBe(40);
    const last = await murder(coordinator, ability.source.id);
    const pending = coordinator.current();
    expect(pending.objects[ability.source.id]).toBeUndefined();
    expect(
      Object.values(pending.objects).find((object) => object.lineage === ability.source.lineage)
        ?.zone,
    ).toBe("graveyard");
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
    const conflicting: GameCommand = { ...last.input, response: { kind: "cancel-cast" } };
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
  }, 30_000);

  test("ordinary commander destruction: the owned zone choice survives reopen/import and exact receipt retry", async () => {
    const { release, manifest } = await ordinaryFixture("ordinary-commander-storage", true);
    const path = location();
    const repo = open(path);
    const coordinator = await Coordinator.create(repo, release, manifest);
    await prepareLands(coordinator);
    const commander = Object.values(coordinator.current().objects).find(
      (object) => object.commander && object.owner === "A",
    );
    if (!commander) throw new Error("Missing Isamaru");
    await send(coordinator, { kind: "cast", card: commander.id });
    await pay(coordinator);
    await passCycle(coordinator);
    const source = Object.values(coordinator.current().objects).find(
      (object) => object.lineage === commander.lineage,
    );
    if (!source) throw new Error("Missing resolved Isamaru");
    await murder(coordinator, source.id);
    const pending = coordinator.current();
    expect(pending.decision?.kind).toBe("commander-zone");
    expect(pending.decision?.actor).toBe("A");
    const logical = await exportMatch(repo, release, manifest.id);
    await coordinator.close();
    const reopenedRepo = open(path);
    const reopened = await Coordinator.open(reopenedRepo, release, manifest.id);
    const importedRepo = open();
    expect(await importMatch(importedRepo, release, logical)).toEqual(pending);
    const imported = await Coordinator.open(importedRepo, release, manifest.id);
    expect(reopened.current()).toEqual(pending);
    const input = triggerCommand(pending, { kind: "commander-zone", move: true });
    const accepted = await reopened.submit("A", input);
    expect(accepted.status).toBe("accepted");
    expect(await imported.submit("A", input)).toEqual(accepted);
    expect(
      Object.values(reopened.current().objects).find(
        (object) => object.lineage === commander.lineage,
      )?.zone,
    ).toBe("command");
    await reopened.close();
    const restoredRepo = open(path);
    const restored = await Coordinator.open(restoredRepo, release, manifest.id);
    expect(await restored.submit("A", input)).toEqual(accepted);
    expect(
      await restored.submit("A", { ...input, response: { kind: "commander-zone", move: false } }),
    ).toMatchObject({ status: "rejected", code: "CommandConflict" });
    expect(await replayMatch(restoredRepo, release, manifest.id)).toEqual(restored.current());
    expect(await replayMatch(importedRepo, release, manifest.id)).toEqual(restored.current());
  }, 30_000);
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
  expect(evidence.sourceBackedCards).toBe(true);
  expect(evidence.triggerIds).toHaveLength(2);
  expect(evidence.acceptedCommands).toBe(5);
}, 15_000);
