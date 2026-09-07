import { expect, spyOn, test } from "bun:test";
import { canonicalJson, type Response, RulesState } from "@iwsdk-apps/contracts";
import { answer, cast, command, locate, resolveOne } from "../test-fixtures/counterspells";
import { bonus, enter, replaceDefinition, staticFixture } from "../test-fixtures/static-bonus";
import { createBatch, tokenFixture } from "../test-fixtures/tokens";
import { priorityCards } from "./casting";
import { characteristics } from "./characteristics";
import { checkpoint } from "./checkpoints";
import { definition, move, object, player } from "./common";
import { legalSpellTargets } from "./effects";
import { admitDeck, assertInvariants, observe, transition } from "./index";
import { selectedObjects } from "./selection";
import { preLayer7cObject } from "./static-bonus";
import * as entry from "./triggers";
import { enterBattlefield } from "./triggers";
import { finishCleanup, givePriority } from "./turns";

type F = ReturnType<typeof staticFixture>;
function stats(f: F, id: string) {
  return characteristics(f.state, f.registry, id);
}
function resolveToChoice(f: F) {
  for (let i = 0; i < f.state.players.length && f.state.decision?.kind === "priority"; i++)
    answer(f, { kind: "pass" });
}
function setResponse(f: F, response: Response) {
  return transition(f.state, command(f, response), f.registry);
}

for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`${mode}: legendary predicate excludes exact source; keyword abilities are intrinsic, not granted`, () => {
    const f = staticFixture(mode);
    replaceDefinition(f, "artifact-creature", {
      supertypes: ["Legendary"],
      power: 2,
      toughness: 2,
    });
    const source = enter(f, "commander"),
      legendary = enter(f, "artifact-creature"),
      soldier = enter(f, "creature");
    expect(stats(f, source)).toEqual({
      power: 3,
      toughness: 3,
      keywords: ["deathtouch", "lifelink"],
    });
    expect(stats(f, legendary)).toEqual({ power: 4, toughness: 4, keywords: [] });
    expect(stats(f, soldier).power).toBe(1);
    const shown = observe(f.state, f.registry, "B");
    expect(shown.objects.find((o) => o.id === legendary)?.card?.power).toBe(2);
    expect(shown.objects.find((o) => o.id === legendary)?.characteristics.power).toBe(4);
    expect(f.state.continuousEffects).toEqual([]);
    assertInvariants(f.state, f.registry);
  });
  test(`${mode}: all/subtype predicates and live controller work for multitype objects with no stale per-revision cache`, () => {
    const f = staticFixture(mode, 4);
    replaceDefinition(f, "protected-creature", {
      staticPrograms: [
        bonus({
          predicate: { kind: "subtype", subtype: "Soldier" },
          powerDelta: 0,
          toughnessDelta: 1,
        }),
      ],
    });
    replaceDefinition(f, "artifact-creature", {
      subtypes: ["Human", "Soldier"],
      power: 2,
      toughness: 3,
    });
    const source = enter(f, "protected-creature"),
      target = enter(f, "artifact-creature"),
      enemy = enter(f, "creature", "C");
    const revision = f.state.revision;
    expect(stats(f, target).toughness).toBe(4);
    object(f.state, source).controller = "C";
    expect(stats(f, target).toughness).toBe(3);
    expect(stats(f, enemy).toughness).toBe(2);
    expect(f.state.revision).toBe(revision);
    const query = {
      op: "and" as const,
      terms: [
        { op: "set-has" as const, field: "subtypes", value: "Soldier" },
        { op: "string-eq" as const, field: "zone", value: "battlefield" },
      ],
    };
    expect(
      selectedObjects(f.state, f.registry, query)
        .map((o) => o.id)
        .sort(),
    ).toEqual([source, target, enemy].sort());
  });
  test(`${mode}: canonical restore/reordered dictionaries retain the same additive result and detached observations`, () => {
    const f = staticFixture(mode);
    replaceDefinition(f, "protected-creature", { staticPrograms: [bonus()] });
    const one = enter(f, "protected-creature"),
      two = enter(f, "enchantment-creature"),
      target = enter(f, "creature");
    const expected = observe(f.state, f.registry, "B");
    f.state.objects = Object.fromEntries(Object.entries(f.state.objects).reverse());
    expect(stats(f, target)).toEqual({ power: 3, toughness: 3, keywords: [] });
    expect(stats(f, one).power).toBe(3);
    expect(stats(f, two).power).toBeNull();
    const restored = RulesState.parse(JSON.parse(canonicalJson(f.state)));
    expect(observe(restored, f.registry, "B")).toEqual(expected);
    const targetView = expected.objects.find((o) => o.id === target);
    if (!targetView) throw new Error("Missing public target");
    targetView.characteristics.power = 999;
    expect(stats(f, target).power).toBe(3);
    assertInvariants(restored, f.registry);
  });
}

