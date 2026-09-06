import { expect, test } from "bun:test";
import { canonicalJson, emptyMana, type Response, RulesState } from "@iwsdk-apps/contracts";
import { answer, cast, command, locate, owner, resolveOne } from "../test-fixtures/counterspells";
import {
  castReturn,
  pendingReturn,
  putTarget,
  resolveReturn,
  returnFixture,
} from "../test-fixtures/return-resolution";
import { castCost } from "./casting";
import { checkpoint } from "./checkpoints";
import { move } from "./common";
import { legalSpellTargets } from "./effects";
import { assertInvariants, observe, transition } from "./index";
import { givePriority } from "./turns";

// CR903.9b/614.6 replacement precedes movement, CR117.2e forbids priority,
// CR608.2c/n continues written instructions, and CR704.4 defers state-based actions.
function eventIndex(f: ReturnType<typeof returnFixture>, type: string) {
  const n = f.state.events.findIndex((event) => event.type === type);
  expect(n).toBeGreaterThanOrEqual(0);
  return n;
}

test("ordinary creature returns once to owner hand as a clean new incarnation without destruction", () => {
  const f = returnFixture(false),
    target = putTarget(f, "B", false);
  const before = f.state.objects[target];
  if (!before) throw new Error("Missing target");
  before.tapped = true;
  before.damage = 1;
  before.counters = { charge: 3 };
  const source = f.registry.definitions.creature;
  if (!source) throw new Error("Missing target source");
  source.keywords = ["indestructible"];
  castReturn(f, target);
  resolveReturn(f);
  const returned = locate(f, "B", "creature");
  expect(returned).toMatchObject({
    zone: "hand",
    owner: "B",
    controller: "B",
    tapped: false,
    damage: 0,
    counters: {},
    generation: before.generation + 1,
  });
  expect(returned.id).not.toBe(target);
  expect(f.state.frames).toEqual([]);
  expect(f.state.events.some((e) => e.type === "CreatureDestroyed")).toBe(false);
  expect(locate(f, "A", "draw-spell").zone).toBe("graveyard");
});
for (const cantrip of [false, true])
  for (const replace of [false, true])
    test(`commander return ${cantrip ? "then draw" : "only"}: owner replacement ${replace} pauses before all movement and continues once`, () => {
      const f = returnFixture(cantrip),
        target = putTarget(f),
        before = structuredClone(f.state.objects[target]);
      const library = owner(f, "A").library.length,
        source = castReturn(f, target);
      resolveReturn(f);
      expect(f.state.decision).toMatchObject({
        kind: "commander-replacement",
        actor: "B",
        cards: [target],
      });
      expect(f.state.priorityPlayer).toBeNull();
      expect(f.state.objects[target]).toEqual(before);
      expect(f.state.objects[source]?.zone).toBe("stack");
      expect(owner(f, "A").library).toHaveLength(library);
      expect(
        f.state.events.some((e) => ["ObjectMoved", "CardDrawn", "SpellResolved"].includes(e.type)),
      ).toBe(false);
      const frame = pendingReturn(f);
      expect(frame).toMatchObject({
        source: { id: source, controller: "A" },
        controller: "A",
        target,
        effectIndex: 0,
        pendingMovement: { before, destination: "hand", replacement: "commander-hand/1" },
      });
      expect(() => givePriority(f.state, f.registry, "A")).toThrow("suspended resolution");
      expect(() => checkpoint(f.state, f.registry)).toThrow("suspended resolution");
      answer(f, { kind: "commander-replacement", move: replace });
      expect(locate(f, "B", "commander").zone).toBe(replace ? "command" : "hand");
      expect(locate(f, "A", "draw-spell").zone).toBe("graveyard");
      expect(owner(f, "A").library).toHaveLength(library - Number(cantrip));
      expect(f.state.frames).toEqual([]);
      expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
      expect(f.state.events.filter((e) => e.type === "ReturnInstructionCompleted")).toHaveLength(1);
      expect(f.state.events.filter((e) => e.type === "CardDrawn")).toHaveLength(Number(cantrip));
      const moved = eventIndex(f, "ReturnInstructionCompleted"),
        finished = eventIndex(f, "SpellResolved");
      expect(moved).toBeLessThan(finished);
      if (cantrip) {
        expect(eventIndex(f, "CardDrawn")).toBeGreaterThan(moved);
        expect(eventIndex(f, "CardDrawn")).toBeLessThan(finished);
      }
      if (replace)
        expect(
          f.state.events
            .filter((e) => e.type === "ObjectMoved")
            .some((e) => {
              const after = e.data.after;
              return (
                typeof after === "object" &&
                after !== null &&
                !Array.isArray(after) &&
                after.zone === "hand" &&
                after.commander === true
              );
            }),
        ).toBe(false);
    });
