import { expect, test } from "bun:test";
import { sequenceFixture } from "../test-fixtures/ordered";
import { move, player } from "./common";
import { assertInvariants, observe, transition } from "./index";
import { enterBattlefield } from "./triggers";
import { givePriority } from "./turns";

// Independent authored expectations: source-etb-sequence-scenarios.json
// f28319410c8fba4172ceb17409810a60776f4c6e5dffba06cf6c3fbf54bcca07.
// CR608.2c/121.2/704.4/704.5b govern written order, individual draws and the later SBA.
const expectations = [
  { name: "Cloudblazer", life: 2, draws: 2 },
  { name: "Elite Guardmage", life: 3, draws: 1 },
  { name: "Inspiring Overseer", life: 1, draws: 1 },
  { name: "Priest of Ancient Lore", life: 1, draws: 1 },
];
for (const [index, expected] of expectations.entries())
  test(`SEQ0${index + 1}/14 ${expected.name}: cast produces a distinct atomic gain-then-draw ability`, () => {
    const f = sequenceFixture(index);
    const beforeHand = player(f.state, "A").hand.length;
    f.cast();
    expect(f.state.stack).toHaveLength(1);
    expect(f.state.stack[0]?.kind).toBe("triggered-ability");
    expect(player(f.state, "A").life).toBe(40);
    expect(player(f.state, "A").hand).toHaveLength(beforeHand - 1);
    const top = player(f.state, "A")
      .library.slice(0, expected.draws)
      .map((id) => f.state.objects[id]?.lineage);
    const ability = Object.values(f.state.abilities)[0];
    if (!ability) throw new Error("No ability");
    expect(ability.program.schema).toBe("commander-trigger/2");
    expect(observe(f.state, f.registry, "B").abilities[0]?.sourceCard.name).toBe(expected.name);
    f.passCycle();
    const events = f.state.events;
    expect(
      events
        .filter((e) => ["LifeGained", "CardDrawn", "TriggeredAbilityResolved"].includes(e.type))
        .map((e) => e.type),
    ).toEqual([
      "LifeGained",
      ...Array(expected.draws).fill("CardDrawn"),
      "TriggeredAbilityResolved",
    ]);
    expect(player(f.state, "A").life).toBe(40 + expected.life);
    expect(player(f.state, "A").hand).toHaveLength(beforeHand - 1 + expected.draws);
    const drawn = events
      .filter((e) => e.type === "CardDrawn")
      .map((e) => f.state.objects[String(e.data.object)]?.lineage);
    expect(drawn).toEqual(top);
    expect(f.state.stack).toEqual([]);
    expect(f.state.abilities).toEqual({});
    const other = observe(f.state, f.registry, "B");
    expect(other.objects.some((o) => o.zone === "hand" && o.owner === "A")).toBe(false);
    expect(
      events
        .filter((e) => e.type === "CardDrawn")
        .every((e) => JSON.stringify(e.visibility) === '["A"]'),
    ).toBe(true);
    expect(events.some((e) => e.type === "PlayersLostBatch")).toBe(false);
  });
test("SEQ05 source removed: both ordered instructions still use captured source/controller", () => {
  const f = sequenceFixture();
  f.cast();
  const ability = Object.values(f.state.abilities)[0];
  if (!ability) throw new Error("No source");
  move(f.state, ability.source.id, "graveyard", "synthetic source-removal precondition");
  expect(f.state.objects[ability.source.id]).toBeUndefined();
  const hand = player(f.state, "A").hand.length;
  f.passCycle();
  expect(player(f.state, "A").life).toBe(42);
  expect(player(f.state, "A").hand).toHaveLength(hand + 2);
  expect(f.state.events.find((e) => e.type === "LifeGained")?.data.source).toBe(ability.source.id);
  expect(f.state.events.some((e) => e.type === "TriggeredAbilityResolved")).toBe(true);
});
test("SEQ06 source control change does not redirect the already captured sequence", () => {
  const f = sequenceFixture();
  f.cast();
  const ability = Object.values(f.state.abilities)[0];
  if (!ability) throw new Error("No source");
  const live = f.state.objects[ability.source.id];
  if (!live) throw new Error("No live source");
  live.controller = "B";
  assertInvariants(f.state, f.registry);
  const otherHand = player(f.state, "B").hand.length;
  f.passCycle();
  expect(player(f.state, "A").life).toBe(42);
  expect(player(f.state, "B").life).toBe(40);
  expect(player(f.state, "B").hand).toHaveLength(otherHand);
});
for (const available of [0, 1])
  test(`SEQ09/10 partial library ${available}: gain, individual draw attempts, completion, then elimination`, () => {
    const f = sequenceFixture();
    f.cast();
    f.limitedLibrary(available);
    f.passCycle();
    const types = f.state.events.map((e) => e.type);
    expect(types.indexOf("LifeGained")).toBeLessThan(types.indexOf("DrawFromEmptyLibrary"));
    expect(f.state.events.filter((e) => e.type === "CardDrawn")).toHaveLength(available);
    expect(f.state.events.filter((e) => e.type === "DrawFromEmptyLibrary")).toHaveLength(
      2 - available,
    );
    expect(types.indexOf("TriggeredAbilityResolved")).toBeLessThan(
      types.indexOf("PlayersLostBatch"),
    );
    expect(player(f.state, "A").life).toBe(42);
    expect(player(f.state, "A").lossReason).toBe("empty-library-draw");
    expect(f.state.stack).toEqual([]);
    expect(f.state.abilities).toEqual({});
  });
