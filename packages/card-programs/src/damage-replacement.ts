import type { CatalogCard } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  type Cost,
  canonicalJson,
  type DamageStaticProgram,
  type Keyword,
  type ManaColor,
} from "@iwsdk-apps/contracts";

export const DAMAGE_REPLACEMENT_VERSION = "damage-replacement-permanent/1";
export const DAMAGE_REPLACEMENT_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const DAMAGE_REPLACEMENT_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const DAMAGE_REPLACEMENT_RULES_HASH =
  "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f";
export const DAMAGE_REPLACEMENT_RESEARCH_HASH =
  "982b97f1b1f994d4a2f6cf8c397951a845712a8b107f10206d11e0593819ad84";
export const DAMAGE_REPLACEMENT_RULES = [
  "101.4",
  "107.1b",
  "113.6",
  "117.2e",
  "117.5",
  "120.1",
  "120.2",
  "120.2b",
  "120.3",
  "120.4",
  "120.4b",
  "120.4c",
  "120.4d",
  "120.5",
  "120.7",
  "120.8",
  "301.1",
  "302.1",
  "303.1",
  "400.7",
  "510.1c",
  "608.2b",
  "608.2c",
  "608.2h",
  "614.1",
  "614.1a",
  "614.2",
  "614.4",
  "614.5",
  "614.6",
  "614.7a",
  "615.1",
  "615.1a",
  "615.4",
  "615.6",
  "615.10",
  "615.12",
  "615.12a",
  "616.1",
  "616.1e",
  "616.1f",
  "616.2",
  "702.8a",
  "702.15b",
  "702.19b",
  "704.3",
  "704.4",
  "903.5a",
  "903.5b",
  "903.5c",
] as const;
export interface DamageReplacementSource {
  identity: string;
  sourceVersion: string;
  sourceOrdinal: number;
  rawRecordHash: string;
  name: string;
  oracleText: string;
  typeLine: string;
  manaCostText: string;
  manaValue: number;
  power: number | null;
  toughness: number | null;
  colors: ManaColor[];
  colorIdentity: ManaColor[];
  sourceKeywords: string[];
  keywords: Keyword[];
  manaCost: Cost;
  program: DamageStaticProgram;
}
/** Five complete source-bound bodies. The cannot-prevent fact is distinct from replacement/prevention. */
export const DAMAGE_REPLACEMENT_PERMANENTS: readonly DamageReplacementSource[] = [
  {
    identity: "68715465-6cf9-4006-87e9-31f227fe9ed3",
    sourceVersion: "21c5a889c669b758c94ff858ac90e9b4e78dbb6a6a63cdf99692ce31387e6dc6",
    sourceOrdinal: 15661,
    rawRecordHash: "f35795cd3735bbdd6a79c5e490a18ea10f23e763053da68e1068fbdae79ffde0",
    name: "Furnace of Rath",
    oracleText:
      "If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.",
    typeLine: "Enchantment",
    manaCostText: "{1}{R}{R}{R}",
    manaValue: 4,
    power: null,
    toughness: null,
    colors: ["R"],
    colorIdentity: ["R"],
    sourceKeywords: ["Double"],
    keywords: [],
    manaCost: {
      generic: 1,
      W: 0,
      U: 0,
      B: 0,
      R: 3,
      G: 0,
      C: 0,
    },
    program: {
      schema: "commander-damage-static/1",
      id: "damage-static:68715465-6cf9-4006-87e9-31f227fe9ed3:0",
      sourceZone: "battlefield",
      kind: "replacement",
      priority: "ordinary",
      source: "any",
      recipient: "permanent-or-player",
      operation: {
        kind: "multiply",
        factor: 2,
      },
    },
  },
  {
    identity: "3d960d33-623a-4415-ae00-f8cffbc15f5a",
    sourceVersion: "87453d634744dd3bf990baba08c8708b138a65ba8a3db7c06c96c1651ec381f7",
    sourceOrdinal: 9262,
    rawRecordHash: "ccd57e742a437079a438b79cf2795ffdbe1a5b654e05205869514ad306f3c1de",
    name: "Dictate of the Twin Gods",
    oracleText:
      "Flash\nIf a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.",
    typeLine: "Enchantment",
    manaCostText: "{3}{R}{R}",
    manaValue: 5,
    power: null,
    toughness: null,
    colors: ["R"],
    colorIdentity: ["R"],
    sourceKeywords: ["Flash", "Double"],
    keywords: ["flash"],
    manaCost: {
      generic: 3,
      W: 0,
      U: 0,
      B: 0,
      R: 2,
      G: 0,
      C: 0,
    },
    program: {
      schema: "commander-damage-static/1",
      id: "damage-static:3d960d33-623a-4415-ae00-f8cffbc15f5a:0",
      sourceZone: "battlefield",
      kind: "replacement",
      priority: "ordinary",
      source: "any",
      recipient: "permanent-or-player",
      operation: {
        kind: "multiply",
        factor: 2,
      },
    },
  },
  {
    identity: "b437c963-def5-40d6-b567-ae9f1d2a0fa5",
    sourceVersion: "22e49dbb1ab926d6a141c77f7e8c5b1b81ffc81b20ff365b8b6bca4aa1d0e103",
    sourceOrdinal: 27087,
    rawRecordHash: "142b257a66d28cd0a04ab7771a71d4918566e6b6af8eeb8cc3eb5b638a6277ed",
    name: "Benevolent Unicorn",
    oracleText:
      "If a spell would deal damage to a permanent or player, it deals that much damage minus 1 to that permanent or player instead.",
    typeLine: "Creature — Unicorn",
    manaCostText: "{1}{W}",
    manaValue: 2,
    power: 1,
    toughness: 2,
    colors: ["W"],
    colorIdentity: ["W"],
    sourceKeywords: [],
    keywords: [],
    manaCost: {
      generic: 1,
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
    },
    program: {
      schema: "commander-damage-static/1",
      id: "damage-static:b437c963-def5-40d6-b567-ae9f1d2a0fa5:0",
      sourceZone: "battlefield",
      kind: "replacement",
      priority: "ordinary",
      source: "spell",
      recipient: "permanent-or-player",
      operation: {
        kind: "subtract",
        amount: 1,
      },
    },
  },
  {
    identity: "e5fa232a-c8f2-4532-88bf-60d1223181b0",
    sourceVersion: "132f0a8d4c54de37b2b1767105ef058bd30e46f44f647d54963a470499ad5959",
    sourceOrdinal: 34615,
    rawRecordHash: "c34e314ff4a9419bcde56e1efb30414859896c87ea65cb44a12140896bd5e082",
    name: "Urza's Armor",
    oracleText: "If a source would deal damage to you, prevent 1 of that damage.",
    typeLine: "Artifact",
    manaCostText: "{6}",
    manaValue: 6,
    power: null,
    toughness: null,
    colors: [],
    colorIdentity: [],
    sourceKeywords: [],
    keywords: [],
    manaCost: {
      generic: 6,
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
    },
    program: {
      schema: "commander-damage-static/1",
      id: "damage-static:e5fa232a-c8f2-4532-88bf-60d1223181b0:0",
      sourceZone: "battlefield",
      kind: "prevention",
      priority: "ordinary",
      source: "any",
      recipient: "source-controller",
      amount: 1,
    },
  },
  {
    identity: "9911c2f8-fafb-4979-898e-e86b726e3538",
    sourceVersion: "a0b9cd83c22891de1fa7034bf0a17595b74934f6833b4b91d5dd6e6ee63dcba8",
    sourceOrdinal: 23012,
    rawRecordHash: "6758133da18b99d0ad7fb9acc30d847e75637cd8e93a77de17d03cf5c3b2fd22",
    name: "Excruciator",
    oracleText: "Damage that would be dealt by this creature can't be prevented.",
    typeLine: "Creature — Avatar",
    manaCostText: "{6}{R}{R}",
    manaValue: 8,
    power: 7,
    toughness: 7,
    colors: ["R"],
    colorIdentity: ["R"],
    sourceKeywords: [],
    keywords: [],
    manaCost: {
      generic: 6,
      W: 0,
      U: 0,
      B: 0,
      R: 2,
      G: 0,
      C: 0,
    },
    program: {
      schema: "commander-damage-static/1",
      id: "damage-static:9911c2f8-fafb-4979-898e-e86b726e3538:0",
      sourceZone: "battlefield",
      kind: "damage-cannot-be-prevented",
      source: "this",
    },
  },
];
function definitionFor(source: DamageReplacementSource): CardDefinition {
  const [types, subtypes] = source.typeLine.split(" — ");
  return CardDefinition.parse({
    id: `oracle:${source.identity}`,
    oracleId: source.identity,
    sourceVersion: source.sourceVersion,
    name: source.name,
    typeLine: source.typeLine,
    types: [types],
    subtypes: subtypes ? [subtypes] : [],
    supertypes: [],
    colors: source.colors,
    colorIdentity: source.colorIdentity,
    manaCost: source.manaCost,
    manaValue: source.manaValue,
    power: source.power,
    toughness: source.toughness,
    keywords: source.keywords,
    manaAbilities: [],
    oracleText: source.oracleText,
    commanderEligible: false,
    deckLimit: 1,
    obligations: DAMAGE_REPLACEMENT_RULES.map((rule) => `rule:${rule}`),
    implementationRevision: DAMAGE_REPLACEMENT_VERSION,
    damagePrograms: [source.program],
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
    power: o.power ?? null,
    toughness: o.toughness ?? null,
    colors: o.colors ?? null,
    colorIdentity: o.color_identity,
    keywords: o.keywords,
    games: o.games,
    digital: o.digital ?? null,
  };
}
function expectedFacts(source: DamageReplacementSource) {
  return {
    name: source.name,
    oracleText: source.oracleText,
    typeLine: source.typeLine,
    manaCost: source.manaCostText,
    manaValue: source.manaValue,
    power: source.power === null ? null : String(source.power),
    toughness: source.toughness === null ? null : String(source.toughness),
    colors: source.colors,
    colorIdentity: source.colorIdentity,
    keywords: source.sourceKeywords,
    games: ["paper", "mtgo"],
    digital: false,
  };
}
export function bindDamageReplacementPermanent(card: CatalogCard): CardDefinition | null {
  const source = DAMAGE_REPLACEMENT_PERMANENTS.find((row) => row.identity === card.identity);
  if (!source) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    card.versionHash !== source.sourceVersion ||
    card.sourceArchiveHash !== DAMAGE_REPLACEMENT_ARCHIVE ||
    card.sourceOrdinal !== source.sourceOrdinal ||
    card.bundleHash !== DAMAGE_REPLACEMENT_SOURCE_BUNDLE ||
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
/** Exact reconstruction rejects erased/changed programs, constructor downgrades and altered characteristics. */
export function reviewedDamageReplacementDefinition(definition: CardDefinition): boolean {
  const source = DAMAGE_REPLACEMENT_PERMANENTS.find((row) => row.identity === definition.oracleId);
  return source !== undefined && canonicalJson(definition) === canonicalJson(definitionFor(source));
}