for (const replace of [false, true])
  test(`four distinct roles preserve spell owner/controller and commander owner/controller (${replace})`, () => {
    const f = returnFixture(true, 4),
      target = putTarget(f, "C");
    const commander = f.state.objects[target];
    if (!commander) throw new Error("Missing commander");
    commander.controller = "D";
    const source = castReturn(f, target),
      spell = f.state.objects[source];
    if (!spell) throw new Error("Missing spell");
    spell.controller = "B";
    const libraries = f.state.players.map((p) => p.library.length);
    resolveReturn(f);
    expect(f.state.decision?.actor).toBe("C");
    const view = observe(f.state, f.registry, "C");
    expect(view.decision?.kind).toBe("commander-replacement");
    for (const actor of ["A", "B", "D"])
      expect(observe(f.state, f.registry, actor).decision).toBeNull();
    expect(pendingReturn(f)).toMatchObject({
      source: { owner: "A", controller: "B" },
      controller: "B",
      pendingMovement: { before: { owner: "C", controller: "D" } },
    });
    answer(f, { kind: "commander-replacement", move: replace });
    expect(locate(f, "C", "commander")).toMatchObject({
      zone: replace ? "command" : "hand",
      controller: "C",
      owner: "C",
    });
    expect(locate(f, "A", "draw-spell").zone).toBe("graveyard");
    expect(f.state.players.map((p) => p.library.length)).toEqual(
      libraries.map((n, i) => n - (i === 1 ? 1 : 0)),
    );
    expect(f.state.events.find((e) => e.type === "CardDrawn")?.visibility).toEqual(["B"]);
  });

test("pass, cast, cancel, payment, mana and graveyard-SBA answers cannot interleave with a resolving owner choice", () => {
  const f = returnFixture(),
    target = putTarget(f);
  castReturn(f, target);
  resolveReturn(f);
  const before = canonicalJson(f.state);
  const illegal: Response[] = [
    { kind: "pass" },
    { kind: "cast", card: locate(f, "B", "counter").id },
    { kind: "cancel-cast" },
    { kind: "payment", sources: [], spend: emptyMana() },
    { kind: "mana", source: { object: locate(f, "B", "land").id, color: "U" } },
    { kind: "commander-zone", move: true },
  ];
  for (const response of illegal) {
    expect(transition(f.state, command(f, response), f.registry).status).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(before);
  }
  const valid = command(f, { kind: "commander-replacement", move: true });
  expect(transition(f.state, { ...valid, actor: "A" }, f.registry)).toMatchObject({
    code: "WrongDecisionOwner",
  });
  expect(transition(f.state, { ...valid, revision: valid.revision - 1 }, f.registry)).toMatchObject(
    { code: "StaleRevision" },
  );
  expect(canonicalJson(f.state)).toBe(before);
});

for (const replace of [false, true])
  test(`canonical replacement checkpoint resumes to the exact same state (${replace}) and stale core retries cannot repeat movement/draw`, () => {
    const f = returnFixture(),
      target = putTarget(f);
    castReturn(f, target);
    resolveReturn(f);
    const restored = {
      registry: f.registry,
      state: RulesState.parse(JSON.parse(canonicalJson(f.state))),
    };
    const input = command(f, { kind: "commander-replacement", move: replace });
    answer(f, input.response);
    answer(restored, input.response);
    expect(canonicalJson(restored.state)).toBe(canonicalJson(f.state));
    const before = canonicalJson(f.state);
    expect(transition(f.state, input, f.registry)).toMatchObject({
      status: "rejected",
      code: "StaleRevision",
    });
    expect(
      transition(
        f.state,
        { ...input, response: { kind: "commander-replacement", move: !replace } },
        f.registry,
      ),
    ).toMatchObject({ code: "StaleRevision" });
    expect(canonicalJson(f.state)).toBe(before);
    // Durable exact receipt/conflicting-command-ID semantics belong to Coordinator tests.
  });