test("inclusive Sliver bonus buffs the source and distinct matching incarnations, not unrelated creatures", () => {
  const f = staticFixture();
  replaceDefinition(f, "protected-creature", {
    power: 1,
    toughness: 1,
    subtypes: ["Sliver"],
    staticPrograms: [
      bonus({ excludeSource: false, predicate: { kind: "subtype", subtype: "Sliver" } }),
    ],
  });
  replaceDefinition(f, "artifact-creature", { subtypes: ["Sliver"], power: 3, toughness: 3 });
  const source = enter(f, "protected-creature"),
    other = enter(f, "artifact-creature"),
    non = enter(f, "creature");
  expect(stats(f, source).power).toBe(2);
  expect(stats(f, other).power).toBe(4);
  expect(stats(f, non).power).toBe(1);
});
test("a spell or a source in any nonbattlefield zone has no contribution, and no LKI bonus survives removal", () => {
  const f = staticFixture();
  const target = enter(f, "creature");
  for (const zone of ["hand", "graveyard", "exile", "command"] as const) {
    const source = locate(f, "A", "protected-creature");
    if (source.zone !== zone) move(f.state, source.id, zone, "constructed off-battlefield source");
    expect(stats(f, target).toughness).toBe(1);
  }
  move(f.state, locate(f, "A", "protected-creature").id, "hand", "constructed source in hand");
  givePriority(f.state, f.registry, "A");
  cast(f, "A", "protected-creature");
  expect(stats(f, target).toughness).toBe(1);
  resolveOne(f);
  expect(stats(f, target).toughness).toBe(2);
  move(
    f.state,
    locate(f, "A", "protected-creature").id,
    "graveyard",
    "constructed source departure",
  );
  expect(stats(f, target).toughness).toBe(1);
});
test("a genuine entry boundary sees toughness bonus before trigger observation and the first SBA", () => {
  const f = staticFixture();
  enter(f, "protected-creature");
  replaceDefinition(f, "artifact-creature", { power: 8, toughness: 0, keywords: ["trample"] });
  const snapshots: number[] = [];
  const original = entry.recordBattlefieldEntryBatch;
  const spy = spyOn(entry, "recordBattlefieldEntryBatch").mockImplementation(
    (state, registry, ids, cause) => {
      for (const id of ids) snapshots.push(characteristics(state, registry, id).toughness ?? -1);
      original(state, registry, ids, cause);
    },
  );
  try {
    cast(f, "A", "artifact-creature");
    resolveOne(f);
  } finally {
    spy.mockRestore();
  }
  const force = locate(f, "A", "artifact-creature");
  expect(force.zone).toBe("battlefield");
  expect(stats(f, force.id).toughness).toBe(1);
  expect(snapshots).toEqual([1]);
});
test("new token siblings receive live bonuses as they enter without rewriting their printed template", async () => {
  const f = await tokenFixture({ power: 1, toughness: 1 });
  replaceDefinition(f, "creature", { staticPrograms: [bonus({ excludeSource: false })] });
  enter(f, "creature");
  const snapshots: number[][] = [];
  const original = entry.recordBattlefieldEntryBatch;
  const spy = spyOn(entry, "recordBattlefieldEntryBatch").mockImplementation(
    (state, registry, ids, cause) => {
      snapshots.push(ids.map((id) => characteristics(state, registry, id).power ?? -1));
      original(state, registry, ids, cause);
    },
  );
  try {
    createBatch(f);
  } finally {
    spy.mockRestore();
  }
  expect(snapshots).toEqual([[2, 2]]);
  const tokens = Object.values(f.state.objects).filter((o) => o.token);
  expect(tokens).toHaveLength(2);
  expect(tokens.every((t) => characteristics(f.state, f.registry, t.id).toughness === 2)).toBe(
    true,
  );
  expect(f.template.characteristics.power).toBe(1);
  expect(
    observe(f.state, f.registry, "B")
      .objects.filter((o) => o.tokenTemplate)
      .every((o) => o.card === null),
  ).toBe(true);
});
test("simultaneous source death uses a captured batch; newly zero-toughness dependent dies on the next pass", () => {
  const f = staticFixture();
  const lord = enter(f, "protected-creature");
  replaceDefinition(f, "artifact-creature", { power: 8, toughness: 0 });
  const dependent = enter(f, "artifact-creature");
  object(f.state, lord).damage = 2;
  f.state.events = [];
  checkpoint(f.state, f.registry);
  const batches = f.state.events.filter((e) => e.type === "CreaturesDiedBatch");
  expect(batches).toHaveLength(2);
  expect(batches[0]?.data.objects).toEqual([
    { before: lord, after: locate(f, "A", "protected-creature").id },
  ]);
  expect(batches[1]?.data.objects).toEqual([
    { before: dependent, after: locate(f, "A", "artifact-creature").id },
  ]);
  expect(f.state.coverage["rule:704.5f"]).toBe(1);
  expect(f.state.coverage["rule:704.5g"]).toBe(1);
});
test("same-batch death reasons do not change when an earlier enumerated provider leaves", () => {
  const f = staticFixture();
  replaceDefinition(f, "creature", {
    power: 2,
    toughness: 2,
    staticPrograms: [bonus({ powerDelta: 0, toughnessDelta: 1 })],
  });
  delete definition(f.registry, "protected-creature").staticPrograms;
  replaceDefinition(f, "protected-creature", { power: 1, toughness: 0 });
  const source = enter(f, "creature");
  const target = enter(f, "protected-creature");
  // Canonical object IDs put this provider first; both die to lethal damage in the
  // same pre-batch view. Removing it must not relabel the later death as zero toughness.
  expect(source < target).toBe(true);
  object(f.state, source).damage = 2;
  object(f.state, target).damage = 1;
  const before = f.state.coverage["rule:704.5f"] ?? 0;
  checkpoint(f.state, f.registry);
  expect(f.state.coverage["rule:704.5f"] ?? 0).toBe(before);
  expect(f.state.coverage["rule:704.5g"]).toBe(2);
});
test("destroying a provider can kill a previously nonlethally damaged token, which then ceases", async () => {
  const f = await tokenFixture({ power: 1, toughness: 1 });
  replaceDefinition(f, "creature", { staticPrograms: [bonus()] });
  const source = enter(f, "creature");
  const { tokens } = createBatch(f);
  for (const token of tokens) object(f.state, token.id).damage = 1;
  cast(f, "B", "destroy-spell", source);
  resolveOne(f);
  expect(tokens.every((t) => !f.state.objects[t.id])).toBe(true);
  expect(f.state.events.some((e) => e.type === "TokensCeased")).toBe(true);
});
test("commander replacement suspends before source cessation; bounce then draw completes before dependent death", () => {
  const f = staticFixture();
  replaceDefinition(f, "artifact-creature", { supertypes: ["Legendary"], power: 2, toughness: 2 });
  const source = enter(f, "commander"),
    dependent = enter(f, "artifact-creature");
  object(f.state, dependent).damage = 2;
  const spell = definition(f.registry, "draw-spell");
  spell.spellProgram = {
    schema: "commander-spell/1",
    target: "creature",
    effects: [{ kind: "return-to-hand" }, { kind: "draw", recipient: "controller", amount: 1 }],
  };
  cast(f, "B", "draw-spell", source);
  resolveToChoice(f);
  expect(f.state.decision?.kind).toBe("commander-replacement");
  expect(stats(f, dependent).toughness).toBe(4);
  const snapshot = RulesState.parse(JSON.parse(canonicalJson(f.state)));
  for (const choose of [false, true]) {
    const branch = { ...f, state: structuredClone(snapshot) };
    answer(branch, { kind: "commander-replacement", move: choose });
    const events = branch.state.events;
    expect(locate(branch, "A", "commander").zone).toBe(choose ? "command" : "hand");
    expect(locate(branch, "A", "artifact-creature").zone).toBe("graveyard");
    const drawIndex = events.findIndex((e) => e.type === "CardDrawn");
    const deathIndex = events.findIndex((e) => e.type === "CreaturesDiedBatch");
    expect(drawIndex).toBeGreaterThanOrEqual(0);
    expect(deathIndex).toBeGreaterThan(drawIndex);
  }
});
test("ordinary non-Aura enchantments resolve under main timing and are valid only in noncreature counter domains", () => {
  const f = staticFixture();
  const source = cast(f, "A", "enchantment-creature");
  expect(
    legalSpellTargets(
      f.state,
      f.registry,
      "A",
      {
        schema: "commander-spell/1",
        target: "noncreature-spell",
        effects: [{ kind: "counter" }],
      },
      locate(f, "B", "noncreature-counter").id,
    ).cards,
  ).toContain(source);
  expect(
    legalSpellTargets(
      f.state,
      f.registry,
      "A",
      {
        schema: "commander-spell/1",
        target: "creature-spell",
        effects: [{ kind: "counter" }],
      },
      locate(f, "B", "creature-counter").id,
    ).cards,
  ).not.toContain(source);
  resolveOne(f);
  const permanent = locate(f, "A", "enchantment-creature");
  expect(permanent.zone).toBe("battlefield");
  expect(stats(f, permanent.id).power).toBeNull();
  expect(f.state.events.some((e) => e.type === "PermanentSpellResolved")).toBe(true);
  const creatureTarget = {
    schema: "commander-spell/1" as const,
    target: "creature" as const,
    effects: [{ kind: "destroy" as const }],
  };
  expect(legalSpellTargets(f.state, f.registry, "A", creatureTarget).cards).not.toContain(
    permanent.id,
  );
});
test("flash enables an enchantment during another player's priority; ordinary enchantment stays unavailable", () => {
  const f = staticFixture();
  const source = locate(f, "B", "enchantment-creature");
  givePriority(f.state, f.registry, "B");
  expect(priorityCards(f.state, f.registry, "B")).not.toContain(source.id);
  replaceDefinition(f, "enchantment-creature", { keywords: ["flash"] });
  expect(priorityCards(f.state, f.registry, "B")).toContain(source.id);
  cast(f, "B", "enchantment-creature");
  resolveOne(f);
  expect(locate(f, "B", "enchantment-creature").zone).toBe("battlefield");
});
test("duplicate legendary enchantments fail explicitly and transition commits no convenient partial SBA result", () => {
  const f = staticFixture();
  replaceDefinition(f, "enchantment-creature", { supertypes: ["Legendary"] });
  enter(f, "enchantment-creature");
  const other = enter(f, "enchantment-creature", "B");
  object(f.state, other).controller = "A";
  const before = canonicalJson(f.state);
  const result = setResponse(f, { kind: "pass" });
  expect(result.status).toBe("unsupported");
  expect(canonicalJson(f.state)).toBe(before);
  expect(() => checkpoint(f.state, f.registry)).toThrow("Legend-rule selection");
});
test("static-only noncreature admission rejects Aura, extra trigger/spell programs, multi-program and invalid layers", () => {
  for (const change of [
    { subtypes: ["Aura"] },
    { types: ["Artifact"] },
    { staticPrograms: [] },
    { staticPrograms: [{ ...bonus(), layer: "7b" }] },
    { staticPrograms: [bonus(), bonus()] },
    {
      spellProgram: {
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
      },
    },
  ]) {
    const f = staticFixture();
    Object.assign(definition(f.registry, "enchantment-creature"), change);
    const seat = f.state.manifest.seats.at(0);
    if (!seat) throw new Error("Missing scenario seat");
    expect(() => admitDeck(seat.deck, f.registry)).toThrow();
  }
});
test("source owner's departure ends a bonus under another current controller without persisting its snapshot", () => {
  const f = staticFixture("full-scan", 4);
  const source = enter(f, "protected-creature");
  object(f.state, source).controller = "B";
  const target = enter(f, "creature", "B");
  expect(stats(f, target).toughness).toBe(2);
  player(f.state, "A").life = 0;
  checkpoint(f.state, f.registry);
  expect(f.state.objects[source]).toBeUndefined();
  expect(stats(f, target).toughness).toBe(1);
});
test("prefix lens never reads derived power and bounded source predicate observes current intrinsic subtype", () => {
  const f = staticFixture();
  const id = enter(f, "protected-creature");
  const prefix = preLayer7cObject(f.registry, object(f.state, id));
  expect(prefix).not.toHaveProperty("power");
  expect(prefix).not.toHaveProperty("toughness");
  expect(prefix.staticPrograms).toHaveLength(1);
  expect(prefix.controller).toBe("A");
});

