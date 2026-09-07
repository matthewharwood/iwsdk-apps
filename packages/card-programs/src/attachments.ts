import type { CatalogCard } from "@iwsdk-apps/catalog";
import {
  type AttachmentProgram,
  CardDefinition,
  type Cost,
  canonicalJson,
  type Keyword,
  type ManaColor,
} from "@iwsdk-apps/contracts";
import { ATTACHMENT_PERMANENTS } from "./attachments-data";

export { ATTACHMENT_PERMANENTS } from "./attachments-data";

export const ATTACHMENT_VERSION = "attachment-permanent/1";
export const ATTACHMENT_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const ATTACHMENT_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const ATTACHMENT_RULES_HASH =
  "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f";
export const ATTACHMENT_RESEARCH_HASH =
  "f992b3ec3092db52507338258f2f8c28ed22a07da25887ad1306c9ac84ce021a";
export const ATTACHMENT_RULES = [
  "109.2",
  "109.5",
  "113.6",
  "113.7a",
  "115.1b",
  "202.2",
  "205.3",
  "207.2a",
  "301.1",
  "301.5",
  "301.5b",
  "301.5c",
  "301.5d",
  "301.5f",
  "303.4",
  "303.4a",
  "303.4c",
  "303.4d",
  "303.4e",
  "303.4m",
  "307.1",
  "400.7",
  "601.2c",
  "601.2f",
  "601.2g",
  "601.2h",
  "602.2",
  "602.5d",
  "603.6a",
  "608.2b",
  "608.3b",
  "608.3c",
  "611.3a",
  "611.3b",
  "611.3c",
  "613.1f",
  "613.4c",
  "613.7",
  "701.3",
  "701.3a",
  "701.3b",
  "701.3c",
  "701.3d",
  "702.2",
  "702.3",
  "702.4",
  "702.5",
  "702.6",
  "702.7",
  "702.8",
  "702.9",
  "702.10",
  "702.11",
  "702.12",
  "702.13",
  "702.14",
  "702.15",
  "702.17",
  "702.18",
  "702.19",
  "702.20",
  "702.36",
  "702.111",
  "704.3",
  "704.4",
  "704.5f",
  "704.5g",
  "704.5h",
  "704.5m",
  "704.5n",
  "704.5p",
  "800.4a",
  "903.4",
  "903.5a",
  "903.5b",
  "903.5c",
  "903.9a",
  "903.9b",
] as const;
export const ATTACHMENT_ANNEX_RESEARCH_HASH =
  "a9f6eb3bb3598bcd90d928b4b5b650dd0391f27b8a560e9c57614e0feba78fde";
export interface AttachmentSource {
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
  program: AttachmentProgram;
}
const byIdentity = new Map(ATTACHMENT_PERMANENTS.map((source) => [source.identity, source]));
function definitionFor(source: AttachmentSource): CardDefinition {
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
    obligations: ATTACHMENT_RULES.map((rule) => `rule:${rule}`),
    implementationRevision: ATTACHMENT_VERSION,
    attachmentProgram: source.program,
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
function expectedFacts(source: AttachmentSource) {
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
export function bindAttachmentPermanent(card: CatalogCard): CardDefinition | null {
  const source = byIdentity.get(card.identity);
  if (!source) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    card.versionHash !== source.sourceVersion ||
    card.sourceArchiveHash !== ATTACHMENT_ARCHIVE ||
    card.sourceOrdinal !== source.sourceOrdinal ||
    card.bundleHash !== ATTACHMENT_SOURCE_BUNDLE ||
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
export function reviewedAttachmentDefinition(definition: CardDefinition): boolean {
  const source = byIdentity.get(definition.oracleId);
  return source !== undefined && canonicalJson(definition) === canonicalJson(definitionFor(source));
}