test("tampered continuation source, program, target, cursor, owner and proposal fail before committing any resumed effects", () => {
  const base = returnFixture(),
    target = putTarget(base);
  castReturn(base, target);
  resolveReturn(base);
  const mutations: ((f: ReturnType<typeof returnFixture>) => void)[] = [
    (f) => {
      pendingReturn(f).sourceVersion = "b".repeat(64);
    },
    (f) => {
      pendingReturn(f).source.controller = "B";
    },
    (f) => {
      pendingReturn(f).controller = "B";
    },
    (f) => {
      pendingReturn(f).source.id = "missing-source";
    },
    (f) => {
      pendingReturn(f).program.effects = [{ kind: "return-to-hand" }];
    },
    (f) => {
      pendingReturn(f).target = "missing-target";
    },
    (f) => {
      pendingReturn(f).effectIndex = 1;
    },
    (f) => {
      pendingReturn(f).pendingMovement.before.generation++;
    },
    (f) => {
      pendingReturn(f).pendingMovement.before.owner = "A";
    },
    (f) => {
      pendingReturn(f).pendingMovement.id = "forged-proposal";
    },
    (f) => {
      pendingReturn(f).pendingMovement.proposedAtEvent++;
    },
    (f) => {
      Object.assign(pendingReturn(f).pendingMovement, { destination: "exile" });
    },
    (f) => {
      Object.assign(pendingReturn(f).pendingMovement, { competingReplacements: ["unknown"] });
    },
    (f) => {
      f.state.priorityPlayer = "A";
    },
    (f) => {
      if (f.state.decision) f.state.decision.actor = "A";
    },
    (f) => {
      const e = f.state.events.find((e) => e.type === "CommanderHandReplacementRequested");
      if (e) e.data.owner = "A";
    },
  ];
  for (const mutate of mutations) {
    const f = { registry: base.registry, state: structuredClone(base.state) };
    mutate(f);
    expect(() => assertInvariants(f.state, f.registry)).toThrow();
    const before = canonicalJson(f.state);
    expect(
      transition(f.state, command(f, { kind: "commander-replacement", move: true }), f.registry)
        .status,
    ).toBe("fault");
    expect(canonicalJson(f.state)).toBe(before);
  }
});

test("empty-library cantrip commits the chosen return, attempts draw, completes the spell, then loses at the checkpoint", () => {
  const f = returnFixture(),
    target = putTarget(f);
  for (const id of [...owner(f, "A").library])
    move(f.state, id, "hand", "constructed empty-library precondition");
  castReturn(f, target);
  resolveReturn(f);
  expect(owner(f, "A").drawnFromEmptyLibrary).toBe(false);
  expect(owner(f, "A").lost).toBe(false);
  answer(f, { kind: "commander-replacement", move: true });
  expect(locate(f, "B", "commander").zone).toBe("command");
  expect(eventIndex(f, "ReturnInstructionCompleted")).toBeLessThan(
    eventIndex(f, "DrawFromEmptyLibrary"),
  );
  expect(eventIndex(f, "DrawFromEmptyLibrary")).toBeLessThan(eventIndex(f, "SpellResolved"));
  expect(eventIndex(f, "SpellResolved")).toBeLessThan(eventIndex(f, "PlayersLostBatch"));
  expect(f.state.outcome).toMatchObject({ kind: "win", winner: "B" });
});

test("an illegal or new-incarnation target stops the entire return-and-draw before any owner replacement", () => {
  for (const reenter of [false, true]) {
    const f = returnFixture(),
      target = putTarget(f),
      library = owner(f, "A").library.length;
    castReturn(f, target);
    const hand = move(f.state, target, "hand", "constructed target departure");
    if (reenter) move(f.state, hand.id, "battlefield", "constructed different target incarnation");
    resolveReturn(f);
    expect(f.state.frames).toEqual([]);
    expect(owner(f, "A").library).toHaveLength(library);
    expect(f.state.events.some((e) => e.type === "SpellDidNotResolve")).toBe(true);
    expect(f.state.events.some((e) => e.type === "ReturnInstructionCompleted")).toBe(false);
  }
});

