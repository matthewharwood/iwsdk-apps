import type { CatalogCard } from "@iwsdk-apps/catalog";
import { type CardDefinition, canonicalJson, OrderedSelfEntryProgram } from "@iwsdk-apps/contracts";

export const SELF_ENTRY_SEQUENCE_VERSION = "self-entry-sequence-four/1";
export const SELF_ENTRY_SEQUENCE_RULES = [
  "608.2c",
  "117.2e",
  "121.1",
  "121.2",
  "121.4",
  "119.3",
  "704.4",
  "704.5b",
] as const;
/** Exactly four authenticated complete records; no prose recognition or open-ended family matching. */
export const SELF_ENTRY_SEQUENCES = [
  {
    identity: "f84d1291-1f82-4b67-a26e-b79624b4ce1d",
    sourceVersion: "9c1c7a7228eff2db7d8b40982bea5fb30775f3ea11efcea82d8a395640acc770",
    sourceArchiveHash: "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274",
    sourceOrdinal: 37464,
    sourceBundle: "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df",
    name: "Cloudblazer",
    oracleText: "Flying\nWhen this creature enters, you gain 2 life and draw two cards.",
    typeLine: "Creature \u2014 Human Scout",
    manaCost: "{3}{W}{U}",
    cost: { W: 1, U: 1, B: 0, R: 0, G: 0, C: 0, generic: 3 },
    manaValue: 5,
    power: 2,
    toughness: 2,
    colors: ["U", "W"],
    colorIdentity: ["U", "W"],
    keywords: ["Flying"],
    program: {
      schema: "commander-trigger/2",
      id: "self-entry-0",
      trigger: {
        kind: "self-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          amount: 2,
          recipient: "trigger-controller",
        },
        {
          kind: "draw",
          amount: 2,
          recipient: "trigger-controller",
        },
      ],
    },
  },
  {
    identity: "92dfeeb2-1117-422b-87ea-08a589f1134b",
    sourceVersion: "ccbca7002c12892cdade3f9eac050b9d5635a2abccabd911775b503d8b3158f5",
    sourceArchiveHash: "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274",
    sourceOrdinal: 22091,
    sourceBundle: "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df",
    name: "Elite Guardmage",
    oracleText: "Flying\nWhen this creature enters, you gain 3 life and draw a card.",
    typeLine: "Creature \u2014 Human Wizard",
    manaCost: "{2}{W}{U}",
    cost: { W: 1, U: 1, B: 0, R: 0, G: 0, C: 0, generic: 2 },
    manaValue: 4,
    power: 2,
    toughness: 3,
    colors: ["U", "W"],
    colorIdentity: ["U", "W"],
    keywords: ["Flying"],
    program: {
      schema: "commander-trigger/2",
      id: "self-entry-0",
      trigger: {
        kind: "self-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          amount: 3,
          recipient: "trigger-controller",
        },
        {
          kind: "draw",
          amount: 1,
          recipient: "trigger-controller",
        },
      ],
    },
  },
  {
    identity: "d646e42b-5635-4798-b633-29c093b66a55",
    sourceVersion: "62a754ae153c38533aa67eaac5c4790213d59567d3794010e817e16be4991b4b",
    sourceArchiveHash: "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274",
    sourceOrdinal: 32274,
    sourceBundle: "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df",
    name: "Inspiring Overseer",
    oracleText: "Flying\nWhen this creature enters, you gain 1 life and draw a card.",
    typeLine: "Creature \u2014 Angel Cleric",
    manaCost: "{2}{W}",
    cost: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 2 },
    manaValue: 3,
    power: 2,
    toughness: 1,
    colors: ["W"],
    colorIdentity: ["W"],
    keywords: ["Flying"],
    program: {
      schema: "commander-trigger/2",
      id: "self-entry-0",
      trigger: {
        kind: "self-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          amount: 1,
          recipient: "trigger-controller",
        },
        {
          kind: "draw",
          amount: 1,
          recipient: "trigger-controller",
        },
      ],
    },
  },
  {
    identity: "a89b0fd5-84b2-487c-8b03-e78d97276fd3",
    sourceVersion: "dcec03ce58fe31bdf5aae97fffc6739562254aa2fa274cdb639c88a7442a7ba3",
    sourceArchiveHash: "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274",
    sourceOrdinal: 25348,
    sourceBundle: "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df",
    name: "Priest of Ancient Lore",
    oracleText: "When this creature enters, you gain 1 life and draw a card.",
    typeLine: "Creature \u2014 Dwarf Cleric",
    manaCost: "{2}{W}",
    cost: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 2 },
    manaValue: 3,
    power: 2,
    toughness: 1,
    colors: ["W"],
    colorIdentity: ["W"],
    keywords: [],
    program: {
      schema: "commander-trigger/2",
      id: "self-entry-0",
      trigger: {
        kind: "self-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          amount: 1,
          recipient: "trigger-controller",
        },
        {
          kind: "draw",
          amount: 1,
          recipient: "trigger-controller",
        },
      ],
    },
  },
] as const;

