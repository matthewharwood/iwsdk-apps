import { expect, test } from "bun:test";
import {
  type CardDefinition,
  canonicalJson,
  RulesState,
  semanticHash,
  TokenTemplate,
} from "@iwsdk-apps/contracts";
import { answer, cast, command, locate, resolveOne } from "../test-fixtures/counterspells";
import { bonus, enter, replaceDefinition } from "../test-fixtures/static-bonus";
import { grant, keywordFixture } from "../test-fixtures/static-keywords";
import { createBatch, tokenFixture } from "../test-fixtures/tokens";
import { characteristics } from "./characteristics";
import { checkpoint } from "./checkpoints";
import { definition, move, object } from "./common";
import { legalSpellTargets } from "./effects";
import { admitDeck, assertInvariants, observe, transition } from "./index";
import { isStaticKeywordGrantPermanent } from "./permanent-programs";
import { selectedObjects } from "./selection";
import { givePriority } from "./turns";

// Every scenario below has synthetic programs, selected hands/board preconditions,
// and valid physical100-card inventories. None authenticates a printed card or is
// counted as an ordinary shuffled full game. Type/control mutations are explicit
// characteristic-prefix probes, not implemented type/control-changing effects.
const modes = ["full-scan", "prepared-scan", "prepared-indexed"] as const;
type Fixture = ReturnType<typeof keywordFixture>;
function keywords(f: Fixture, id: string) {
  return characteristics(f.state, f.registry, id).keywords;
}
function passes(f: Fixture, count = f.state.players.length) {
  for (let i = 0; i < count; i++) answer(f, { kind: "pass" });
}
function removal(f: Fixture, kind: "exile" | "return-to-hand", draw = false) {
  const spell = definition(f.registry, "draw-spell");
  spell.spellProgram = {
    schema: "commander-spell/1",
    target: "creature",
    effects: [
      { kind },
      ...(draw ? [{ kind: "draw" as const, recipient: "controller" as const, amount: 1 }] : []),
    ],
  };
}