test("returning a trigger's source preserves its independently captured stack program and controller", () => {
  const f = returnFixture(false);
  cast(f, "A", "trigger-creature");
  resolveOne(f);
  const target = locate(f, "A", "trigger-creature"),
    trigger = structuredClone(f.state.stack[0]);
  if (!trigger) throw new Error("Missing captured trigger");
  const library = owner(f, "A").library.length;
  castReturn(f, target.id, "B");
  resolveOne(f);
  expect(f.state.stack).toEqual([trigger]);
  expect(locate(f, "A", "trigger-creature").zone).toBe("hand");
  resolveOne(f);
  expect(owner(f, "A").library).toHaveLength(library - 1);
});

for (const replace of [false, true])
  test(`commander destination ${replace ? "command" : "hand"} preserves previous command-zone casts and charges the correct later cost`, () => {
    const f = returnFixture(false);
    cast(f, "A", "commander");
    resolveOne(f);
    const commander = locate(f, "A", "commander"),
      lineage = commander.lineage;
    expect(owner(f, "A").commanderCasts[lineage]).toBe(1);
    castReturn(f, commander.id, "B");
    resolveReturn(f);
    answer(f, { kind: "commander-replacement", move: replace });
    const returned = locate(f, "A", "commander");
    expect(castCost(f.state, f.registry, returned.id).generic).toBe(replace ? 3 : 1);
    expect(owner(f, "A").commanderCasts[lineage]).toBe(1);
    cast(f, "A", "commander");
    expect(owner(f, "A").commanderCasts[lineage]).toBe(replace ? 2 : 1);
  });

test("return target protections distinguish own hexproof, opposing hexproof and shroud", () => {
  const f = returnFixture(false),
    own = putTarget(f, "A", false),
    enemy = putTarget(f, "B", false);
  const creature = f.registry.definitions.creature,
    source = f.registry.definitions["draw-spell"];
  if (!creature || !source?.spellProgram) throw new Error("Missing constructed programs");
  creature.keywords = ["hexproof"];
  expect(legalSpellTargets(f.state, f.registry, "A", source.spellProgram).cards).toEqual([own]);
  creature.keywords = ["shroud"];
  expect(legalSpellTargets(f.state, f.registry, "A", source.spellProgram).cards).toEqual([]);
  creature.keywords = [];
  castReturn(f, enemy);
  creature.keywords = ["hexproof"];
  resolveReturn(f);
  expect(f.state.objects[enemy]?.zone).toBe("battlefield");
  expect(f.state.events.some((e) => e.type === "SpellDidNotResolve")).toBe(true);
});

test("return and later reentry do not inherit old incarnation power, toughness or granted keywords", () => {
  const f = returnFixture(false),
    target = putTarget(f, "A", false);
  const modifier = f.registry.definitions["destroy-spell"];
  if (!modifier) throw new Error("Missing constructed modifier template");
  modifier.spellProgram = {
    schema: "commander-spell/1",
    target: "creature",
    effects: [
      {
        kind: "modify-creature",
        powerDelta: 3,
        toughnessDelta: 3,
        keywords: ["flying"],
        duration: "until-end-of-turn",
      },
    ],
  };
  cast(f, "A", "destroy-spell", target);
  resolveOne(f);
  expect(
    observe(f.state, f.registry, "A").objects.find((o) => o.id === target)?.characteristics,
  ).toEqual({ power: 5, toughness: 5, keywords: ["flying"] });
  castReturn(f, target);
  resolveReturn(f);
  const hand = locate(f, "A", "creature");
  expect(hand.id).not.toBe(target);
  expect(hand.zone).toBe("hand");
  expect(
    observe(f.state, f.registry, "A").objects.find((o) => o.id === hand.id)?.characteristics,
  ).toEqual({ power: 2, toughness: 2, keywords: [] });
  cast(f, "A", "creature");
  resolveOne(f);
  const entered = locate(f, "A", "creature");
  expect(entered.zone).toBe("battlefield");
  expect(entered.id).not.toBe(hand.id);
  expect(
    observe(f.state, f.registry, "A").objects.find((o) => o.id === entered.id)?.characteristics,
  ).toEqual({ power: 2, toughness: 2, keywords: [] });
  expect(f.state.continuousEffects[0]?.affectedObject).toBe(target);
});
