import { expect, test } from "bun:test";
import { canonicalJson, emptyMana, RulesState } from "@iwsdk-apps/contracts";
import {
  announce,
  answer,
  cast,
  command,
  counterFixture,
  locate,
  owner,
  resolveOne,
} from "../test-fixtures/counterspells";
import { castCost } from "./casting";
import { move } from "./common";
import { isLegalSpellTarget, legalSpellTargets } from "./effects";
import { assertInvariants, observe, transition } from "./index";

// Constructed rule scenarios derived from pinned CR112.1,115.5,400.7,405.1,
// 601.2c/f/h,608.2b/n,701.6a/b,702.11b,702.18a,704.4 and903.9a.
// Counterspell/Cancel, Essence Scatter and Negate source text supplied the three
// target domains; these synthetic boards are not source-binding or full-game evidence.
function program(f: ReturnType<typeof counterFixture>, id = "counter") {
  const value = f.registry.definitions[id]?.spellProgram;
  if (!value) throw new Error("Missing counter program");
  return value;
}
function index(f: ReturnType<typeof counterFixture>, type: string) {
  const result = f.state.events.findIndex((event) => event.type === type);
  expect(result).toBeGreaterThanOrEqual(0);
  return result;
}

test("empty stack cannot support a counterspell, and rejected announcement advances neither state nor RNG", () => {
  const f = counterFixture();
  const source = locate(f, "A", "counter");
  expect(f.state.decision?.cards).not.toContain(source.id);
  expect(legalSpellTargets(f.state, f.registry, "A", program(f), source.id)).toEqual({
    cards: [],
    players: [],
  });
  const before = canonicalJson(f.state);
  const result = transition(f.state, command(f, { kind: "cast", card: source.id }), f.registry);
  expect(result).toMatchObject({ status: "rejected", code: "IllegalCommand" });
  expect(canonicalJson(f.state)).toBe(before);
});

test("typed stack domains include Artifact/Enchantment Creature spells and ignore battlefield-only shroud/hexproof", () => {
  const f = counterFixture();
  const ids = [
    "creature",
    "artifact-creature",
    "enchantment-creature",
    "protected-creature",
    "draw-spell",
  ].map((id) => move(f.state, locate(f, "A", id).id, "stack", "constructed stack domain").id);
  const battlefield = move(
    f.state,
    locate(f, "B", "creature").id,
    "battlefield",
    "constructed irrelevant permanent",
  );
  const source = locate(f, "B", "counter").id;
  expect(legalSpellTargets(f.state, f.registry, "B", program(f), source).cards).toEqual(ids);
  expect(
    legalSpellTargets(f.state, f.registry, "B", program(f, "creature-counter"), source).cards,
  ).toEqual(ids.slice(0, 4));
  expect(
    legalSpellTargets(f.state, f.registry, "B", program(f, "noncreature-counter"), source).cards,
  ).toEqual(ids.slice(4));
  expect(legalSpellTargets(f.state, f.registry, "B", program(f), source).cards).not.toContain(
    battlefield.id,
  );
  expect(() => legalSpellTargets(f.state, f.registry, "B", program(f))).toThrow(
    "source incarnation",
  );
});

for (const target of [
  "creature",
  "artifact-creature",
  "enchantment-creature",
  "protected-creature",
  "trigger-creature",
])
  test(`countered ${target} never enters, retains paid costs and creates a new owner-graveyard object`, () => {
    const f = counterFixture();
    const targetId = cast(f, "A", target);
    const before = f.state.objects[targetId];
    if (!before) throw new Error("Missing target spell");
    const paidPool = structuredClone(owner(f, "A").mana);
    const counter = cast(f, "B", "creature-counter", targetId);
    expect(
      observe(f.state, f.registry, "A").objects.find((row) => row.id === counter)?.spellState,
    ).toEqual({ target: targetId });
    resolveOne(f);
    expect(f.state.stack).toEqual([]);
    expect(f.state.objects[targetId]).toBeUndefined();
    const grave = locate(f, "A", target);
    expect(grave.zone).toBe("graveyard");
    expect(grave.id).not.toBe(targetId);
    expect(grave.lineage).toBe(before.lineage);
    expect(owner(f, "A").graveyard).toContain(grave.id);
    expect(owner(f, "A").mana).toEqual(paidPool);
    expect(locate(f, "B", "creature-counter").zone).toBe("graveyard");
    expect(
      f.state.events.some(
        (row) => row.type === "PermanentSpellResolved" || row.type === "TriggerCreated",
      ),
    ).toBe(false);
    expect(f.state.abilities).toEqual({});
    expect(index(f, "SpellCountered")).toBeLessThan(index(f, "SpellResolved"));
    expect(f.state.coverage["rule:701.6b"]).toBeGreaterThan(0);
  });