test("SEQ11 explicitly synthetic reverse sequence finishes later life gain after failed draw before SBA", () => {
  const f = sequenceFixture(0, true);
  f.cast();
  f.limitedLibrary(1);
  f.passCycle();
  const types = f.state.events.map((e) => e.type);
  expect(types.indexOf("CardDrawn")).toBeLessThan(types.indexOf("DrawFromEmptyLibrary"));
  expect(types.indexOf("DrawFromEmptyLibrary")).toBeLessThan(types.indexOf("LifeGained"));
  expect(types.indexOf("LifeGained")).toBeLessThan(types.indexOf("TriggeredAbilityResolved"));
  expect(types.indexOf("TriggeredAbilityResolved")).toBeLessThan(types.indexOf("PlayersLostBatch"));
  expect(player(f.state, "A").life).toBe(43);
  expect(player(f.state, "A").lost).toBe(true);
});
test("whole resolving sequence rejects foreign/stale actions without advancing any instruction", () => {
  const f = sequenceFixture();
  f.cast();
  const before = structuredClone(f.state);
  const input = f.input({ kind: "pass" });
  expect(transition(f.state, { ...input, actor: "B" }, f.registry).status).toBe("rejected");
  expect(transition(f.state, { ...input, revision: input.revision - 1 }, f.registry).status).toBe(
    "rejected",
  );
  expect(f.state).toEqual(before);
});

test("SEQ07 synthetic simultaneous source entry orders whole sequences without interleaving", () => {
  const f = sequenceFixture();
  const sources = ["Cloudblazer", "Priest of Ancient Lore"].map((name) =>
    Object.values(f.state.objects).find(
      (o) => o.owner === "A" && f.registry.definitions[o.definition]?.name === name,
    ),
  );
  if (!sources[0] || !sources[1]) throw new Error("Missing simultaneous sources");
  f.state.decision = null;
  f.state.priorityPlayer = null;
  enterBattlefield(
    f.state,
    f.registry,
    [sources[0], sources[1]].map((o) => ({ objectId: o.id, controller: "A" })),
    "synthetic simultaneous sequence fixture",
  );
  givePriority(f.state, f.registry, "A");
  const cloud = Object.values(f.state.abilities).find(
    (a) => f.registry.definitions[a.source.definition]?.name === "Cloudblazer",
  );
  const priest = Object.values(f.state.abilities).find(
    (a) => f.registry.definitions[a.source.definition]?.name === "Priest of Ancient Lore",
  );
  if (!cloud || !priest) throw new Error("Missing captured sequence");
  f.send({ kind: "trigger-order", triggers: [priest.id, cloud.id] });
  const hand = player(f.state, "A").hand.length;
  f.passCycle();
  expect(player(f.state, "A").life).toBe(42);
  expect(player(f.state, "A").hand).toHaveLength(hand + 2);
  expect(f.state.stack).toEqual([{ kind: "triggered-ability", triggerId: priest.id }]);
  expect(f.state.events.filter((e) => e.type === "TriggeredAbilityResolved")).toHaveLength(1);
  f.passCycle();
  expect(player(f.state, "A").life).toBe(43);
  expect(player(f.state, "A").hand).toHaveLength(hand + 3);
  expect(f.state.stack).toEqual([]);
});
test("SEQ08 synthetic APNAP cohort resolves the nonactive player's whole sequence first", () => {
  const f = sequenceFixture();
  const cloud = Object.values(f.state.objects).find(
    (o) => o.owner === "A" && f.registry.definitions[o.definition]?.name === "Cloudblazer",
  );
  const guard = Object.values(f.state.objects).find(
    (o) => o.owner === "B" && f.registry.definitions[o.definition]?.name === "Elite Guardmage",
  );
  if (!cloud || !guard) throw new Error("Missing APNAP sources");
  f.state.decision = null;
  f.state.priorityPlayer = null;
  enterBattlefield(
    f.state,
    f.registry,
    [
      { objectId: cloud.id, controller: "A" },
      { objectId: guard.id, controller: "B" },
    ],
    "synthetic APNAP sequence fixture",
  );
  givePriority(f.state, f.registry, "A");
  f.passCycle();
  expect(player(f.state, "A").life).toBe(40);
  expect(player(f.state, "B").life).toBe(43);
  expect(f.state.stack).toHaveLength(1);
  const top = f.state.stack[0];
  if (top?.kind !== "triggered-ability") throw new Error("Expected remaining A ability");
  expect(f.state.abilities[top.triggerId]?.controller).toBe("A");
  f.passCycle();
  expect(player(f.state, "A").life).toBe(42);
  expect(f.state.stack).toEqual([]);
});
