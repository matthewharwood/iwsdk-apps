import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  canonicalJson,
  DamageStaticProgram,
  semanticHash,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/damage-replacement.json";
import {
  bindDamageReplacementPermanent,
  DAMAGE_REPLACEMENT_PERMANENTS,
  DAMAGE_REPLACEMENT_RESEARCH_HASH,
  DAMAGE_REPLACEMENT_VERSION,
  reviewedDamageReplacementDefinition,
} from "./damage-replacement";
import { bindDevelopmentCard } from "./index";

const records = fixture.records.map((row) => CatalogCardSchema.parse(row));
const previousOptions = {
  strictProctorTriggers: true,
  conditionalSelfEntryTriggers: true,
  entryObserverTriggers: true,
  staticBonusPermanents: true,
  fixedTokenSpells: true,
  creatureReturnSpells: true,
  counterSpells: true,
  spellFamilies: true,
  selfEntryTriggers: true,
  selfEntrySequences: true,
  temporaryCreatureSpells: true,
  keywordReminders: true,
};
const options = { ...previousOptions, damageReplacementPermanents: true };
const names = [
  "Furnace of Rath",
  "Dictate of the Twin Gods",
  "Benevolent Unicorn",
  "Urza's Armor",
  "Excruciator",
];
function source(name: string): CatalogCard {
  const found = records.find((row) => row.oracle.name === name);
  if (!found) throw new Error(`Missing full source ${name}`);
  return structuredClone(found);
}
function bound(name: string): CardDefinition {
  const card = bindDamageReplacementPermanent(source(name));
  if (!card) throw new Error(`Missing exact binding ${name}`);
  return card;
}
const expectations = [
  {
    name: "Furnace of Rath",
    cost: { generic: 1, W: 0, U: 0, B: 0, R: 3, G: 0, C: 0 },
    type: "Enchantment",
    subtypes: [],
    power: null,
    toughness: null,
    keywords: [],
    kind: "replacement",
    source: "any",
    recipient: "permanent-or-player",
    operation: { kind: "multiply", factor: 2 },
  },
  {
    name: "Dictate of the Twin Gods",
    cost: { generic: 3, W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 },
    type: "Enchantment",
    subtypes: [],
    power: null,
    toughness: null,
    keywords: ["flash"],
    kind: "replacement",
    source: "any",
    recipient: "permanent-or-player",
    operation: { kind: "multiply", factor: 2 },
  },
  {
    name: "Benevolent Unicorn",
    cost: { generic: 1, W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 },
    type: "Creature",
    subtypes: ["Unicorn"],
    power: 1,
    toughness: 2,
    keywords: [],
    kind: "replacement",
    source: "spell",
    recipient: "permanent-or-player",
    operation: { kind: "subtract", amount: 1 },
  },
  {
    name: "Urza's Armor",
    cost: { generic: 6, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    type: "Artifact",
    subtypes: [],
    power: null,
    toughness: null,
    keywords: [],
    kind: "prevention",
    source: "any",
    recipient: "source-controller",
    amount: 1,
  },
  {
    name: "Excruciator",
    cost: { generic: 6, W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 },
    type: "Creature",
    subtypes: ["Avatar"],
    power: 7,
    toughness: 7,
    keywords: [],
    kind: "damage-cannot-be-prevented",
    source: "this",
  },
];

test("five full damage sources retain exact raw provenance and typed replacement/prevention/cannot-prevent distinctions", async () => {
  const { hash, ...body } = fixture;
  expect(await semanticHash(body)).toBe(hash);
  expect(fixture.researchManifestSha256).toBe(DAMAGE_REPLACEMENT_RESEARCH_HASH);
  expect(records).toHaveLength(24);
  expect(fixture.proposed).toHaveLength(5);
  expect(fixture.rulings).toHaveLength(16);
  expect(DAMAGE_REPLACEMENT_PERMANENTS).toHaveLength(5);
  for (const expected of expectations) {
    const input = source(expected.name);
    const card = bound(expected.name);
    expect(await semanticHash(input.oracle)).toBe(input.versionHash);
    expect(bindDevelopmentCard(input, previousOptions).kind).toBe("unsupported");
    expect(bindDevelopmentCard(input, options)).toEqual({
      kind: "bound",
      definition: card,
      recipes: [DAMAGE_REPLACEMENT_VERSION],
    });
    expect(card).toMatchObject({
      id: `oracle:${input.identity}`,
      oracleId: input.identity,
      sourceVersion: input.versionHash,
      name: expected.name,
      oracleText: input.oracle.oracle_text,
      typeLine: input.oracle.type_line,
      types: [expected.type],
      subtypes: expected.subtypes,
      supertypes: [],
      manaCost: expected.cost,
      power: expected.power,
      toughness: expected.toughness,
      keywords: expected.keywords,
      colors: input.oracle.colors,
      colorIdentity: input.oracle.color_identity,
      manaAbilities: [],
      deckLimit: 1,
      commanderEligible: false,
    });
    expect(card.manaValue).toBe(Object.values(expected.cost).reduce((sum, n) => sum + n, 0));
    const program = {
      schema: "commander-damage-static/1",
      id: `damage-static:${input.identity}:0`,
      sourceZone: "battlefield",
      kind: expected.kind,
      source: expected.source,
      ...(expected.kind === "damage-cannot-be-prevented"
        ? {}
        : { priority: "ordinary", recipient: expected.recipient }),
      ...("operation" in expected ? { operation: expected.operation } : {}),
      ...("amount" in expected ? { amount: expected.amount } : {}),
    };
    expect(card.damagePrograms).toEqual([DamageStaticProgram.parse(program)]);
    expect(DamageStaticProgram.safeParse(program).success).toBe(true);
    expect(card.spellProgram).toBeUndefined();
    expect(card.triggerPrograms).toBeUndefined();
    expect(card.staticPrograms).toBeUndefined();
    expect(reviewedDamageReplacementDefinition(card)).toBe(true);
    const proof = fixture.proofs.find((row) => row.identity === input.identity);
    expect(proof?.archiveHash).toBe(input.sourceArchiveHash);
    expect(proof?.ordinal).toBe(input.sourceOrdinal);
  }
  expect(source("Furnace of Rath").oracle.keywords).toEqual(["Double"]);
  expect(source("Dictate of the Twin Gods").oracle.keywords).toEqual(["Flash", "Double"]);
  expect(bound("Benevolent Unicorn").oracleText).not.toContain("prevent");
  expect(bound("Urza's Armor").oracleText).toContain("prevent");
});

test("all13 complete unimplemented contrast bodies retain exclusions with every option enabled", async () => {
  expect(fixture.contrasts).toHaveLength(13);
  for (const contrast of fixture.contrasts) {
    const input = source(contrast.name);
    expect(input.oracle.oracle_text).toBe(contrast.wholeOracleBody);
    expect(await semanticHash(input.oracle)).toBe(input.versionHash);
    expect(bindDamageReplacementPermanent(input)).toBeNull();
    expect(bindDevelopmentCard(input, options).kind).toBe("unsupported");
  }
});
test("existing six authenticated witness definitions bind byte-exactly with the additional option", () => {
  expect(fixture.previousDefinitions).toHaveLength(6);
  for (const expected of fixture.previousDefinitions) {
    const input = source(expected.name);
    const before = bindDevelopmentCard(input, previousOptions),
      after = bindDevelopmentCard(input, options);
    expect(before.kind).toBe("bound");
    expect(after).toEqual(before);
    if (after.kind !== "bound") throw new Error(after.reason);
    expect(canonicalJson(after.definition)).toBe(canonicalJson(expected));
  }
});
const sourceChanges: Record<string, (card: CatalogCard) => void> = {
  identity: (c) => {
    c.identity = "unknown";
  },
  oracleIdentity: (c) => {
    c.oracle.oracle_id = "00000000-0000-4000-8000-000000000000";
  },
  version: (c) => {
    c.versionHash = "0".repeat(64);
  },
  archive: (c) => {
    c.sourceArchiveHash = "0".repeat(64);
  },
  ordinal: (c) => {
    c.sourceOrdinal++;
  },
  bundle: (c) => {
    c.bundleHash = "0".repeat(64);
  },
  eligibility: (c) => {
    c.eligibility = [];
  },
  name: (c) => {
    c.oracle.name += " changed";
  },
  body: (c) => {
    c.oracle.oracle_text += "\nDraw a card.";
  },
  whitespace: (c) => {
    c.oracle.oracle_text += " ";
  },
  missingBody: (c) => {
    delete c.oracle.oracle_text;
  },
  cost: (c) => {
    c.oracle.mana_cost = "{W/W}";
  },
  xCost: (c) => {
    c.oracle.mana_cost = "{X}{R}";
  },
  missingCost: (c) => {
    delete c.oracle.mana_cost;
  },
  manaValue: (c) => {
    c.oracle.cmc = 99;
  },
  power: (c) => {
    c.oracle.power = "*";
  },
  toughness: (c) => {
    c.oracle.toughness = "100";
  },
  type: (c) => {
    c.oracle.type_line += " Planeswalker";
  },
  subtype: (c) => {
    c.oracle.type_line += " — Aura";
  },
  legendary: (c) => {
    c.oracle.type_line = `Legendary ${c.oracle.type_line}`;
  },
  keywords: (c) => {
    c.oracle.keywords = ["Ward"];
  },
  colors: (c) => {
    c.oracle.colors = ["G"];
  },
  colorIdentity: (c) => {
    c.oracle.color_identity = ["G"];
  },
  layout: (c) => {
    c.oracle.layout = "transform";
  },
  faces: (c) => {
    c.oracle.card_faces = [];
  },
  loyalty: (c) => {
    c.oracle.loyalty = "3";
  },
  defense: (c) => {
    c.oracle.defense = "3";
  },
  indicator: (c) => {
    c.oracle.color_indicator = ["R"];
  },
  handModifier: (c) => {
    c.oracle.hand_modifier = "1";
  },
  lifeModifier: (c) => {
    c.oracle.life_modifier = "1";
  },
  digital: (c) => {
    c.oracle.digital = true;
  },
  games: (c) => {
    c.oracle.games = ["mtgo"];
  },
  legality: (c) => {
    c.oracle.legalities.commander = "banned";
  },
};
for (const [mutation, change] of Object.entries(sourceChanges))
  test(`all five damage source bindings reject altered ${mutation}`, () => {
    for (const name of names) {
      const input = source(name);
      change(input);
      expect(bindDamageReplacementPermanent(input)).toBeNull();
      expect(bindDevelopmentCard(input, options).kind).toBe("unsupported");
    }
  });
test("erased known body and relabeled identity cannot fall through into vanilla or keyword constructors", () => {
  for (const name of names)
    for (const text of [
      "",
      "Flash",
      "Flying",
      source(name).oracle.oracle_text?.replace("instead.", ".") ?? "",
    ]) {
      if (text === source(name).oracle.oracle_text) continue;
      for (const anchor of ["identity", "oracle", "version"]) {
        const input = source(name);
        input.oracle.oracle_text = text;
        input.oracle.keywords = text === "Flash" ? ["Flash"] : text === "Flying" ? ["Flying"] : [];
        if (anchor !== "identity") input.identity = "changed-identity";
        if (anchor !== "oracle") input.oracle.oracle_id = "00000000-0000-4000-8000-000000000000";
        if (anchor !== "version") input.versionHash = "0".repeat(64);
        expect(bindDevelopmentCard(input, options).kind).toBe("unsupported");
        expect(bindDevelopmentCard(input, previousOptions).kind).toBe("unsupported");
      }
    }
});
const definitionChanges: Record<string, (card: CardDefinition) => void> = {
  id: (c) => {
    c.id += "changed";
  },
  oracleId: (c) => {
    c.oracleId = "unknown";
  },
  version: (c) => {
    c.sourceVersion = "0".repeat(64);
  },
  name: (c) => {
    c.name += "changed";
  },
  body: (c) => {
    c.oracleText = "";
  },
  types: (c) => {
    c.types.push("Planeswalker");
  },
  subtypes: (c) => {
    c.subtypes.push("Aura");
  },
  supertypes: (c) => {
    c.supertypes.push("Legendary");
  },
  colors: (c) => {
    c.colors = ["G"];
  },
  colorIdentity: (c) => {
    c.colorIdentity = ["G"];
  },
  cost: (c) => {
    c.manaCost = null;
  },
  manaValue: (c) => {
    c.manaValue = 99;
  },
  power: (c) => {
    c.power = 100;
  },
  toughness: (c) => {
    c.toughness = 100;
  },
  keyword: (c) => {
    c.keywords = ["vigilance"];
  },
  manaAbility: (c) => {
    c.manaAbilities = ["G"];
  },
  commander: (c) => {
    c.commanderEligible = true;
  },
  deckLimit: (c) => {
    c.deckLimit = null;
  },
  obligations: (c) => {
    c.obligations = [];
  },
  revision: (c) => {
    c.implementationRevision = "commander-development-recipes/1";
  },
  erasedProgram: (c) => {
    delete c.damagePrograms;
  },
  emptyPrograms: (c) => {
    c.damagePrograms = [];
  },
};
for (const [mutation, change] of Object.entries(definitionChanges))
  test(`exact reconstructed damage definitions reject changed ${mutation}`, () => {
    for (const name of names) {
      const card = bound(name);
      change(card);
      expect(reviewedDamageReplacementDefinition(card)).toBe(false);
    }
  });
test("typed source programs reject semantic substitutions and extra clauses even when the mutation has a valid sibling schema", () => {
  for (const name of names) {
    const card = bound(name);
    for (const other of names) {
      if (other === name) continue;
      const program = bound(other).damagePrograms?.[0];
      if (!program) throw new Error("Missing program");
      const changed = structuredClone(card);
      changed.damagePrograms = [{ ...program, id: `damage-static:${card.oracleId}:0` }];
      if (canonicalJson(changed.damagePrograms) === canonicalJson(card.damagePrograms)) continue;
      expect(reviewedDamageReplacementDefinition(changed)).toBe(false);
    }
    const base = card.damagePrograms?.[0];
    if (!base) throw new Error("Missing program");
    for (const patch of [
      { sourceZone: "graveyard" },
      { priority: "self-replacement" },
      { source: "opponent-spell" },
      { recipient: "target" },
      { extra: "draw1" },
      { operation: { kind: "multiply", factor: 3 } },
    ]) {
      const candidate = { ...base, ...patch };
      expect(DamageStaticProgram.safeParse(candidate).success).toBe(false);
    }
  }
});