test("Negate domain counters an instant before its draw instructions and cannot target a creature spell", () => {
  const f = counterFixture();
  const lower = cast(f, "A", "draw-spell");
  const library = owner(f, "A").library.length;
  cast(f, "B", "noncreature-counter", lower);
  resolveOne(f);
  expect(owner(f, "A").library).toHaveLength(library);
  expect(f.state.events.some((event) => event.type === "CardDrawn")).toBe(false);
  expect(locate(f, "A", "draw-spell").zone).toBe("graveyard");
  const creature = move(
    f.state,
    locate(f, "A", "creature").id,
    "stack",
    "constructed type exclusion",
  );
  expect(
    isLegalSpellTarget(
      f.state,
      f.registry,
      "B",
      program(f, "noncreature-counter"),
      creature.id,
      locate(f, "B", "counter").id,
    ),
  ).toBe(false);
});

test("forged self-target, wrong actor and stale revision are rejected during the real target decision", () => {
  const f = counterFixture();
  const lower = cast(f, "A", "creature");
  const source = announce(f, "B", "counter");
  expect(f.state.decision?.cards).toEqual([lower]);
  const before = canonicalJson(f.state);
  for (const input of [
    command(f, { kind: "target", target: source }),
    { ...command(f, { kind: "target", target: lower }), actor: "A" },
    { ...command(f, { kind: "target", target: lower }), revision: f.state.revision - 1 },
  ]) {
    expect(transition(f.state, input, f.registry).status).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(before);
  }
  expect(isLegalSpellTarget(f.state, f.registry, "B", program(f), source, source)).toBe(false);
  answer(f, { kind: "target", target: lower });
  // A forged saved casting frame cannot smuggle self-targeting past payment revalidation.
  const frame = f.state.frames.at(-1);
  if (frame?.kind !== "casting") throw new Error("No casting frame");
  frame.target = source;
  const spell = f.state.objects[source];
  if (!spell) throw new Error("No announced spell");
  spell.spellState = { target: source };
  const pool = structuredClone(owner(f, "B").mana);
  const result = transition(
    f.state,
    command(f, { kind: "payment", sources: [], spend: { ...emptyMana(), C: 1, U: 1 } }),
    f.registry,
  );
  expect(result).toMatchObject({ status: "rejected", code: "IllegalCommand" });
  expect(owner(f, "B").mana).toEqual(pool);
});

test("countering the upper counterspell lets the original spell subsequently resolve", () => {
  const f = counterFixture();
  const original = cast(f, "A", "draw-spell");
  const library = owner(f, "A").library.length;
  const lowerCounter = cast(f, "B", "counter", original);
  cast(f, "A", "counter", lowerCounter);
  resolveOne(f);
  expect(f.state.stack).toEqual([{ kind: "spell", objectId: original }]);
  expect(owner(f, "A").library).toHaveLength(library);
  expect(locate(f, "B", "counter").zone).toBe("graveyard");
  resolveOne(f);
  expect(owner(f, "A").library).toHaveLength(library - 2);
  expect(f.state.events.filter((event) => event.type === "CardDrawn")).toHaveLength(2);
});

test("two counters can choose the same original; the lower counter does not resolve after that target leaves", () => {
  const f = counterFixture();
  const original = cast(f, "A", "draw-spell");
  const library = owner(f, "A").library.length;
  const lowerCounter = cast(f, "B", "counter", original);
  cast(f, "A", "counter", original); // Legal to target one's own spell (CR115.5 excludes only self).
  resolveOne(f);
  expect(f.state.stack).toEqual([{ kind: "spell", objectId: lowerCounter }]);
  resolveOne(f);
  expect(f.state.stack).toEqual([]);
  expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
  expect(f.state.events.some((event) => event.type === "SpellCountered")).toBe(false);
  expect(owner(f, "A").library).toHaveLength(library);
});

