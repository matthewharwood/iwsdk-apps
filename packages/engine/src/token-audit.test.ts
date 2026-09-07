import { expect, test } from "bun:test";
import { canonicalJson, emptyMana, type Zone } from "@iwsdk-apps/contracts";
import { heuristicDriver } from "../../simulation/src/driver";
import { announce, answer, command, locate, resolveOne } from "../test-fixtures/counterspells";
import {
  attackDecision,
  createBatch,
  passPriorityWindow,
  tokenFixture,
} from "../test-fixtures/tokens";
import { checkpoint } from "./checkpoints";
import { move, player, tryMove } from "./common";
import { legalSpellTargets } from "./effects";
import { assertInvariants, observe, transition } from "./index";
import { availableMana, priorityCandidates, selectedObjects } from "./selection";
import { enterBattlefield } from "./triggers";

// Independent CR111/701.7/704 expectations. These are explicitly constructed core
// boundaries, not authenticated source-card executions or completed games.
test("TKN13 audit: every attempted second token destination preserves the first incarnation and ordered zones", async () => {
  const f = await tokenFixture({ count: 1 });
  const token = createBatch(f).tokens[0];
  if (!token) throw new Error("No created token");
  const first = tryMove(f.state, token.id, "hand", "constructed between-instruction departure");
  if (first.kind !== "moved") throw new Error("First departure must happen");
  const beforeObjects = canonicalJson(f.state.objects);
  const beforeZones = canonicalJson(
    f.state.players.map((seat) => [seat.hand, seat.library, seat.graveyard]),
  );
  for (const zone of [
    "battlefield",
    "graveyard",
    "library",
    "hand",
    "exile",
    "stack",
    "command",
  ] as Zone[]) {
    const start = f.state.events.length;
    const result = tryMove(f.state, first.after.id, zone, "constructed prohibited next movement");
    expect(result).toEqual({ kind: "prevented", object: first.after, reason: "departed-token" });
    expect(canonicalJson(f.state.objects)).toBe(beforeObjects);
    expect(
      canonicalJson(f.state.players.map((seat) => [seat.hand, seat.library, seat.graveyard])),
    ).toBe(beforeZones);
    expect(f.state.events.slice(start).map((event) => event.type)).toEqual([
      "TokenMovementPrevented",
    ]);
    expect(f.state.objects[first.after.id]?.generation).toBe(1);
  }
  checkpoint(f.state, f.registry);
  expect(f.state.objects[first.after.id]).toBeUndefined();
  expect(player(f.state, "A").hand).not.toContain(first.after.id);
  assertInvariants(f.state, f.registry);
});

test("TKN13/TKN17 audit: mixed entry excludes a departed token while the actual card enters and captures one trigger", async () => {
  const f = await tokenFixture({ count: 1 });
  const token = createBatch(f).tokens[0];
  if (!token) throw new Error("No created token");
  const departed = move(f.state, token.id, "exile", "constructed prior departure");
  const creature = locate(f, "B", "trigger-creature");
  f.state.events = [];
  const entered = enterBattlefield(
    f.state,
    f.registry,
    [
      { objectId: departed.id, controller: "B" },
      { objectId: creature.id, controller: "B" },
    ],
    "constructed simultaneous mixed entry instruction",
  );
  expect(entered).toHaveLength(1);
  expect(f.state.objects[departed.id]).toEqual(departed);
  expect(
    f.state.events.find((event) => event.type === "BattlefieldEntryBatch")?.data.objects,
  ).toEqual(entered);
  const triggers = Object.values(f.state.abilities);
  expect(triggers).toHaveLength(1);
  expect(triggers[0]?.source.id).toBe(entered[0]);
  expect(triggers[0]?.controller).toBe("B");
  expect(triggers[0]?.occurrenceOrdinal).toBe(0);
  const trigger = triggers[0];
  if (!trigger) throw new Error("Missing captured trigger");
  checkpoint(f.state, f.registry);
  expect(f.state.objects[departed.id]).toBeUndefined();
  expect(f.state.stack).toEqual([{ kind: "triggered-ability", triggerId: trigger.id }]);
  assertInvariants(f.state, f.registry);
});

test("TKN04 audit: all four entitled observations expose the same token without leaking hand or library cards", async () => {
  const f = await tokenFixture({ seats: 4 });
  const created = createBatch(f, "C").tokens;
  const actualBefore = canonicalJson(f.state);
  const templateBefore = canonicalJson(f.registry.tokenTemplates);
  for (const actor of ["A", "B", "C", "D"]) {
    const view = observe(f.state, f.registry, actor);
    expect(view.objects.some((entry) => entry.zone === "library")).toBe(false);
    expect(
      view.objects.filter((entry) => entry.zone === "hand").every((entry) => entry.owner === actor),
    ).toBe(true);
    for (const token of created) {
      const row = view.objects.find((entry) => entry.id === token.id);
      expect(row?.token).toEqual(token.token);
      expect(row?.card).toBeNull();
      expect(row?.tokenTemplate).toEqual(f.template);
      expect(row?.tokenTemplate?.characteristics.manaCost).toBeNull();
      expect(row?.tokenTemplate?.characteristics.manaValue).toBe(0);
      expect(row?.characteristics).toEqual({ power: 2, toughness: 2, keywords: [] });
      if (row?.tokenTemplate) row.tokenTemplate.characteristics.name = "mutated presentation";
      if (row?.token) row.token.creator = "A";
    }
  }
  expect(canonicalJson(f.state)).toBe(actualBefore);
  expect(canonicalJson(f.registry.tokenTemplates)).toBe(templateBefore);
});