for (const mode of modes) {
  test(`${mode}: inclusive live Sliver predicate grants self and own creatures, never intrinsic card metadata`, () => {
    const f = keywordFixture(mode);
    const source = enter(f, "protected-creature"),
      own = enter(f, "creature"),
      artifact = enter(f, "artifact-creature"),
      other = enter(f, "creature", "B"),
      nonSliver = enter(f, "enchantment-creature");
    for (const id of [source, own, artifact]) expect(keywords(f, id)).toEqual(["indestructible"]);
    for (const id of [other, nonSliver, locate(f, "B", "protected-creature").id])
      expect(keywords(f, id)).toEqual([]);
    const view = observe(f.state, f.registry, "B");
    expect(view.objects.find((o) => o.id === source)?.card?.keywords).toEqual([]);
    expect(view.objects.find((o) => o.id === own)?.characteristics.keywords).toEqual([
      "indestructible",
    ]);
    expect(f.state.continuousEffects).toEqual([]);
    assertInvariants(f.state, f.registry);
  });
  test(`${mode}: provider need not match its filter and control/subtype changes refine within one revision`, () => {
    const f = keywordFixture(mode, 4);
    const source = enter(f, "protected-creature"),
      own = enter(f, "creature"),
      other = enter(f, "creature", "C");
    const revision = f.state.revision;
    // Explicit prefix probe: the provider retains its program but is no longer a Sliver.
    definition(f.registry, "protected-creature").subtypes = ["Spirit"];
    expect(keywords(f, source)).toEqual([]);
    expect(keywords(f, own)).toEqual(["indestructible"]);
    object(f.state, source).controller = "C";
    expect(keywords(f, own)).toEqual([]);
    expect(keywords(f, other)).toEqual(["indestructible"]);
    object(f.state, other).controller = "D";
    expect(keywords(f, other)).toEqual([]);
    expect(object(f.state, source).owner).toBe("A");
    expect(f.state.revision).toBe(revision);
  });
  test(`${mode}: all-of Artifact Creature and color filters use prefix facts and exclusion is exact incarnation`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "protected-creature", {
      colors: ["R"],
      staticKeywordPrograms: [
        grant({ types: ["Artifact", "Creature"], subtype: null, color: "R", excludeSource: true }, [
          "haste",
        ]),
      ],
    });
    replaceDefinition(f, "artifact-creature", { colors: ["R", "U"] });
    replaceDefinition(f, "creature", { colors: ["R"] });
    const source = enter(f, "protected-creature"),
      artifact = enter(f, "artifact-creature"),
      creature = enter(f, "creature");
    expect(keywords(f, source)).toEqual([]);
    expect(keywords(f, artifact)).toEqual(["haste"]);
    expect(keywords(f, creature)).toEqual([]);
    definition(f.registry, "artifact-creature").colors = ["U"];
    expect(keywords(f, artifact)).toEqual([]);
    definition(f.registry, "artifact-creature").colors = ["R"];
    definition(f.registry, "artifact-creature").types = ["Artifact"];
    expect(keywords(f, artifact)).toEqual([]);
    definition(f.registry, "artifact-creature").types = ["Artifact", "Creature"];
    expect(keywords(f, artifact)).toEqual(["haste"]);
  });
  test(`${mode}: noncreature provider casts normally, grants only after entry, and cannot cast with granted flash in hand`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "protected-creature", {
      types: ["Enchantment"],
      typeLine: "Enchantment",
      power: null,
      toughness: null,
      staticKeywordPrograms: [grant({ subtype: null }, ["flash", "reach"])],
    });
    const target = enter(f, "creature");
    givePriority(f.state, f.registry, "B");
    const rejected = transition(
      f.state,
      command(f, { kind: "cast", card: locate(f, "B", "protected-creature").id }),
      f.registry,
    );
    expect(rejected.status).toBe("rejected");
    givePriority(f.state, f.registry, "A");
    cast(f, "A", "protected-creature");
    expect(keywords(f, target)).toEqual([]);
    resolveOne(f);
    const source = locate(f, "A", "protected-creature").id;
    expect(keywords(f, source)).toEqual([]);
    expect(keywords(f, target)).toEqual(["reach", "flash"]);
    expect(f.state.events.some((e) => e.type === "PermanentSpellResolved")).toBe(true);
  });
  test(`${mode}: every off-battlefield provider is inactive; return/recast creates a fresh live source`, () => {
    const f = keywordFixture(mode);
    const target = enter(f, "creature");
    for (const zone of ["hand", "graveyard", "exile", "command"] as const) {
      move(f.state, locate(f, "A", "protected-creature").id, zone, "constructed provider zone");
      expect(keywords(f, target)).toEqual([]);
    }
    move(f.state, locate(f, "A", "protected-creature").id, "hand", "constructed hand");
    givePriority(f.state, f.registry, "A");
    cast(f, "A", "protected-creature");
    resolveOne(f);
    const old = locate(f, "A", "protected-creature").id;
    expect(keywords(f, target)).toEqual(["indestructible"]);
    removal(f, "return-to-hand");
    cast(f, "B", "draw-spell", old);
    resolveOne(f);
    expect(keywords(f, target)).toEqual([]);
    cast(f, "A", "protected-creature");
    resolveOne(f);
    expect(locate(f, "A", "protected-creature").id).not.toBe(old);
    expect(f.state.objects[old]).toBeUndefined();
    expect(keywords(f, target)).toEqual(["indestructible"]);
  });
  test(`${mode}: destroy is prevented but exile, zero toughness and provider departure are not`, () => {
    const f = keywordFixture(mode);
    const source = enter(f, "protected-creature"),
      target = enter(f, "creature");
    object(f.state, target).damage = 2;
    object(f.state, target).deathtouchDamage = true;
    cast(f, "B", "destroy-spell", target);
    resolveOne(f);
    expect(f.state.objects[target]?.zone).toBe("battlefield");
    expect(f.state.objects[target]?.damage).toBe(2);
    removal(f, "exile", true);
    cast(f, "B", "draw-spell", source);
    resolveOne(f);
    expect(locate(f, "A", "protected-creature").zone).toBe("exile");
    expect(locate(f, "A", "creature").zone).toBe("graveyard");
    const events = f.state.events;
    expect(events.findIndex((e) => e.type === "CardDrawn")).toBeGreaterThanOrEqual(0);
    expect(events.findIndex((e) => e.type === "CreaturesDiedBatch")).toBeGreaterThan(
      events.findIndex((e) => e.type === "SpellResolved"),
    );
    expect(f.state.coverage["rule:704.5g"]).toBeGreaterThan(0);
    expect(f.state.coverage["rule:704.5h"] ?? 0).toBe(0);
  });
  test(`${mode}: simultaneous zero-toughness provider death precedes a second lethal-damage batch`, () => {
    const f = keywordFixture(mode);
    const source = enter(f, "protected-creature"),
      target = enter(f, "creature"),
      simultaneous = enter(f, "artifact-creature");
    object(f.state, source).counters["-1/-1"] = 5;
    object(f.state, simultaneous).counters["-1/-1"] = 2;
    object(f.state, target).damage = 2;
    f.state.events = [];
    checkpoint(f.state, f.registry);
    const batches = f.state.events.filter((e) => e.type === "CreaturesDiedBatch");
    expect(batches).toHaveLength(2);
    expect(batches[0]?.data.objects).toEqual(
      expect.arrayContaining([
        { before: source, after: locate(f, "A", "protected-creature").id },
        { before: simultaneous, after: locate(f, "A", "artifact-creature").id },
      ]),
    );
    expect(batches[1]?.data.objects).toEqual([
      { before: target, after: locate(f, "A", "creature").id },
    ]);
    expect(f.state.coverage["rule:704.5f"]).toBe(2);
    expect(f.state.coverage["rule:704.5g"]).toBe(1);
    assertInvariants(f.state, f.registry);
  });
  test(`${mode}: duplicate grants are redundant; one live provider remains after the other leaves`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "artifact-creature", {
      staticKeywordPrograms: [grant({}, ["lifelink", "indestructible"])],
    });
    const first = enter(f, "protected-creature"),
      second = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    expect(keywords(f, target)).toEqual(["lifelink", "indestructible"]);
    object(f.state, target).damage = 2;
    move(f.state, first, "exile", "constructed first provider departure");
    checkpoint(f.state, f.registry);
    expect(f.state.objects[target]).toBeDefined();
    move(f.state, second, "exile", "constructed second provider departure");
    checkpoint(f.state, f.registry);
    expect(f.state.objects[target]).toBeUndefined();
  });
  test(`${mode}: commander return choice preserves live grant until movement and completes draw before dependent death`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "commander", { subtypes: ["Sliver"], staticKeywordPrograms: [grant()] });
    const source = enter(f, "commander"),
      target = enter(f, "creature");
    object(f.state, target).damage = 2;
    removal(f, "return-to-hand", true);
    cast(f, "B", "draw-spell", source);
    passes(f);
    expect(f.state.decision?.kind).toBe("commander-replacement");
    expect(keywords(f, target)).toEqual(["indestructible"]);
    const checkpointState = RulesState.parse(JSON.parse(canonicalJson(f.state)));
    for (const moveToCommand of [false, true]) {
      const branch = { registry: f.registry, state: structuredClone(checkpointState) };
      answer(branch, { kind: "commander-replacement", move: moveToCommand });
      expect(locate(branch, "A", "commander").zone).toBe(moveToCommand ? "command" : "hand");
      expect(locate(branch, "A", "creature").zone).toBe("graveyard");
      const events = branch.state.events;
      expect(events.findIndex((e) => e.type === "CreaturesDiedBatch")).toBeGreaterThan(
        events.findIndex((e) => e.type === "SpellResolved"),
      );
      expect(events.some((e) => e.type === "CardDrawn")).toBe(true);
    }
  });
  test(`${mode}: grants are nontargeting while hexproof/shroud constrain future targets and resolution`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "protected-creature", {
      staticKeywordPrograms: [grant({}, ["hexproof"])],
    });
    const source = enter(f, "protected-creature"),
      target = enter(f, "creature");
    const program = definition(f.registry, "destroy-spell").spellProgram;
    if (!program) throw new Error("Missing constructed removal");
    expect(legalSpellTargets(f.state, f.registry, "A", program).cards).toContain(target);
    expect(legalSpellTargets(f.state, f.registry, "B", program).cards).not.toContain(target);
    move(f.state, source, "hand", "constructed removed defense");
    cast(f, "B", "destroy-spell", target);
    // Flash is intrinsic here, allowing a real response to the previously legal target.
    replaceDefinition(f, "protected-creature", {
      keywords: ["flash"],
      staticKeywordPrograms: [grant({}, ["shroud"])],
    });
    cast(f, "A", "protected-creature");
    resolveOne(f);
    expect(keywords(f, target)).toEqual(["shroud"]);
    expect(legalSpellTargets(f.state, f.registry, "A", program).cards).not.toContain(target);
    resolveOne(f);
    expect(f.state.objects[target]).toBeDefined();
    expect(f.state.events.some((e) => e.type === "SpellDidNotResolve")).toBe(true);
  });
  test(`${mode}: restore and same-revision reordering preserve detached observations and current keyword selectors`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "artifact-creature", {
      staticKeywordPrograms: [grant({}, ["haste", "flying"])],
    });
    enter(f, "protected-creature");
    enter(f, "artifact-creature");
    const target = enter(f, "creature");
    const before = observe(f.state, f.registry, "B");
    const query = { op: "set-has" as const, field: "keywords", value: "flying" };
    expect(selectedObjects(f.state, f.registry, query).map((o) => o.id)).toContain(target);
    f.state.objects = Object.fromEntries(Object.entries(f.state.objects).reverse());
    f.state = RulesState.parse(JSON.parse(canonicalJson(f.state)));
    expect(observe(f.state, f.registry, "B")).toEqual(before);
    const row = before.objects.find((o) => o.id === target);
    if (!row) throw new Error("Missing visible recipient");
    row.characteristics.keywords.length = 0;
    expect(keywords(f, target)).toEqual(["flying", "haste", "indestructible"]);
    assertInvariants(f.state, f.registry);
  });
  test(`${mode}: haste, vigilance, flying and lifelink grants feed ordinary combat with redundant lifelink once`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "protected-creature", {
      staticKeywordPrograms: [grant({}, ["haste", "vigilance", "flying", "lifelink"])],
    });
    replaceDefinition(f, "creature", { keywords: ["lifelink"] });
    enter(f, "protected-creature");
    const attacker = enter(f, "creature"),
      blocker = enter(f, "creature", "B");
    passes(f, 4);
    expect(f.state.decision?.kind).toBe("attack");
    answer(f, { kind: "attack", attacks: [{ attacker, defender: "B" }] });
    expect(object(f.state, attacker).tapped).toBe(false);
    passes(f);
    const invalid = transition(
      f.state,
      command(f, { kind: "block", blocks: [{ blocker, attacker }] }),
      f.registry,
    );
    expect(invalid.status).toBe("rejected");
    answer(f, { kind: "block", blocks: [] });
    passes(f);
    answer(f, { kind: "damage", allocations: [{ source: attacker, target: "B", amount: 2 }] });
    expect(f.state.players.find((p) => p.id === "A")?.life).toBe(42);
    expect(f.state.players.find((p) => p.id === "B")?.life).toBe(38);
  });
  test(`${mode}: matching token batch gains live indestructible without changing template or physical inventory`, async () => {
    const f = await tokenFixture({ power: 1, toughness: 1 });
    f.state.manifest.resolver = mode;
    if (mode !== "full-scan")
      f.state.manifest.preparedArtifactHash = f.registry.preparedArtifactHash = "f".repeat(64);
    const { id: oldId, ...payload } = f.template;
    payload.characteristics = {
      ...payload.characteristics,
      subtypes: ["Sliver"],
      name: "Sliver Token",
    };
    f.template = TokenTemplate.parse({
      ...payload,
      id: `token-template:${await semanticHash(payload)}`,
    });
    delete f.registry.tokenTemplates[oldId];
    f.registry.tokenTemplates[f.template.id] = f.template;
    const effect = definition(f.registry, "draw-spell").spellProgram?.effects[0];
    if (effect?.kind !== "create-token") throw new Error("Missing constructed token producer");
    effect.templateId = f.template.id;
    replaceDefinition(f, "creature", { subtypes: ["Sliver"], staticKeywordPrograms: [grant()] });
    const source = enter(f, "creature");
    const { tokens } = createBatch(f);
    expect(tokens).toHaveLength(2);
    for (const token of tokens) {
      expect(keywords(f, token.id)).toEqual(["indestructible"]);
      object(f.state, token.id).damage = 1;
    }
    checkpoint(f.state, f.registry);
    expect(tokens.every((t) => !!f.state.objects[t.id])).toBe(true);
    expect(f.template.characteristics.keywords).toEqual([]);
    expect(
      observe(f.state, f.registry, "B")
        .objects.filter((o) => o.tokenTemplate)
        .every((o) => o.card === null),
    ).toBe(true);
    expect(Object.values(f.state.objects).filter((o) => !o.token)).toHaveLength(200);
    move(f.state, source, "exile", "constructed token provider departure");
    checkpoint(f.state, f.registry);
    expect(tokens.every((t) => !f.state.objects[t.id])).toBe(true);
    expect(f.state.events.some((e) => e.type === "TokensCeased")).toBe(true);
    assertInvariants(f.state, f.registry);
  });
}

