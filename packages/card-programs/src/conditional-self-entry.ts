import type { CatalogCard } from "@iwsdk-apps/catalog";
import { CardDefinition, ConditionalSelfEntryProgram, canonicalJson } from "@iwsdk-apps/contracts";

export const CONDITIONAL_SELF_ENTRY_VERSION = "conditional-self-entry-artifact/1";
export const CONDITIONAL_SELF_ENTRY_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const CONDITIONAL_SELF_ENTRY_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const CONDITIONAL_SELF_ENTRY_RULES_HASH =
  "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f";
export const CONDITIONAL_SELF_ENTRY_SOURCE_PACK_HASH =
  "4efb9d0f5f4604d0bfb43c07876ca4fec66a02ba22a692fb37e055a02bb61aba";
export const CONDITIONAL_SELF_ENTRY_RESEARCH_HASH =
  "606374f503f06c5458e3162c8189726ffda5b340de36193c3621eeb5422fe889";
export const CONDITIONAL_SELF_ENTRY_RULES = [
  "109.5",
  "113.7a",
  "113.8",
  "117.2a",
  "117.5",
  "208.1",
  "302.1",
  "603.1",
  "603.2",
  "603.2c",
  "603.3a",
  "603.3b",
  "603.4",
  "603.6a",
  "603.6b",
  "603.10",
  "608.2a",
  "608.2c",
  "608.2n",
  "121.1",
  "121.2",
  "121.4",
  "704.3",
  "704.5b",
  "903.5c",
] as const;
export interface ConditionalSelfEntrySource {
  identity: string;
  sourceVersion: string;
  sourceOrdinal: number;
  rawRecordHash: string;
  name: string;
  oracleText: string;
  typeLine: string;
  subtypes: string[];
  power: number;
  toughness: number;
  commanderEligible: boolean;
  games: string[];
}
/** Two complete authenticated artifact-existence bodies; no broader conditional English is parsed. */
export const CONDITIONAL_SELF_ENTRY_PERMANENTS: readonly ConditionalSelfEntrySource[] = [
  {
    identity: "0753aee4-33db-48c5-9854-16a9d91535b2",
    sourceVersion: "0e8213d46e50161c9b790259f23da9aa3a771fafe19e77d50f30c54b89869f08",
    sourceOrdinal: 1154,
    rawRecordHash: "8d08be043640b148ec2eab1e3171fb0d47bfce7a4cce17e491ae44e2ce639b1e",
    name: "Scholar of Stars",
    oracleText: "When this creature enters, if you control an artifact, draw a card.",
    typeLine: "Creature — Human Artificer",
    subtypes: ["Human", "Artificer"],
    power: 3,
    toughness: 2,
    commanderEligible: false,
    games: ["paper", "mtgo"],
  },
  {
    identity: "f84850bc-6348-449e-bd82-bb39e2119bec",
    sourceVersion: "b546586e541e5376375f1a7441d223e41a84310a3e205e44bdcc30349e6741d5",
    sourceOrdinal: 37461,
    rawRecordHash: "072a8cf348efc02816e9412406eb82ac6f2d31e6e08b24cffafb4035c554ba4c",
    name: "Donatello, Turtle Techie",
    oracleText: "When Donatello enters, if you control an artifact, draw a card.",
    typeLine: "Legendary Creature — Mutant Ninja Turtle",
    subtypes: ["Mutant", "Ninja", "Turtle"],
    power: 3,
    toughness: 4,
    commanderEligible: true,
    games: ["paper", "arena", "mtgo"],
  },
];
function definitionFor(source: ConditionalSelfEntrySource): CardDefinition {
  const program = ConditionalSelfEntryProgram.parse({
    schema: "commander-conditional-self-entry/1",
    id: `conditional-self-entry:${source.identity}:0`,
    trigger: {
      kind: "self-enters-battlefield",
      view: "post-committed-event",
      placementClass: "ordinary",
    },
    interveningIf: { kind: "controls-permanent", types: ["Artifact"] },
    choice: { kind: "mandatory" },
    effects: [{ kind: "draw", recipient: "trigger-controller", amount: 1 }],
  });
  return CardDefinition.parse({
    id: `oracle:${source.identity}`,
    oracleId: source.identity,
    sourceVersion: source.sourceVersion,
    name: source.name,
    typeLine: source.typeLine,
    types: ["Creature"],
    subtypes: source.subtypes,
    supertypes: source.commanderEligible ? ["Legendary"] : [],
    colors: ["U"],
    colorIdentity: ["U"],
    manaCost: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0, generic: 3 },
    manaValue: 4,
    power: source.power,
    toughness: source.toughness,
    keywords: [],
    manaAbilities: [],
    oracleText: source.oracleText,
    commanderEligible: source.commanderEligible,
    deckLimit: 1,
    obligations: [
      ...CONDITIONAL_SELF_ENTRY_RULES,
      ...(source.commanderEligible ? ["201.5", "201.5c", "903.3"] : []),
    ].map((rule) => `rule:${rule}`),
    implementationRevision: CONDITIONAL_SELF_ENTRY_VERSION,
    triggerPrograms: [program],
  });
}
function sourceFacts(card: CatalogCard) {
  const o = card.oracle;
  return {
    name: o.name,
    oracleText: o.oracle_text ?? null,
    typeLine: o.type_line ?? null,
    manaCost: o.mana_cost ?? null,
    manaValue: o.cmc ?? null,
    colors: o.colors ?? null,
    colorIdentity: o.color_identity,
    power: o.power ?? null,
    toughness: o.toughness ?? null,
    keywords: o.keywords,
    digital: o.digital ?? null,
    games: o.games,
  };
}
function expectedFacts(source: ConditionalSelfEntrySource) {
  return {
    name: source.name,
    oracleText: source.oracleText,
    typeLine: source.typeLine,
    manaCost: "{3}{U}",
    manaValue: 4,
    colors: ["U"],
    colorIdentity: ["U"],
    power: String(source.power),
    toughness: String(source.toughness),
    keywords: [],
    digital: false,
    games: source.games,
  };
}
export function bindConditionalSelfEntryPermanent(card: CatalogCard): CardDefinition | null {
  const source = CONDITIONAL_SELF_ENTRY_PERMANENTS.find((row) => row.identity === card.identity);
  if (!source) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    (source.commanderEligible &&
      !card.eligibility.some((row) => row.role === "commander" && row.status === "candidate")) ||
    card.versionHash !== source.sourceVersion ||
    card.sourceArchiveHash !== CONDITIONAL_SELF_ENTRY_ARCHIVE ||
    card.sourceOrdinal !== source.sourceOrdinal ||
    card.bundleHash !== CONDITIONAL_SELF_ENTRY_SOURCE_BUNDLE ||
    o.oracle_id !== source.identity ||
    o.layout !== "normal" ||
    o.card_faces !== undefined ||
    o.loyalty !== undefined ||
    o.defense !== undefined ||
    o.hand_modifier !== undefined ||
    o.life_modifier !== undefined ||
    o.color_indicator !== undefined ||
    o.legalities.commander !== "legal" ||
    canonicalJson(sourceFacts(card)) !== canonicalJson(expectedFacts(source))
  )
    return null;
  return definitionFor(source);
}
/** Reconstruct the whole typed definition, including its condition, instead of trusting a recipe marker. */
export function reviewedConditionalSelfEntryDefinition(definition: CardDefinition): boolean {
  const source = CONDITIONAL_SELF_ENTRY_PERMANENTS.find(
    (row) => row.identity === definition.oracleId,
  );
  return source !== undefined && canonicalJson(definition) === canonicalJson(definitionFor(source));
}