test("TKN04/TKN13 audit: token selectors allow creature targets but exclude mana, casting and stack-spell domains", async () => {
  const f = await tokenFixture({ count: 1 });
  const token = createBatch(f).tokens[0];
  if (!token) throw new Error("No created token");
  const program = f.registry.definitions["destroy-spell"]?.spellProgram;
  if (!program) throw new Error("No targeted program");
  expect(legalSpellTargets(f.state, f.registry, "B", program).cards).toContain(token.id);
  expect(
    selectedObjects(f.state, f.registry, availableMana, { actor: "A", lastTurn: f.state.turn }).map(
      (entry) => entry.id,
    ),
  ).not.toContain(token.id);
  for (const target of ["spell", "creature-spell", "noncreature-spell"] as const)
    expect(
      legalSpellTargets(
        f.state,
        f.registry,
        "B",
        { schema: "commander-spell/1", target, effects: [{ kind: "counter" }] },
        "constructed-query-source",
      ).cards,
    ).not.toContain(token.id);
  const departed = move(f.state, token.id, "hand", "constructed pre-checkpoint hand");
  expect(
    selectedObjects(f.state, f.registry, priorityCandidates(true, true), { actor: "A" }).map(
      (entry) => entry.id,
    ),
  ).not.toContain(departed.id);
  checkpoint(f.state, f.registry);
  expect(
    Object.values(f.state.objects).filter((entry) => !entry.token && entry.owner === "A"),
  ).toHaveLength(100);
  assertInvariants(f.state, f.registry);
});

test("TKN06/TKN08 audit: heuristic uses token characteristics for legal attacking and immediate blocking", async () => {
  const f = await tokenFixture({ count: 1, keywords: ["haste"], power: 3, toughness: 3 });
  const attacker = createBatch(f).tokens[0];
  const blocker = createBatch(f, "B").tokens[0];
  if (!attacker || !blocker) throw new Error("Missing created creatures");
  attackDecision(f);
  const attackView = observe(f.state, f.registry, "A");
  const frozen = canonicalJson(attackView);
  const attack = await heuristicDriver(attackView, 1);
  expect(attack).toEqual({ kind: "attack", attacks: [{ attacker: attacker.id, defender: "B" }] });
  expect(canonicalJson(attackView)).toBe(frozen);
  answer(f, attack);
  passPriorityWindow(f);
  const blocking = await heuristicDriver(observe(f.state, f.registry, "B"), 1);
  expect(blocking).toEqual({
    kind: "block",
    blocks: [{ blocker: blocker.id, attacker: attacker.id }],
  });
  answer(f, blocking);
  passPriorityWindow(f);
  while (f.state.decision?.kind === "damage")
    answer(f, await heuristicDriver(observe(f.state, f.registry, f.state.decision.actor), 1));
  expect(f.state.objects[attacker.id]).toBeUndefined();
  expect(f.state.objects[blocker.id]).toBeUndefined();
  expect(
    f.state.events
      .filter((event) => event.type === "TokensCeased")
      .flatMap((event) => event.data.objects as unknown[]),
  ).toHaveLength(2);
  expect(player(f.state, "A").commanderDamage).toEqual({});
  expect(player(f.state, "B").commanderDamage).toEqual({});
});

test("TKN10 audit: heuristic target and payment execute against an opposing noncard creature", async () => {
  const f = await tokenFixture({ count: 1 });
  const token = createBatch(f).tokens[0];
  if (!token) throw new Error("No created token");
  announce(f, "B", "destroy-spell");
  const target = await heuristicDriver(observe(f.state, f.registry, "B"), 1);
  expect(target).toEqual({ kind: "target", target: token.id });
  answer(f, target);
  answer(f, await heuristicDriver(observe(f.state, f.registry, "B"), 1));
  resolveOne(f);
  expect(Object.values(f.state.objects).some((entry) => entry.token)).toBe(false);
  expect(f.state.events.filter((event) => event.type === "CreatureDestroyed")).toHaveLength(1);
  expect(f.state.events.filter((event) => event.type === "TokensCeased")).toHaveLength(1);
});

test("TKN15 boundary audit: foreign-controller departure is explicit unsupported and never commits a partial token removal", async () => {
  const f = await tokenFixture({ seats: 4, count: 1 });
  const token = createBatch(f, "B").tokens[0];
  if (!token) throw new Error("No created token");
  token.controller = "C"; // Deliberately unsupported control history, no source card admitted.
  player(f.state, "C").life = 0;
  const before = canonicalJson(f.state);
  const result = transition(f.state, command(f, { kind: "pass" }), f.registry);
  expect(result).toMatchObject({ status: "unsupported", code: "UnsupportedMechanic" });
  expect(canonicalJson(f.state)).toBe(before);
  expect(f.state.objects[token.id]?.owner).toBe("B");
  expect(player(f.state, "B").mana).not.toEqual(emptyMana());
});
