import type { CatalogCard } from "@iwsdk-apps/catalog";
import {
  type BlockingRestriction,
  CardDefinition,
  type Cost,
  canonicalJson,
  type Keyword,
  type ManaColor,
} from "@iwsdk-apps/contracts";
import { STATIC_EVASION_PERMANENTS } from "./static-evasion-data";

export { STATIC_EVASION_PERMANENTS } from "./static-evasion-data";

export const STATIC_EVASION_VERSION = "static-evasion-permanent/1";
export const STATIC_EVASION_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const STATIC_EVASION_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const STATIC_EVASION_RULES_HASH =
  "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f";
export const STATIC_EVASION_RESEARCH_HASH =
  "f228e431621f290003d9368b43e94d54bc2a885a593d05813eb6f1f955adcbf4";
export const STATIC_EVASION_RULES = [
  "113.6",
  "302.1",
  "400.7",
  "506.4a",
  "509.1",
  "509.1a",
  "509.1b",
  "509.1g",
  "509.1h",
  "509.2",
  "613.4c",
  "702.9b",
  "702.10",
  "702.11",
  "702.13b",
  "702.14c",
  "702.14d",
  "702.15",
  "702.17b",
  "702.18",
  "702.19",
  "702.20",
  "702.28b",
  "702.31b",
  "702.36b",
  "702.118b",
  "903.5a",
  "903.5b",
  "903.5c",
] as const;
export interface StaticEvasionSource {
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
  blockingRestrictions: BlockingRestriction[];
}
const byIdentity = new Map(STATIC_EVASION_PERMANENTS.map((source) => [source.identity, source]));
function definitionFor(source: StaticEvasionSource): CardDefinition {
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
    obligations: STATIC_EVASION_RULES.map((rule) => `rule:${rule}`),
    implementationRevision: STATIC_EVASION_VERSION,
    ...(source.blockingRestrictions.length
      ? { blockingRestrictions: source.blockingRestrictions }
      : {}),
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
function expectedFacts(source: StaticEvasionSource) {
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
export function bindStaticEvasionPermanent(card: CatalogCard): CardDefinition | null {
  const source = byIdentity.get(card.identity);
  if (!source) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    card.versionHash !== source.sourceVersion ||
    card.sourceArchiveHash !== STATIC_EVASION_ARCHIVE ||
    card.sourceOrdinal !== source.sourceOrdinal ||
    card.bundleHash !== STATIC_EVASION_SOURCE_BUNDLE ||
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
export function reviewedStaticEvasionDefinition(definition: CardDefinition): boolean {
  const source = byIdentity.get(definition.oracleId);
  return source !== undefined && canonicalJson(definition) === canonicalJson(definitionFor(source));
}
