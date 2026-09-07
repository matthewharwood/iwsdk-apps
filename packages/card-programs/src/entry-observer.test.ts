import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  canonicalJson,
  EntryObserverProgram,
  semanticHash,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/entry-observer.json";
import {
  bindEntryObserverPermanent,
  ENTRY_OBSERVER_PERMANENTS,
  ENTRY_OBSERVER_RESEARCH_HASH,
  ENTRY_OBSERVER_VERSION,
  reviewedEntryObserverDefinition,
} from "./entry-observer";
import { bindDevelopmentCard } from "./index";

const records = fixture.records.map((row) => CatalogCardSchema.parse(row));
const previousOptions = {
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
const options = { ...previousOptions, entryObserverTriggers: true };
function candidate(name: string): CatalogCard {
  const card = records.find((row) => row.oracle.name === name);
  if (!card) throw new Error(`Missing authenticated observer source: ${name}`);
  return structuredClone(card);
}
function bound(name: string): CardDefinition {
  const card = bindEntryObserverPermanent(candidate(name));
  if (!card) throw new Error(`Missing observer binding: ${name}`);
  return card;
}
function observer(card: CardDefinition): EntryObserverProgram {
  const program = card.triggerPrograms?.[0];
  if (program?.schema !== "commander-entry-observer/1")
    throw new Error("Missing exact observer constructor");
  return program;
}

test("all20 complete authenticated observer sources bind only with explicit opt-in and preserve every characteristic", async () => {
  const { hash, ...body } = fixture;
  expect(await semanticHash(body)).toBe(hash);
  expect(hash).toBe("be22f712f837090b8e63abd045f323adc40a109f20c65eb67ac0ba02877bd91d");
  expect(fixture.researchManifestSha256).toBe(ENTRY_OBSERVER_RESEARCH_HASH);
  expect(records).toHaveLength(37);
  expect(ENTRY_OBSERVER_PERMANENTS).toHaveLength(20);
  let creatures = 0;
  let enchantments = 0;
  for (const recipe of ENTRY_OBSERVER_PERMANENTS) {
    const source = candidate(recipe.name);
    expect(await semanticHash(source.oracle)).toBe(source.versionHash);
    expect(bindDevelopmentCard(source, previousOptions).kind).toBe("unsupported");
    const result = bindDevelopmentCard(source, options);
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error(result.reason);
    expect(result.recipes).toEqual([ENTRY_OBSERVER_VERSION]);
    const card = result.definition;
    expect(observer(card)).toEqual(
      EntryObserverProgram.parse(
        fixture.expectedPrograms[recipe.identity as keyof typeof fixture.expectedPrograms],
      ),
    );
    expect(card).toMatchObject({
      id: `oracle:${source.identity}`,
      oracleId: source.identity,
      sourceVersion: source.versionHash,
      name: source.oracle.name,
      typeLine: source.oracle.type_line,
      oracleText: source.oracle.oracle_text,
      colors: source.oracle.colors,
      colorIdentity: source.oracle.color_identity,
      manaValue: source.oracle.cmc,
      keywords: recipe.intrinsicKeywords,
      manaAbilities: [],
      deckLimit: 1,
    });
    expect(card.triggerPrograms).toHaveLength(1);
    expect(card.spellProgram).toBeUndefined();
    expect(card.staticPrograms).toBeUndefined();
    expect(source.oracle.power).toBe(card.power === null ? undefined : String(card.power));
    expect(source.oracle.toughness).toBe(
      card.toughness === null ? undefined : String(card.toughness),
    );
    expect([...card.supertypes, ...card.types].join(" ")).toBe(card.typeLine.split(" — ")[0] ?? "");
    expect(card.subtypes.join(" ")).toBe(card.typeLine.split(" — ")[1] ?? "");
    expect(Object.values(card.manaCost ?? {}).reduce((a, b) => a + b, 0)).toBe(card.manaValue);
    expect(card.commanderEligible).toBe(
      card.types.includes("Creature") && card.supertypes.includes("Legendary"),
    );
    expect(reviewedEntryObserverDefinition(card)).toBe(true);
    expect(card.obligations).not.toContain("rule:undefined");
    if (card.types.includes("Creature")) creatures++;
    else enchantments++;
  }
  expect([creatures, enchantments]).toEqual([18, 2]);
});

test("sixteen exact whole-body exclusions and the Aura-only deferred body cannot enter the new family", async () => {
  expect(fixture.excludedWhole).toHaveLength(16);
  expect(fixture.deferred).toHaveLength(1);
  for (const excluded of fixture.excludedWhole) {
    const source = candidate(excluded.name);
    expect(await semanticHash(source.oracle)).toBe(excluded.sourceVersion);
    expect(source.oracle.oracle_text).toBe(excluded.body);
    expect(bindEntryObserverPermanent(source)).toBeNull();
    expect(bindDevelopmentCard(source, options).kind).toBe("unsupported");
  }
  const deferred = candidate("Tanglespan Lookout");
  expect(await semanticHash(deferred.oracle)).toBe(deferred.versionHash);
  expect(bindEntryObserverPermanent(deferred)).toBeNull();
  expect(bindDevelopmentCard(deferred, options).kind).toBe("unsupported");
});

test("self identity, any controller and subtype-only Beast predicates remain distinct", () => {
  for (const name of ["Bogwater Lumaret", "Kor Celebrant", "Eidolon of Blossoms"]) {
    const program = observer(bound(name));
    expect(program.trigger.subject.kind).toBe("self-or-filter");
    expect(program.trigger.subject.filter.excludeSource).toBe(true);
    expect(program.trigger.subject.filter.controller).toBe("source-controller");
  }
  for (const name of ["Soul Warden", "Essence Warden"])
    expect(observer(bound(name)).trigger.subject).toEqual({
      kind: "filter",
      filter: { types: ["Creature"], controller: "any", excludeSource: true, token: "any" },
    });
  expect(observer(bound("Woodland Liege")).trigger.subject).toEqual({
    kind: "filter",
    filter: {
      types: [],
      subtype: "Beast",
      controller: "source-controller",
      excludeSource: false,
      token: "any",
    },
  });
  expect(observer(bound("Ajani's Welcome")).trigger.subject).toEqual({
    kind: "filter",
    filter: {
      types: ["Creature"],
      controller: "source-controller",
      excludeSource: false,
      token: "any",
    },
  });
  expect(bound("Jaddi Offshoot").keywords).toEqual(["defender"]);
  expect(bound("Nexus Wardens").keywords).toEqual(["reach"]);
  expect(bound("Virulent Emissary").keywords).toEqual(["deathtouch"]);
  expect(bound("Lifecreed Duo").keywords).toEqual(["flying"]);
});

test("Tatyova retains mandatory gain-one before draw-one and requires observed commander eligibility", () => {
  const source = candidate("Tatyova, Benthic Druid");
  const card = bound("Tatyova, Benthic Druid");
  expect(card).toMatchObject({
    commanderEligible: true,
    power: 3,
    toughness: 3,
    colorIdentity: ["G", "U"],
    manaCost: { generic: 3, G: 1, U: 1 },
    keywords: [],
  });
  expect(observer(card).trigger.subject).toEqual({
    kind: "filter",
    filter: {
      types: ["Land"],
      controller: "source-controller",
      excludeSource: false,
      token: "any",
    },
  });
  expect(observer(card).choice).toEqual({ kind: "mandatory" });
  expect(observer(card).effects).toEqual([
    { kind: "gain-life", recipient: "trigger-controller", amount: 1 },
    { kind: "draw", recipient: "trigger-controller", amount: 1 },
  ]);
  source.eligibility = source.eligibility.filter((row) => row.role !== "commander");
  expect(bindEntryObserverPermanent(source)).toBeNull();
});
const sourceMutations: Record<string, (card: CatalogCard) => void> = {
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
    c.oracle.name += " altered";
  },
  layout: (c) => {
    c.oracle.layout = "transform";
  },
  faces: (c) => {
    c.oracle.card_faces = [];
  },
  body: (c) => {
    c.oracle.oracle_text += "\nDraw a card.";
  },
  missingBody: (c) => {
    delete c.oracle.oracle_text;
  },
  bodyWhitespace: (c) => {
    c.oracle.oracle_text += " ";
  },
  cost: (c) => {
    c.oracle.mana_cost = "{X}";
  },
  hybrid: (c) => {
    c.oracle.mana_cost = "{W/B}";
  },
  missingCost: (c) => {
    delete c.oracle.mana_cost;
  },
  costValue: (c) => {
    c.oracle.cmc = (c.oracle.cmc ?? 0) + 1;
  },
  type: (c) => {
    c.oracle.type_line += " Planeswalker";
  },
  aura: (c) => {
    c.oracle.type_line = "Enchantment — Aura";
  },
  power: (c) => {
    c.oracle.power = "*";
  },
  toughness: (c) => {
    c.oracle.toughness = "*";
  },
  colors: (c) => {
    c.oracle.colors = ["C"];
  },
  colorIdentity: (c) => {
    c.oracle.color_identity = ["C"];
  },
  keyword: (c) => {
    c.oracle.keywords = [...c.oracle.keywords, "Haste"];
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
  legality: (c) => {
    c.oracle.legalities.commander = "banned";
  },
  digital: (c) => {
    c.oracle.digital = !c.oracle.digital;
  },
  games: (c) => {
    c.oracle.games = [];
  },
};
test("each observer rejects complete-body, source, cost, characteristic and eligibility mutations", () => {
  for (const recipe of ENTRY_OBSERVER_PERMANENTS)
    for (const change of Object.values(sourceMutations)) {
      const source = candidate(recipe.name);
      change(source);
      expect(bindEntryObserverPermanent(source)).toBeNull();
      expect(bindDevelopmentCard(source, options).kind).toBe("unsupported");
    }
});

test("known source identity or version cannot fall through after observer body and metadata are erased", () => {
  for (const recipe of ENTRY_OBSERVER_PERMANENTS) {
    const source = candidate(recipe.name);
    source.oracle.oracle_text = "";
    source.oracle.keywords = [];
    for (const opts of [previousOptions, options])
      expect(bindDevelopmentCard(source, opts).kind).toBe("unsupported");
    source.identity = "00000000-0000-4000-8000-000000000000";
    source.oracle.oracle_id = source.identity;
    expect(bindDevelopmentCard(source, options).kind).toBe("unsupported");
  }
});

const definitionMutations: ((card: CardDefinition) => void)[] = [
  (d) => {
    delete d.triggerPrograms;
  },
  (d) => {
    d.implementationRevision = "commander-development-recipes/1";
  },
  (d) => {
    d.oracleText = "";
  },
  (d) => {
    d.id = "unknown";
  },
  (d) => {
    d.oracleId = "unknown";
  },
  (d) => {
    d.sourceVersion = "0".repeat(64);
  },
  (d) => {
    d.manaCost = null;
  },
  (d) => {
    d.manaValue++;
  },
  (d) => {
    d.types = ["Creature", "Planeswalker"];
  },
  (d) => {
    d.subtypes = ["Altered"];
  },
  (d) => {
    d.supertypes = ["Snow"];
  },
  (d) => {
    d.commanderEligible = !d.commanderEligible;
  },
  (d) => {
    d.power = 99;
  },
  (d) => {
    d.toughness = 99;
  },
  (d) => {
    d.keywords = [...d.keywords, "haste"];
  },
  (d) => {
    d.manaAbilities = ["G"];
  },
  (d) => {
    d.deckLimit = null;
  },
  (d) => {
    d.obligations = [];
  },
  (d) => {
    observer(d).id += "altered";
  },
  (d) => {
    const p = observer(d);
    p.trigger.subject.filter.controller =
      p.trigger.subject.filter.controller === "any" ? "source-controller" : "any";
  },
  (d) => {
    const p = observer(d);
    p.trigger.subject.filter.excludeSource = !p.trigger.subject.filter.excludeSource;
  },
  (d) => {
    const p = observer(d);
    p.trigger.subject.kind = p.trigger.subject.kind === "filter" ? "self-or-filter" : "filter";
  },
  (d) => {
    observer(d).effects = [];
  },
  (d) => {
    observer(d).effects.push({ kind: "draw", recipient: "trigger-controller", amount: 1 });
  },
  (d) => {
    d.triggerPrograms?.push(structuredClone(observer(d)));
  },
  (d) => {
    Object.assign(observer(d), { unknownEffect: "gain 10" });
  },
];
test("exact definition reconstruction rejects erased or downgraded observer programs and every changed subject or characteristic", () => {
  for (const recipe of ENTRY_OBSERVER_PERMANENTS)
    for (const change of definitionMutations) {
      const card = bound(recipe.name),
        before = canonicalJson(card);
      change(card);
      expect(canonicalJson(card)).not.toBe(before);
      expect(reviewedEntryObserverDefinition(card)).toBe(false);
    }
});

test("observer schema rejects unsupported optional, aggregation, recipient, token, type and sequence semantics", () => {
  const p = observer(bound("Tatyova, Benthic Druid"));
  const filter = p.trigger.subject.filter;
  const mutants: unknown[] = [
    { ...p, choice: { kind: "optional" } },
    { ...p, trigger: { ...p.trigger, view: "pre-event" } },
    { ...p, trigger: { ...p.trigger, sourceZone: "command" } },
    { ...p, trigger: { ...p.trigger, occurrence: "one-or-more" } },
    { ...p, effects: [...p.effects].reverse() },
    { ...p, effects: [{ kind: "draw", recipient: "trigger-controller", amount: 2 }] },
    { ...p, effects: [{ kind: "gain-life", recipient: "trigger-controller", amount: 0 }] },
    { ...p, effects: [{ kind: "gain-life", recipient: "source-owner", amount: 1 }] },
    {
      ...p,
      effects: [
        { kind: "gain-life", recipient: "trigger-controller", amount: 2 },
        { kind: "draw", recipient: "trigger-controller", amount: 1 },
      ],
    },
  ];
  for (const f of [
    { ...filter, controller: "opponent" },
    { ...filter, token: "nontoken" },
    { ...filter, types: ["Creature", "Artifact"] },
    { ...filter, types: ["Creature"], subtype: "Beast" },
    { ...filter, types: [] },
    { ...filter, types: [], subtype: "Aura" },
  ])
    mutants.push({ ...p, trigger: { ...p.trigger, subject: { kind: "filter", filter: f } } });
  mutants.push({
    ...p,
    trigger: {
      ...p.trigger,
      subject: { kind: "self-or-filter", filter: { ...filter, excludeSource: false } },
    },
  });
  for (const mutant of mutants) expect(EntryObserverProgram.safeParse(mutant).success).toBe(false);
});