test("permanent admission rejects mixed programs, unsupported source mechanics and malformed grant filters", () => {
  const f = keywordFixture();
  const original = structuredClone(definition(f.registry, "protected-creature"));
  const mixed: Partial<CardDefinition>[] = [
    { staticPrograms: [bonus()] },
    { triggerPrograms: definition(f.registry, "trigger-creature").triggerPrograms },
    { spellProgram: definition(f.registry, "draw-spell").spellProgram },
    { subtypes: ["Aura"] },
    { manaAbilities: ["U"] },
    { types: ["Land"] },
    { types: ["Artifact"], power: 1, toughness: 1 },
  ];
  for (const changes of mixed) {
    const changed = { ...original, ...changes };
    expect(isStaticKeywordGrantPermanent(changed)).toBe(false);
    f.registry.definitions[original.id] = changed;
    for (const seat of f.state.manifest.seats)
      expect(() => admitDeck(seat.deck, f.registry)).toThrow();
  }
  f.registry.definitions[original.id] = original;
});

for (const mode of modes) {
  test(`${mode}: any-controller grants include opposing creatures, survive control changes, and end with the live source`, () => {
    const f = keywordFixture(mode, 4);
    replaceDefinition(f, "protected-creature", {
      staticKeywordPrograms: [grant({ controller: "any" }, ["haste"])],
    });
    replaceDefinition(f, "artifact-creature", {
      staticKeywordPrograms: [grant({ controller: "any", excludeSource: true }, ["flying"])],
    });
    const source = enter(f, "protected-creature"),
      own = enter(f, "creature"),
      opposing = enter(f, "creature", "C"),
      second = enter(f, "artifact-creature", "B");
    for (const id of [source, own, opposing]) expect(keywords(f, id)).toEqual(["flying", "haste"]);
    expect(keywords(f, second)).toEqual(["haste"]);
    object(f.state, source).controller = "D";
    object(f.state, opposing).controller = "B";
    expect(keywords(f, opposing)).toEqual(["flying", "haste"]);
    move(f.state, source, "exile", "constructed global provider departure");
    expect(keywords(f, opposing)).toEqual(["flying"]);
    move(f.state, second, "graveyard", "constructed other provider departure");
    expect(keywords(f, opposing)).toEqual([]);
  });
  test(`${mode}: foreign-owned provider leaving with its owner removes the living controller's protection`, () => {
    const f = keywordFixture(mode, 4);
    const source = enter(f, "protected-creature"),
      target = enter(f, "creature", "B");
    object(f.state, source).controller = "B";
    object(f.state, target).damage = 2;
    expect(keywords(f, target)).toEqual(["indestructible"]);
    const departing = f.state.players.find((p) => p.id === "A");
    if (!departing) throw new Error("Missing departing owner");
    departing.life = 0;
    checkpoint(f.state, f.registry);
    expect(f.state.objects[source]).toBeUndefined();
    expect(locate(f, "B", "creature").zone).toBe("graveyard");
    expect(f.state.players.find((p) => p.id === "B")?.lost).toBe(false);
    expect(f.state.outcome.kind).toBe("ongoing");
  });
}

