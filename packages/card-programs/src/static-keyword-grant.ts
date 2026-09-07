import type { CatalogCard } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  type Cost,
  canonicalJson,
  type Keyword,
  type ManaColor,
  type StaticKeywordGrant,
} from "@iwsdk-apps/contracts";
import { STATIC_KEYWORD_GRANTS } from "./static-keyword-grant-data";

export { STATIC_KEYWORD_GRANTS } from "./static-keyword-grant-data";

export const STATIC_KEYWORD_GRANT_VERSION = "static-keyword-grant-permanent/1";
export const STATIC_KEYWORD_GRANT_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const STATIC_KEYWORD_GRANT_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const STATIC_KEYWORD_GRANT_RULES_HASH =
  "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f";
export const STATIC_KEYWORD_GRANT_RESEARCH_HASH =
  "d5a8576faf756c3357000aeb488e337742f06602b17558112939641f90e2f57a";
export const STATIC_KEYWORD_GRANT_RULES = [
  "109.2",
  "109.5",
  "113.6",
  "202.2",
  "205.3m",
  "207.2a",
  "207.2d",
  "302.1",
  "302.6",
  "400.7",
  "508.1a",
  "509.1b",
  "510.4",
  "604.1",
  "604.2",
  "604.7",
  "611.3a",
  "611.3b",
  "611.3c",
  "613.1f",
  "613.3",
  "613.5",
  "613.7",
  "613.8",
  "702.2",
  "702.3",
  "702.4",
  "702.7",
  "702.9",
  "702.10",
  "702.11",
  "702.12",
  "702.13",
  "702.15",
  "702.17",
  "702.19",
  "702.20",
  "702.28",
  "702.31",
  "702.36",
  "702.111",
  "704.3",
  "704.5f",
  "704.5g",
  "704.5h",
  "903.3",
  "903.4",
  "903.5a",
  "903.5b",
  "903.5c",
] as const;
export interface StaticKeywordGrantSource {
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
  types: string[];
  subtypes: string[];
  supertypes: string[];
  games: string[];
  digital: boolean;
  program: StaticKeywordGrant;
}
const byIdentity = new Map(STATIC_KEYWORD_GRANTS.map((source) => [source.identity, source]));
function definitionFor(source: StaticKeywordGrantSource): CardDefinition {
  return CardDefinition.parse({
    id: `oracle:${source.identity}`,
    oracleId: source.identity,
    sourceVersion: source.sourceVersion,
    name: source.name,
    typeLine: source.typeLine,
    types: source.types,
    subtypes: source.subtypes,
    supertypes: source.supertypes,
    colors: source.colors,
    colorIdentity: source.colorIdentity,
    manaCost: source.manaCost,
    manaValue: source.manaValue,
    power: source.power,
    toughness: source.toughness,
    keywords: source.keywords,
    manaAbilities: [],
    oracleText: source.oracleText,
    commanderEligible: source.supertypes.includes("Legendary") && source.types.includes("Creature"),
    deckLimit: 1,
    obligations: STATIC_KEYWORD_GRANT_RULES.map((rule) => `rule:${rule}`),
    implementationRevision: STATIC_KEYWORD_GRANT_VERSION,
    staticKeywordPrograms: [source.program],
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
function expectedFacts(source: StaticKeywordGrantSource) {
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
    games: source.games,
    digital: source.digital,
  };
}
/** Exact whole-record reconstruction. Representative games/digital facts remain unchanged; paper eligibility is independently imported evidence. */
export function bindStaticKeywordGrant(card: CatalogCard): CardDefinition | null {
  const source = byIdentity.get(card.identity);
  if (!source) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    card.versionHash !== source.sourceVersion ||
    card.sourceArchiveHash !== STATIC_KEYWORD_GRANT_ARCHIVE ||
    card.sourceOrdinal !== source.sourceOrdinal ||
    card.bundleHash !== STATIC_KEYWORD_GRANT_SOURCE_BUNDLE ||
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
/** Known identifiers cannot erase a program or claim a legacy constructor. */
export function reviewedStaticKeywordGrantDefinition(definition: CardDefinition): boolean {
  const source = byIdentity.get(definition.oracleId);
  return source !== undefined && canonicalJson(definition) === canonicalJson(definitionFor(source));
}