function sourceTupleMatches(
  card: CatalogCard,
  recipe: (typeof SELF_ENTRY_SEQUENCES)[number],
): boolean {
  const oracle = card.oracle;
  return (
    card.identity === recipe.identity &&
    card.versionHash === recipe.sourceVersion &&
    card.sourceArchiveHash === recipe.sourceArchiveHash &&
    card.sourceOrdinal === recipe.sourceOrdinal &&
    card.bundleHash === recipe.sourceBundle &&
    oracle.oracle_id === recipe.identity &&
    oracle.name === recipe.name &&
    oracle.oracle_text === recipe.oracleText &&
    oracle.type_line === recipe.typeLine &&
    oracle.mana_cost === recipe.manaCost &&
    oracle.cmc === recipe.manaValue &&
    oracle.power === String(recipe.power) &&
    oracle.toughness === String(recipe.toughness) &&
    canonicalJson(oracle.colors) === canonicalJson(recipe.colors) &&
    canonicalJson(oracle.color_identity) === canonicalJson(recipe.colorIdentity) &&
    canonicalJson(oracle.keywords) === canonicalJson(recipe.keywords)
  );
}
export function bindSelfEntrySequence(
  card: CatalogCard,
): { program: OrderedSelfEntryProgram; remainder: string } | null {
  const recipe = SELF_ENTRY_SEQUENCES.find((entry) => sourceTupleMatches(card, entry));
  return recipe
    ? {
        program: OrderedSelfEntryProgram.parse(recipe.program),
        remainder: recipe.keywords.join(", "),
      }
    : null;
}
export function reviewedSequenceProposal(
  definition: CardDefinition,
): { program: OrderedSelfEntryProgram; remainder: string } | null {
  const recipe = SELF_ENTRY_SEQUENCES.find(
    (entry) =>
      definition.id === `oracle:${entry.identity}` &&
      definition.oracleId === entry.identity &&
      definition.sourceVersion === entry.sourceVersion &&
      definition.name === entry.name &&
      definition.oracleText === entry.oracleText &&
      definition.typeLine === entry.typeLine &&
      canonicalJson(definition.manaCost) === canonicalJson(entry.cost) &&
      definition.manaValue === entry.manaValue &&
      definition.power === entry.power &&
      definition.toughness === entry.toughness &&
      definition.commanderEligible === false &&
      definition.deckLimit === 1 &&
      canonicalJson(definition.colors) === canonicalJson(entry.colors) &&
      canonicalJson(definition.colorIdentity) === canonicalJson(entry.colorIdentity),
  );
  return recipe
    ? {
        program: OrderedSelfEntryProgram.parse(recipe.program),
        remainder: recipe.keywords.join(", "),
      }
    : null;
}
