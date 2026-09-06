import type { CatalogCard } from "@iwsdk-apps/catalog";
import { CardDefinition, type Cost, canonicalJson, SpellProgram } from "@iwsdk-apps/contracts";

export const CREATURE_RETURN_VERSION = "creature-return-spell/1";
export const CREATURE_RETURN_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const CREATURE_RETURN_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const CREATURE_RETURN_RULES = [
  "121.2",
  "304.1",
  "307.1",
  "400.7",
  "601.2c",
  "608.2b",
  "608.2c",
  "608.2d",
  "608.2n",
  "614.1",
  "614.1a",
  "614.5",
  "704.3",
  "704.4",
  "903.9b",
] as const;
export interface CreatureReturnSpellSource {
  identity: string;
  sourceVersion: string;
  sourceOrdinal: number;
  name: string;
  oracleText: string;
  manaCost: string;
  cost: Cost;
  manaValue: number;
  typeLine: "Instant" | "Sorcery";
  draw: boolean;
}
/** Five authenticated complete bodies; owner replacement is a durable engine decision. */
export const CREATURE_RETURN_SPELLS: readonly CreatureReturnSpellSource[] = [
  {
    identity: "021d8596-782a-4cfd-8b70-ac5bb8a5aff1",
    sourceVersion: "9e2ed7f847456132a98334a7f37e44b79b551d70fe26ddc0d3c6a61befb266d0",
    sourceOrdinal: 350,
    name: "Drag Under",
    oracleText: "Return target creature to its owner's hand.\nDraw a card.",
    manaCost: "{2}{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 2,
    },
    manaValue: 3,
    typeLine: "Sorcery",
    draw: true,
  },
  {
    identity: "a3874282-9887-4b53-b80e-564ac99cca23",
    sourceVersion: "20d4fa750b2a1a209489a4ab843c51d92e36fed93da1ab4520a4851867aa3661",
    sourceOrdinal: 24605,
    name: "Drown in Shapelessness",
    oracleText: "Return target creature to its owner's hand.",
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
    typeLine: "Instant",
    draw: false,
  },
  {
    identity: "6f7ef1d1-c441-41ba-b7d6-6b7727ffcf04",
    sourceVersion: "0ab23094897700b94e3d399db2d15c62990eebf1951f37bd86d2263c1087ac02",
    sourceOrdinal: 16728,
    name: "Repulse",
    oracleText: "Return target creature to its owner's hand.\nDraw a card.",
    manaCost: "{2}{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 2,
    },
    manaValue: 3,
    typeLine: "Instant",
    draw: true,
  },
  {
    identity: "c44f1a81-269b-4f05-8ff2-e7ce19a93937",
    sourceVersion: "758b8cccd8ef8c0ba97fe8fb0f2428767842df91ac5c8e1627ce2fbe8d465061",
    sourceOrdinal: 29522,
    name: "Symbol of Unsummoning",
    oracleText: "Return target creature to its owner's hand.\nDraw a card.",
    manaCost: "{2}{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 2,
    },
    manaValue: 3,
    typeLine: "Sorcery",
    draw: true,
  },
  {
    identity: "837182db-1bf3-4a2c-bd01-1af9d9873561",
    sourceVersion: "98769e8e47da2d18fd755e7141a883463789487ff738ab871eb9c9b614c43a06",
    sourceOrdinal: 19718,
    name: "Unsummon",
    oracleText: "Return target creature to its owner's hand.",
    manaCost: "{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 0,
    },
    manaValue: 1,
    typeLine: "Instant",
    draw: false,
  },
];

function definitionFor(recipe: CreatureReturnSpellSource): CardDefinition {
  return CardDefinition.parse({
    id: `oracle:${recipe.identity}`,
    oracleId: recipe.identity,
    sourceVersion: recipe.sourceVersion,
    name: recipe.name,
    typeLine: recipe.typeLine,
    types: [recipe.typeLine],
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
    obligations: CREATURE_RETURN_RULES.map((rule) => `rule:${rule}`),
    implementationRevision: CREATURE_RETURN_VERSION,
    spellProgram: SpellProgram.parse({
      schema: "commander-spell/1",
      target: "creature",
      effects: [
        { kind: "return-to-hand" },
        ...(recipe.draw ? [{ kind: "draw", recipient: "controller", amount: 1 }] : []),
      ],
    }),
  });
}
export function bindCreatureReturnSpell(card: CatalogCard): CardDefinition | null {
  const recipe = CREATURE_RETURN_SPELLS.find((row) => row.identity === card.identity);
  if (!recipe) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    card.versionHash !== recipe.sourceVersion ||
    card.sourceOrdinal !== recipe.sourceOrdinal ||
    card.sourceArchiveHash !== CREATURE_RETURN_ARCHIVE ||
    card.bundleHash !== CREATURE_RETURN_SOURCE_BUNDLE ||
    o.oracle_id !== recipe.identity ||
    o.name !== recipe.name ||
    o.layout !== "normal" ||
    o.card_faces !== undefined ||
    o.oracle_text !== recipe.oracleText ||
    o.type_line !== recipe.typeLine ||
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
export function reviewedCreatureReturnSpellDefinition(definition: CardDefinition): boolean {
  const recipe = CREATURE_RETURN_SPELLS.find((row) => row.identity === definition.oracleId);
  return recipe !== undefined && canonicalJson(definitionFor(recipe)) === canonicalJson(definition);
}