for (const mode of modes) {
  test(`${mode}: indestructible grant is nontargeting on intrinsic shroud and does not prevent zero toughness after a separate layer7c provider leaves`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "creature", { keywords: ["shroud"], toughness: 0 });
    replaceDefinition(f, "artifact-creature", {
      types: ["Creature"],
      typeLine: "Creature",
      staticPrograms: [bonus({ powerDelta: 0, toughnessDelta: 1 })],
    });
    enter(f, "protected-creature");
    const bonusSource = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    expect(characteristics(f.state, f.registry, target)).toEqual({
      power: 2,
      toughness: 1,
      keywords: ["shroud", "indestructible"],
    });
    checkpoint(f.state, f.registry);
    expect(f.state.objects[target]).toBeDefined();
    move(f.state, bonusSource, "exile", "constructed layer7c provider departure");
    checkpoint(f.state, f.registry);
    expect(locate(f, "A", "creature").zone).toBe("graveyard");
    expect(f.state.coverage["rule:704.5f"]).toBe(1);
  });
  test(`${mode}: unresolved duplicate-legend selection remains explicit and commits no partial keyword/SBA result`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "protected-creature", { supertypes: ["Legendary"] });
    enter(f, "protected-creature");
    const other = enter(f, "protected-creature", "B");
    object(f.state, other).controller = "A";
    const before = canonicalJson(f.state);
    const result = transition(f.state, command(f, { kind: "pass" }), f.registry);
    expect(result.status).toBe("unsupported");
    expect(canonicalJson(f.state)).toBe(before);
  });
}