test("a returned physical card is a different stack incarnation and cannot satisfy the old target", () => {
  const f = counterFixture();
  const old = cast(f, "A", "creature");
  const source = cast(f, "B", "counter", old);
  const hand = move(f.state, old, "hand", "constructed leave-and-return scenario");
  const returned = move(f.state, hand.id, "stack", "constructed new stack incarnation");
  f.state.stack = [
    { kind: "spell", objectId: returned.id },
    { kind: "spell", objectId: source },
  ];
  expect(returned.lineage).toBe(hand.lineage);
  expect(isLegalSpellTarget(f.state, f.registry, "B", program(f), old, source)).toBe(false);
  assertInvariants(f.state, f.registry);
  resolveOne(f);
  expect(f.state.stack).toEqual([{ kind: "spell", objectId: returned.id }]);
  expect(f.state.objects[returned.id]?.zone).toBe("stack");
  expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
});

for (const accept of [true, false])
  test(`countered commander reaches its owner's graveyard before the post-resolution command-zone choice (${accept})`, () => {
    const f = counterFixture();
    const target = cast(f, "A", "commander");
    const lineage = f.state.objects[target]?.lineage;
    if (!lineage) throw new Error("Missing commander lineage");
    cast(f, "B", "counter", target);
    resolveOne(f);
    expect(f.state.decision).toMatchObject({ kind: "commander-zone", actor: "A" });
    expect(locate(f, "A", "commander").zone).toBe("graveyard");
    expect(locate(f, "B", "counter").zone).toBe("graveyard");
    expect(owner(f, "A").commanderCasts[lineage]).toBe(1);
    expect(index(f, "SpellCountered")).toBeLessThan(index(f, "SpellResolved"));
    answer(f, { kind: "commander-zone", move: accept });
    const commander = locate(f, "A", "commander");
    expect(commander.zone).toBe(accept ? "command" : "graveyard");
    if (accept) expect(castCost(f.state, f.registry, commander.id).generic).toBe(3);
  });

test("countered spell uses its owner graveyard even with a different captured stack controller", () => {
  const f = counterFixture();
  const target = cast(f, "A", "creature");
  const object = f.state.objects[target];
  if (!object) throw new Error("Missing spell");
  object.controller = "B"; // Isolated owner/controller precondition, not a supported control-changing card.
  cast(f, "B", "counter", target);
  resolveOne(f);
  const grave = locate(f, "A", "creature");
  expect(grave.zone).toBe("graveyard");
  expect(owner(f, "A").graveyard).toContain(grave.id);
  expect(owner(f, "B").graveyard).not.toContain(grave.id);
  expect(f.state.events.find((event) => event.type === "SpellCountered")?.data).toMatchObject({
    owner: "A",
    controller: "B",
  });
});

test("a real triggered ability on the stack is excluded from every spell-target domain", () => {
  const f = counterFixture();
  cast(f, "A", "trigger-creature");
  resolveOne(f);
  expect(f.state.stack[0]?.kind).toBe("triggered-ability");
  const source = locate(f, "A", "counter").id;
  for (const id of ["counter", "creature-counter", "noncreature-counter"])
    expect(legalSpellTargets(f.state, f.registry, "A", program(f, id), source).cards).toEqual([]);
  expect(f.state.decision?.cards).not.toContain(source);
  expect(transition(f.state, command(f, { kind: "cast", card: source }), f.registry).status).toBe(
    "rejected",
  );
});

test("canceling announcement restores the hand incarnation and leaves the lower spell and mana untouched", () => {
  const f = counterFixture();
  const lower = cast(f, "A", "creature");
  const original = locate(f, "B", "counter").id;
  const pool = structuredClone(owner(f, "B").mana);
  announce(f, "B", "counter");
  answer(f, { kind: "cancel-cast" });
  expect(f.state.stack).toEqual([{ kind: "spell", objectId: lower }]);
  expect(locate(f, "B", "counter").id).toBe(original);
  expect(owner(f, "B").mana).toEqual(pool);
});

test("pending stack-target choice survives canonical JSON and produces an identical accepted boundary", () => {
  const f = counterFixture();
  const lower = cast(f, "A", "creature");
  announce(f, "B", "counter");
  const resumed = RulesState.parse(JSON.parse(canonicalJson(f.state)));
  const input = command(f, { kind: "target", target: lower });
  const before = transition(f.state, input, f.registry),
    after = transition(resumed, input, f.registry);
  expect(before.status).toBe("accepted");
  expect(canonicalJson(after)).toBe(canonicalJson(before));
});