test("later entry and fresh zone incarnation receive static contributions without inheriting resolved targeted modifiers", () => {
  const f = staticFixture();
  enter(f, "protected-creature");
  const target = enter(f, "creature");
  object(f.state, target).counters["+1/+1"] = 1;
  definition(f.registry, "draw-spell").spellProgram = {
    schema: "commander-spell/1",
    target: "creature",
    effects: [
      {
        kind: "modify-creature",
        powerDelta: 3,
        toughnessDelta: 3,
        keywords: [],
        duration: "until-end-of-turn",
      },
    ],
  };
  cast(f, "A", "draw-spell", target);
  resolveOne(f);
  expect(stats(f, target)).toEqual({ power: 5, toughness: 6, keywords: [] });
  f.state.step = "cleanup";
  f.state.decision = null;
  finishCleanup(f.state, f.registry);
  expect(stats(f, target)).toEqual({ power: 2, toughness: 3, keywords: [] });
  const hand = move(f.state, target, "hand", "constructed leave and reentry");
  const [fresh] = enterBattlefield(
    f.state,
    f.registry,
    [{ objectId: hand.id, controller: "A" }],
    "constructed fresh entry",
  );
  if (!fresh) throw new Error("Missing fresh incarnation");
  expect(fresh).not.toBe(target);
  expect(stats(f, fresh)).toEqual({ power: 1, toughness: 2, keywords: [] });
  expect(object(f.state, fresh).counters).toEqual({});
});
test("simultaneous provider and zero-toughness recipient entry sees the whole committed batch", () => {
  const f = staticFixture();
  replaceDefinition(f, "artifact-creature", { power: 8, toughness: 0 });
  const incoming = ["artifact-creature", "protected-creature"].map((id) => ({
    objectId: locate(f, "A", id).id,
    controller: "A",
  }));
  const entered = enterBattlefield(
    f.state,
    f.registry,
    incoming,
    "constructed simultaneous provider entry",
  );
  checkpoint(f.state, f.registry);
  expect(entered.every((id) => object(f.state, id).zone === "battlefield")).toBe(true);
  expect(stats(f, locate(f, "A", "artifact-creature").id).toughness).toBe(1);
});
test("a normal enchantment can be countered before becoming a provider", () => {
  const f = staticFixture();
  const target = enter(f, "creature");
  const source = cast(f, "A", "enchantment-creature");
  cast(f, "B", "noncreature-counter", source);
  resolveOne(f);
  expect(locate(f, "A", "enchantment-creature").zone).toBe("graveyard");
  expect(stats(f, target).power).toBe(1);
  expect(f.state.events.some((e) => e.type === "PermanentSpellResolved")).toBe(false);
});

