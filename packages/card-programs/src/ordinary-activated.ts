import type { CatalogCard } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  type Cost,
  canonicalJson,
  type Keyword,
  type ManaColor,
  type OrdinaryActivatedProgram,
} from "@iwsdk-apps/contracts";
import { ORDINARY_ACTIVATED_PERMANENTS } from "./ordinary-activated-data";

export { ORDINARY_ACTIVATED_PERMANENTS } from "./ordinary-activated-data";

export const ORDINARY_ACTIVATED_VERSION = "ordinary-activated-permanent/1";
export const ORDINARY_ACTIVATED_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const ORDINARY_ACTIVATED_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const ORDINARY_ACTIVATED_RULES_HASH =
  "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f";
export const ORDINARY_ACTIVATED_RESEARCH_HASH =
  "1dc8a25f150c6fe3844a2f20a261b7156fa46fbf21845c6d2a2f33646a4519b6";
export const ORDINARY_ACTIVATED_RULES = [
  "113.7",
  "113.7a",
  "117.1b",
  "118.3",
  "201.5",
  "201.5c",
  "302.6",
  "400.7",
  "601.2c",
  "601.2f",
  "601.2g",
  "601.2h",
  "601.2i",
  "602.1",
  "602.1a",
  "602.1b",
  "602.2",
  "602.2a",
  "602.2b",
  "602.5a",
  "608.2b",
  "608.2c",
  "611.2c",
  "613.4c",
  "704.3",
  "903.5a",
  "903.5b",
  "903.5c",
] as const;
export interface OrdinaryActivatedSource {
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
  category: "self-pt" | "target-pt" | "self-keyword" | "draw" | "gain-life" | "tap-creature";
  activationText: string;
  program: OrdinaryActivatedProgram;
  reviewedReminders: { paragraph: string; keyword: string; literal: string }[];
}
const byIdentity = new Map(
  ORDINARY_ACTIVATED_PERMANENTS.map((source) => [source.identity, source]),
);
function definitionFor(source: OrdinaryActivatedSource): CardDefinition {
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
    obligations: ORDINARY_ACTIVATED_RULES.map((rule) => `rule:${rule}`),
    implementationRevision: ORDINARY_ACTIVATED_VERSION,
    activatedPrograms: [source.program],
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
function expectedFacts(source: OrdinaryActivatedSource) {
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
export function bindOrdinaryActivatedPermanent(card: CatalogCard): CardDefinition | null {
  const source = byIdentity.get(card.identity);
  if (!source) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    card.versionHash !== source.sourceVersion ||
    card.sourceArchiveHash !== ORDINARY_ACTIVATED_ARCHIVE ||
    card.sourceOrdinal !== source.sourceOrdinal ||
    card.bundleHash !== ORDINARY_ACTIVATED_SOURCE_BUNDLE ||
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
export function reviewedOrdinaryActivatedDefinition(definition: CardDefinition): boolean {
  const source = byIdentity.get(definition.oracleId);
  return source !== undefined && canonicalJson(definition) === canonicalJson(definitionFor(source));
}
