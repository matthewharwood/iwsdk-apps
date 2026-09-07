import type { CatalogCard } from "@iwsdk-apps/catalog";
import { CardDefinition, canonicalJson } from "@iwsdk-apps/contracts";

export const STRICT_PROCTOR_VERSION = "strict-proctor-trigger/1";
export const STRICT_PROCTOR_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const STRICT_PROCTOR_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const STRICT_PROCTOR_RULES_HASH =
  "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f";
export const STRICT_PROCTOR_RESEARCH_HASH =
  "910bdbd92210a1eb3a5bc1919abff5809921afd341b3d8841afe48acc6b4b9c8";
export const STRICT_PROCTOR_SOURCE_REVIEW_HASH =
  "289216981d267f3f5d4d89d6d23ba6d8347dfa190d874f403c77ae6f963a38e9";
export const STRICT_PROCTOR_RULES = [
  "101.4",
  "107.4b",
  "113.6",
  "113.7",
  "113.7a",
  "113.8",
  "115.1d",
  "115.10a",
  "117.1d",
  "117.2a",
  "117.2e",
  "117.5",
  "118.2",
  "118.3",
  "118.3a",
  "118.3c",
  "118.10",
  "118.12a",
  "302.1",
  "603.1",
  "603.2",
  "603.2c",
  "603.3",
  "603.3a",
  "603.3b",
  "603.5",
  "603.6a",
  "603.10",
  "605.3a",
  "605.3b",
  "608.2d",
  "608.2g",
  "608.2h",
  "608.2n",
  "609.3",
  "701.6a",
  "702.9b",
  "704.3",
  "704.4",
  "800.4a",
  "800.4d",
  "800.4f",
  "800.4j",
  "903.5c",
] as const;
export interface StrictProctorSource {
  identity: string;
  sourceVersion: string;
  sourceOrdinal: number;
  rawRecordHash: string;
  name: string;
  oracleText: string;
  typeLine: string;
}
/** One complete pinned source; other counters, copies and additional-trigger text remain distinct. */
export const STRICT_PROCTOR_PERMANENTS: readonly StrictProctorSource[] = [
  {
    identity: "b967870d-9773-4ad5-bf06-c3be5465dab9",
    sourceVersion: "41c5279028ebe43468ce43356e2af1b53665fc862d43ce00750ea7fca5378920",
    sourceOrdinal: 27844,
    rawRecordHash: "c95d112b9ce57a624741e4a9662b8a4549bc87c8935daa24267e3cb1337c911a",
    name: "Strict Proctor",
    oracleText:
      "Flying\nWhenever a permanent entering causes a triggered ability to trigger, counter that ability unless its controller pays {2}.",
    typeLine: "Creature — Spirit Cleric",
  },
];
function definitionFor(source: StrictProctorSource): CardDefinition {
  return CardDefinition.parse({
    id: `oracle:${source.identity}`,
    oracleId: source.identity,
    sourceVersion: source.sourceVersion,
    name: source.name,
    typeLine: source.typeLine,
    types: ["Creature"],
    subtypes: ["Spirit", "Cleric"],
    supertypes: [],
    colors: ["W"],
    colorIdentity: ["W"],
    manaCost: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 1 },
    manaValue: 2,
    power: 1,
    toughness: 3,
    keywords: ["flying"],
    manaAbilities: [],
    oracleText: source.oracleText,
    commanderEligible: false,
    deckLimit: 1,
    obligations: STRICT_PROCTOR_RULES.map((rule) => `rule:${rule}`),
    implementationRevision: STRICT_PROCTOR_VERSION,
    triggerPrograms: [
      {
        schema: "commander-entry-caused-trigger/1",
        id: `strict-proctor:${source.identity}:0`,
        trigger: {
          kind: "ability-triggered",
          immediateCause: "battlefield-entry",
          sourceZone: "battlefield",
          view: "post-committed-event",
          placementClass: "triggered-by-trigger",
        },
        effect: {
          kind: "counter-referenced-trigger-unless-paid",
          reference: "triggering-ability",
          payer: "referenced-ability-controller",
          cost: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        },
      },
    ],
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
function expectedFacts(source: StrictProctorSource) {
  return {
    name: source.name,
    oracleText: source.oracleText,
    typeLine: source.typeLine,
    manaCost: "{1}{W}",
    manaValue: 2,
    power: "1",
    toughness: "3",
    colors: ["W"],
    colorIdentity: ["W"],
    keywords: ["Flying"],
    games: ["arena", "paper", "mtgo"],
    digital: false,
  };
}
export function bindStrictProctorPermanent(card: CatalogCard): CardDefinition | null {
  const source = STRICT_PROCTOR_PERMANENTS.find((row) => row.identity === card.identity);
  if (!source) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    card.versionHash !== source.sourceVersion ||
    card.sourceArchiveHash !== STRICT_PROCTOR_ARCHIVE ||
    card.sourceOrdinal !== source.sourceOrdinal ||
    card.bundleHash !== STRICT_PROCTOR_SOURCE_BUNDLE ||
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
/** Exact reconstruction rejects erased tax, changed references, altered characteristics and recipe downgrades. */
export function reviewedStrictProctorDefinition(definition: CardDefinition): boolean {
  const source = STRICT_PROCTOR_PERMANENTS.find((row) => row.identity === definition.oracleId);
  return source !== undefined && canonicalJson(definition) === canonicalJson(definitionFor(source));
}