test("combat damage domain recomputes after a Soldier provider is destroyed after blocks", () => {
  const f = staticFixture();
  replaceDefinition(f, "protected-creature", {
    staticPrograms: [
      bonus({
        predicate: { kind: "subtype", subtype: "Soldier" },
        powerDelta: 1,
        toughnessDelta: 0,
      }),
    ],
  });
  const source = enter(f, "protected-creature"),
    attacker = enter(f, "creature"),
    blocker = enter(f, "creature", "B");
  f.state.combat.attacks = [{ attacker, defender: "B" }];
  f.state.combat.blocks = [{ attacker, blocker }];
  f.state.combat.blocked = [attacker];
  f.state.step = "blockers";
  givePriority(f.state, f.registry, "A");
  expect(stats(f, attacker).power).toBe(2);
  cast(f, "B", "destroy-spell", source);
  resolveOne(f);
  resolveToChoice(f);
  expect(f.state.decision?.kind).toBe("damage");
  expect(f.state.decision?.damageDomain.find((d) => d.source === attacker)?.power).toBe(1);
  answer(f, { kind: "damage", allocations: [{ source: attacker, target: blocker, amount: 1 }] });
  answer(f, { kind: "damage", allocations: [{ source: blocker, target: attacker, amount: 1 }] });
  expect(locate(f, "A", "creature").zone).toBe("graveyard");
  expect(locate(f, "B", "creature").zone).toBe("graveyard");
});
test("intrinsic lifelink and commander combat damage remain on the static source itself", () => {
  const f = staticFixture();
  const source = enter(f, "commander");
  const lineage = object(f.state, source).lineage;
  f.state.combat.attacks = [{ attacker: source, defender: "B" }];
  f.state.step = "blockers";
  givePriority(f.state, f.registry, "A");
  resolveToChoice(f);
  expect(f.state.decision?.damageDomain[0]?.power).toBe(3);
  answer(f, { kind: "damage", allocations: [{ source, target: "B", amount: 3 }] });
  expect(player(f.state, "A").life).toBe(43);
  expect(player(f.state, "B").life).toBe(37);
  expect(player(f.state, "B").commanderDamage[lineage]).toBe(3);
});
