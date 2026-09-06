import type { CatalogCard } from "@iwsdk-apps/catalog";
import { CardDefinition, type Cost, canonicalJson, SpellProgram } from "@iwsdk-apps/contracts";

export const COUNTER_SPELL_VERSION = "stack-counter-spell/1";
export const COUNTER_SPELL_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const COUNTER_SPELL_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const COUNTER_SPELL_RULES = [
  "112.1",
  "112.2",
  "115.5",
  "405.1",
  "405.5",
  "601.2c",
  "608.2b",
  "608.2n",
  "701.6a",
  "701.6b",
  "704.3",
  "903.9a",
  "304.1",
] as const;
export interface CounterSpellSource {
  identity: string;
  sourceVersion: string;
  sourceOrdinal: number;
  name: string;
  oracleText: string;
  manaCost: string;
  cost: Cost;
  manaValue: number;
  target: "spell" | "creature-spell" | "noncreature-spell";
}
/** Seven authenticated complete bodies, not an English counterspell interpreter. */
export const COUNTER_SPELLS: readonly CounterSpellSource[] = [
  {
    identity: "7d00fb28-ea6c-49a9-b4af-ffb38860a9a7",
    sourceVersion: "58b637831503fd08b63a3968a1df1abbe6bb7b8a8bff57225267602a46cffdaf",
    sourceOrdinal: 18800,
    name: "Cancel",
    oracleText: "Counter target spell.",
    manaCost: "{1}{U}{U}",
    cost: {
      W: 0,
      U: 2,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 1,
    },
    manaValue: 3,
    target: "spell",
  },
  {
    identity: "cc187110-1148-4090-bbb8-e205694a39f5",
    sourceVersion: "204fdb2171e221f7dc09fbec90d69f139da4bc943971c3a419bc4d2df955cf62",
    sourceOrdinal: 30700,
    name: "Counterspell",
    oracleText: "Counter target spell.",
    manaCost: "{U}{U}",
    cost: {
      W: 0,
      U: 2,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 0,
    },
    manaValue: 2,
    target: "spell",
  },
  {
    identity: "46665089-aa3d-44c3-964d-6638dfbb5782",
    sourceVersion: "8252bcbe449928c2758c24582e78771bf31433bb8157a471d2f481563c3c00e1",
    sourceOrdinal: 10561,
    name: "Essence Scatter",
    oracleText: "Counter target creature spell.",
    manaCost: "{1}{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 1,
    },
    manaValue: 2,
    target: "creature-spell",
  },
  {
    identity: "4f891c68-c959-4210-94e5-94a8e487d5ef",
    sourceVersion: "6bc58e365852b76c31193373380f6a6393d9d895869aa7942c0ed04e2933f7b2",
    sourceOrdinal: 11917,
    name: "False Summoning",
    oracleText: "Counter target creature spell.",
    manaCost: "{1}{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 1,
    },
    manaValue: 2,
    target: "creature-spell",
  },
  {
    identity: "3407fe41-fdd3-4119-8f70-4bc4590a379f",
    sourceVersion: "1b90be89e4134ba466ec5214ab20fa572837c1dbcd1270dd30d7bd104cdd85a6",
    sourceOrdinal: 7749,
    name: "Negate",
    oracleText: "Counter target noncreature spell.",
    manaCost: "{1}{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 1,
    },
    manaValue: 2,
    target: "noncreature-spell",
  },
  {
    identity: "250f8642-9754-48fd-8f09-70ed13d7a42c",
    sourceVersion: "de51ca02c4586103afb6d82459d623505ba777551089695cfe037d18974df6d2",
    sourceOrdinal: 5563,
    name: "Preemptive Strike",
    oracleText: "Counter target creature spell.",
    manaCost: "{1}{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 1,
    },
    manaValue: 2,
    target: "creature-spell",
  },
  {
    identity: "b13c0f76-fbda-4911-9442-c3d7e97f1aac",
    sourceVersion: "ab4dc3ac2c4d4bbd9b78b0648cfe0fed9e107cabe74552a870641e5598c4599b",
    sourceOrdinal: 26637,
    name: "Remove Soul",
    oracleText: "Counter target creature spell.",
    manaCost: "{1}{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 1,
    },
    manaValue: 2,
    target: "creature-spell",
  },
];

function definitionFor(recipe: CounterSpellSource): CardDefinition {
  return CardDefinition.parse({
    id: `oracle:${recipe.identity}`,
    oracleId: recipe.identity,
    sourceVersion: recipe.sourceVersion,
    name: recipe.name,
    typeLine: "Instant",
    types: ["Instant"],
    subtypes: [],
    supertypes: [],
    colors: ["U"],
    colorIdentity: ["U"],
    manaCost: recipe.cost,
    manaValue: recipe.manaValue,
    power: null,
    toughness: null,
    keywords: [],
    manaAbilities: [],
    oracleText: recipe.oracleText,
    commanderEligible: false,
    deckLimit: 1,
    obligations: COUNTER_SPELL_RULES.map((rule) => `rule:${rule}`),
    implementationRevision: COUNTER_SPELL_VERSION,
    spellProgram: SpellProgram.parse({
      schema: "commander-spell/1",
      target: recipe.target,
      effects: [{ kind: "counter" }],
    }),
  });
}
export function bindCounterSpell(card: CatalogCard): CardDefinition | null {
  const recipe = COUNTER_SPELLS.find((row) => row.identity === card.identity);
  if (!recipe) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    card.versionHash !== recipe.sourceVersion ||
    card.sourceOrdinal !== recipe.sourceOrdinal ||
    card.sourceArchiveHash !== COUNTER_SPELL_ARCHIVE ||
    card.bundleHash !== COUNTER_SPELL_SOURCE_BUNDLE ||
    o.oracle_id !== recipe.identity ||
    o.name !== recipe.name ||
    o.layout !== "normal" ||
    o.card_faces !== undefined ||
    o.oracle_text !== recipe.oracleText ||
    o.type_line !== "Instant" ||
    o.mana_cost !== recipe.manaCost ||
    o.cmc !== recipe.manaValue ||
    o.power !== undefined ||
    o.toughness !== undefined ||
    canonicalJson(o.colors ?? []) !== canonicalJson(["U"]) ||
    canonicalJson(o.color_identity) !== canonicalJson(["U"]) ||
    canonicalJson(o.keywords ?? []) !== canonicalJson([])
  )
    return null;
  return definitionFor(recipe);
}
/** Reconstruct every characteristic and target restriction before declaring no external definitions. */
export function reviewedCounterSpellDefinition(definition: CardDefinition): boolean {
  const recipe = COUNTER_SPELLS.find((row) => row.identity === definition.oracleId);
  return recipe !== undefined && canonicalJson(definitionFor(recipe)) === canonicalJson(definition);
}