test("countering a targeted removal spell does not perform its target effects", () => {
  const f = counterFixture();
  const creature = move(
    f.state,
    locate(f, "B", "creature").id,
    "battlefield",
    "constructed removal target",
  );
  const removal = cast(f, "A", "destroy-spell", creature.id);
  cast(f, "B", "counter", removal);
  resolveOne(f);
  expect(f.state.objects[creature.id]?.zone).toBe("battlefield");
  expect(f.state.events.some((event) => event.type === "CreatureDestroyed")).toBe(false);
  expect(locate(f, "A", "destroy-spell").zone).toBe("graveyard");
});

test("a counter does not untap an actual mana source or refund the spent pool", () => {
  const f = counterFixture();
  const land = move(
    f.state,
    locate(f, "A", "land").id,
    "battlefield",
    "constructed untapped payment source",
  );
  owner(f, "A").mana = emptyMana();
  const target = announce(f, "A", "creature");
  answer(f, {
    kind: "payment",
    sources: [{ object: land.id, color: "U" }],
    spend: { ...emptyMana(), U: 1 },
  });
  expect(f.state.objects[land.id]?.tapped).toBe(true);
  cast(f, "B", "counter", target);
  resolveOne(f);
  expect(f.state.objects[land.id]?.tapped).toBe(true);
  expect(owner(f, "A").mana).toEqual(emptyMana());
});

test("four-player priority retains the caster, resets prior passes, and requires every living player before one resolution", () => {
  const f = counterFixture(4);
  const lower = cast(f, "A", "creature");
  const counter = cast(f, "B", "counter", lower);
  expect(f.state.priorityPlayer).toBe("B");
  expect(f.state.consecutivePasses).toBe(0);
  for (const actor of ["B", "C", "D"]) {
    expect(f.state.decision?.actor).toBe(actor);
    answer(f, { kind: "pass" });
    expect(f.state.objects[counter]?.zone).toBe("stack");
    expect(f.state.objects[lower]?.zone).toBe("stack");
  }
  expect(f.state.decision?.actor).toBe("A");
  answer(f, { kind: "pass" });
  expect(f.state.stack).toEqual([]);
  expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
});

test("canonical checkpoint may retain a now-absent lower target until resolution revalidation", () => {
  const f = counterFixture();
  const original = cast(f, "A", "draw-spell");
  const lower = cast(f, "B", "counter", original);
  cast(f, "A", "counter", original);
  resolveOne(f);
  expect(f.state.objects[original]).toBeUndefined();
  expect(f.state.objects[lower]?.spellState?.target).toBe(original);
  const reopened = {
    registry: f.registry,
    state: RulesState.parse(JSON.parse(canonicalJson(f.state))),
  };
  assertInvariants(reopened.state, reopened.registry);
  resolveOne(f);
  resolveOne(reopened);
  expect(canonicalJson(reopened.state)).toBe(canonicalJson(f.state));
  expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
});

test("narrow target revalidation reads current types, while generic spell targeting remains valid", () => {
  const f = counterFixture();
  const target = cast(f, "A", "creature");
  const source = locate(f, "B", "counter").id;
  expect(
    isLegalSpellTarget(f.state, f.registry, "B", program(f, "creature-counter"), target, source),
  ).toBe(true);
  // Synthetic registry substitution isolates the predicate; no type-changing card
  // or mutable authenticated registry is admitted by this increment.
  const current = f.registry.definitions.creature;
  if (!current) throw new Error("Missing constructed definition");
  const changed = {
    ...f.registry,
    definitions: {
      ...f.registry.definitions,
      creature: { ...current, typeLine: "Instant", types: ["Instant"] },
    },
  };
  expect(
    isLegalSpellTarget(f.state, changed, "B", program(f, "creature-counter"), target, source),
  ).toBe(false);
  expect(
    isLegalSpellTarget(f.state, changed, "B", program(f, "noncreature-counter"), target, source),
  ).toBe(true);
  expect(isLegalSpellTarget(f.state, changed, "B", program(f), target, source)).toBe(true);
});

test("resolution revalidation also refuses a forged self-target without countering the lower spell", () => {
  const f = counterFixture();
  const lower = cast(f, "A", "creature");
  const source = cast(f, "B", "counter", lower);
  const spell = f.state.objects[source];
  if (!spell) throw new Error("Missing counter source");
  spell.spellState = { target: source }; // Constructed corrupt choice, never selected by legal commands.
  resolveOne(f);
  expect(f.state.stack).toEqual([{ kind: "spell", objectId: lower }]);
  expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
  expect(f.state.events.some((event) => event.type === "SpellCountered")).toBe(false);
});
