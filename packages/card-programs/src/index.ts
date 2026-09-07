import {
  bindStaticKeywordGrant,
  STATIC_KEYWORD_GRANT_VERSION,
  STATIC_KEYWORD_GRANTS,
} from "./static-keyword-grant";

export {
  bindStaticKeywordGrant,
  reviewedStaticKeywordGrantDefinition,
  STATIC_KEYWORD_GRANT_ARCHIVE,
  STATIC_KEYWORD_GRANT_RESEARCH_HASH,
  STATIC_KEYWORD_GRANT_RULES,
  STATIC_KEYWORD_GRANT_RULES_HASH,
  STATIC_KEYWORD_GRANT_SOURCE_BUNDLE,
  STATIC_KEYWORD_GRANT_VERSION,
  STATIC_KEYWORD_GRANTS,
  type StaticKeywordGrantSource,
} from "./static-keyword-grant";

import {
  bindStaticEvasionPermanent,
  STATIC_EVASION_PERMANENTS,
  STATIC_EVASION_VERSION,
} from "./static-evasion";

export {
  bindStaticEvasionPermanent,
  reviewedStaticEvasionDefinition,
  STATIC_EVASION_ARCHIVE,
  STATIC_EVASION_PERMANENTS,
  STATIC_EVASION_RESEARCH_HASH,
  STATIC_EVASION_RULES,
  STATIC_EVASION_RULES_HASH,
  STATIC_EVASION_SOURCE_BUNDLE,
  STATIC_EVASION_VERSION,
  type StaticEvasionSource,
} from "./static-evasion";

import {
  bindOrdinaryActivatedPermanent,
  ORDINARY_ACTIVATED_PERMANENTS,
  ORDINARY_ACTIVATED_VERSION,
} from "./ordinary-activated";

export {
  bindOrdinaryActivatedPermanent,
  ORDINARY_ACTIVATED_ARCHIVE,
  ORDINARY_ACTIVATED_PERMANENTS,
  ORDINARY_ACTIVATED_RESEARCH_HASH,
  ORDINARY_ACTIVATED_RULES,
  ORDINARY_ACTIVATED_RULES_HASH,
  ORDINARY_ACTIVATED_SOURCE_BUNDLE,
  ORDINARY_ACTIVATED_VERSION,
  type OrdinaryActivatedSource,
  reviewedOrdinaryActivatedDefinition,
} from "./ordinary-activated";

import {
  bindDamageReplacementPermanent,
  DAMAGE_REPLACEMENT_PERMANENTS,
  DAMAGE_REPLACEMENT_VERSION,
} from "./damage-replacement";

export {
  bindDamageReplacementPermanent,
  DAMAGE_REPLACEMENT_ARCHIVE,
  DAMAGE_REPLACEMENT_PERMANENTS,
  DAMAGE_REPLACEMENT_RESEARCH_HASH,
  DAMAGE_REPLACEMENT_RULES,
  DAMAGE_REPLACEMENT_RULES_HASH,
  DAMAGE_REPLACEMENT_SOURCE_BUNDLE,
  DAMAGE_REPLACEMENT_VERSION,
  type DamageReplacementSource,
  reviewedDamageReplacementDefinition,
} from "./damage-replacement";

import {
  bindStrictProctorPermanent,
  STRICT_PROCTOR_PERMANENTS,
  STRICT_PROCTOR_VERSION,
} from "./strict-proctor";

export {
  bindStrictProctorPermanent,
  reviewedStrictProctorDefinition,
  STRICT_PROCTOR_ARCHIVE,
  STRICT_PROCTOR_PERMANENTS,
  STRICT_PROCTOR_RESEARCH_HASH,
  STRICT_PROCTOR_RULES,
  STRICT_PROCTOR_RULES_HASH,
  STRICT_PROCTOR_SOURCE_BUNDLE,
  STRICT_PROCTOR_SOURCE_REVIEW_HASH,
  STRICT_PROCTOR_VERSION,
  type StrictProctorSource,
} from "./strict-proctor";

import {
  bindConditionalSelfEntryPermanent,
  CONDITIONAL_SELF_ENTRY_PERMANENTS,
  CONDITIONAL_SELF_ENTRY_VERSION,
} from "./conditional-self-entry";

export {
  bindConditionalSelfEntryPermanent,
  CONDITIONAL_SELF_ENTRY_ARCHIVE,
  CONDITIONAL_SELF_ENTRY_PERMANENTS,
  CONDITIONAL_SELF_ENTRY_RESEARCH_HASH,
  CONDITIONAL_SELF_ENTRY_RULES,
  CONDITIONAL_SELF_ENTRY_RULES_HASH,
  CONDITIONAL_SELF_ENTRY_SOURCE_BUNDLE,
  CONDITIONAL_SELF_ENTRY_SOURCE_PACK_HASH,
  CONDITIONAL_SELF_ENTRY_VERSION,
  type ConditionalSelfEntrySource,
  reviewedConditionalSelfEntryDefinition,
} from "./conditional-self-entry";

import {
  bindEntryObserverPermanent,
  ENTRY_OBSERVER_PERMANENTS,
  ENTRY_OBSERVER_VERSION,
} from "./entry-observer";

export {
  bindEntryObserverPermanent,
  ENTRY_OBSERVER_ARCHIVE,
  ENTRY_OBSERVER_PERMANENTS,
  ENTRY_OBSERVER_RESEARCH_HASH,
  ENTRY_OBSERVER_RULES,
  ENTRY_OBSERVER_RULES_HASH,
  ENTRY_OBSERVER_SOURCE_BUNDLE,
  ENTRY_OBSERVER_VERSION,
  type EntryObserverPermanentSource,
  reviewedEntryObserverDefinition,
} from "./entry-observer";

import {
  bindStaticBonusPermanent,
  STATIC_BONUS_PERMANENTS,
  STATIC_BONUS_VERSION,
} from "./static-bonus";
import { bindFixedTokenSpell, FIXED_TOKEN_VERSION } from "./token-creation";

export {
  bindStaticBonusPermanent,
  reviewedStaticBonusDefinition,
  STATIC_BONUS_ARCHIVE,
  STATIC_BONUS_PERMANENTS,
  STATIC_BONUS_RESEARCH_HASH,
  STATIC_BONUS_RULES,
  STATIC_BONUS_RULES_HASH,
  STATIC_BONUS_SOURCE_BUNDLE,
  STATIC_BONUS_VERSION,
  type StaticBonusPermanentSource,
} from "./static-bonus";

export {
  bindFixedTokenSpell,
  FIXED_TOKEN_ARCHIVE,
  FIXED_TOKEN_RULES,
  FIXED_TOKEN_RULES_HASH,
  FIXED_TOKEN_SOURCE_BUNDLE,
  FIXED_TOKEN_SPELLS,
  FIXED_TOKEN_TEMPLATES,
  FIXED_TOKEN_VERSION,
  type FixedTokenSpellSource,
  reviewedFixedTokenDefinition,
  reviewedTokenTemplate,
} from "./token-creation";

import { bindCreatureReturnSpell, CREATURE_RETURN_VERSION } from "./creature-return";

export {
  bindCreatureReturnSpell,
  CREATURE_RETURN_ARCHIVE,
  CREATURE_RETURN_RULES,
  CREATURE_RETURN_SOURCE_BUNDLE,
  CREATURE_RETURN_SPELLS,
  CREATURE_RETURN_VERSION,
  type CreatureReturnSpellSource,
  reviewedCreatureReturnSpellDefinition,
} from "./creature-return";

import type { CatalogCard } from "@iwsdk-apps/catalog";
import { bindCounterSpell, COUNTER_SPELL_VERSION } from "./counter-spells";

export {
  bindCounterSpell,
  COUNTER_SPELL_ARCHIVE,
  COUNTER_SPELL_RULES,
  COUNTER_SPELL_SOURCE_BUNDLE,
  COUNTER_SPELL_VERSION,
  COUNTER_SPELLS,
  type CounterSpellSource,
  reviewedCounterSpellDefinition,
} from "./counter-spells";

import {
  CardDefinition,
  type Cost,
  canonicalJson,
  emptyMana,
  type Keyword,
  type ManaColor,
  selfEntryEffects,
} from "@iwsdk-apps/contracts";
import {
  exactKeywordReminder,
  KEYWORD_REMINDER_RECIPE_VERSION,
  KEYWORD_REMINDER_RULES,
} from "./keyword-reminders";
import { proposeSelfEntryBody, SELF_ENTRY_RECIPE_VERSION, SELF_ENTRY_RULES } from "./self-entry";
import {
  bindSelfEntrySequence,
  reviewedSequenceProposal,
  SELF_ENTRY_SEQUENCE_RULES,
  SELF_ENTRY_SEQUENCE_VERSION,
} from "./self-entry-sequence";

export {
  bindSelfEntrySequence,
  SELF_ENTRY_SEQUENCE_RULES,
  SELF_ENTRY_SEQUENCE_VERSION,
  SELF_ENTRY_SEQUENCES,
} from "./self-entry-sequence";

import { bindExactSpellFamily, SPELL_FAMILY_VERSION } from "./spell-families";
import { bindTemporaryCreatureSpell, TEMPORARY_CREATURE_VERSION } from "./temporary-creature";

export {
  bindTemporaryCreatureSpell,
  reviewedTemporaryCreatureDefinition,
  TEMPORARY_CREATURE_ARCHIVE,
  TEMPORARY_CREATURE_BODIES,
  TEMPORARY_CREATURE_RULES,
  TEMPORARY_CREATURE_SOURCE_BUNDLE,
  TEMPORARY_CREATURE_SPELLS,
  TEMPORARY_CREATURE_VERSION,
} from "./temporary-creature";

import { REVIEWED_SPELLS, SPELL_RECIPE_VERSION } from "./spells";

export {
  exactKeywordReminder,
  KEYWORD_REMINDER_RECIPE_VERSION,
  KEYWORD_REMINDER_REGISTRY,
  KEYWORD_REMINDER_RULES,
} from "./keyword-reminders";

export {
  proposeSelfEntryBody,
  SELF_ENTRY_RECIPE_VERSION,
  SELF_ENTRY_REGISTRY,
  SELF_ENTRY_RULES,
} from "./self-entry";

export {
  bindExactSpellFamily,
  SPELL_FAMILY_REGISTRY,
  SPELL_FAMILY_VERSION,
} from "./spell-families";
export { REVIEWED_SPELLS, SPELL_RECIPE_VERSION } from "./spells";

export const RECIPE_VERSION = "commander-development-recipes/1";
export const LEGACY_KEYWORD_RULES = {
  flying: "702.9",
  reach: "702.17",
  vigilance: "702.20",
  haste: "702.10",
  defender: "702.3",
  menace: "702.111",
  trample: "702.19",
  "first-strike": "702.7",
  "double-strike": "702.4",
  deathtouch: "702.2",
  lifelink: "702.15",
  indestructible: "702.12",
  hexproof: "702.11",
  shroud: "702.18",
  flash: "702.8",
};
export const KEYWORD_RULES: Record<Keyword, string> = {
  ...LEGACY_KEYWORD_RULES,
  fear: "702.36",
  intimidate: "702.13",
  horsemanship: "702.31",
  shadow: "702.28",
  skulk: "702.118",
  plainswalk: "702.14",
  islandwalk: "702.14",
  swampwalk: "702.14",
  mountainwalk: "702.14",
  forestwalk: "702.14",
};
export const RECIPE_REGISTRY = [
  {
    id: SPELL_RECIPE_VERSION,
    rules: ["304.1", "307.1", "601.2c", "608.2b", "608.2c", "120.3", "121.1", "119.3"],
    description:
      "Seven exact version-pinned Oracle spell records map to typed draw, life gain, and single-creature damage sequences.",
    review:
      "Manual complete text mapping; constructor tests do not certify engine execution or general targeting.",
  },
  {
    id: "basic-land/1",
    rules: ["305.6", "107.4a", "605.1a", "605.3", "903.5"],
    description: "Exact ordinary basic land type/name; intrinsic tap mana. No additional text.",
    review: "Manual recipe mapping; binding tests are not engine semantic certification.",
  },
  {
    id: "ordinary-creature/1",
    rules: ["202.1", "208.1", "302", "601.2", "903.3", "903.5"],
    description:
      "Single normal face; ordinary creature types, integer P/T and plain mana cost; no printed behavior.",
    review:
      "Manual recipe mapping; implicit creature and deck rules still require engine verification.",
  },
  {
    id: "keyword-creature/1",
    rules: Object.values(KEYWORD_RULES),
    description:
      "Every complete comma/newline-delimited text clause is a supported keyword label; no text remainder or reminder stripping.",
    review: "Manual exact syntax-to-keyword binding; dedicated rules processors own semantics.",
  },
  {
    id: "mana-creature/1",
    rules: ["302.6", "602.2", "605.1a", "605.3"],
    description: "Exact {T}: Add {single color}. clause, optionally with supported keyword labels.",
    review: "Manual cost/output mapping; no interpretation of general activation text.",
  },
] as const;

export type BindingResult =
  | { kind: "bound"; definition: CardDefinition; recipes: string[] }
  | { kind: "unsupported"; reason: string };

const BASIC_TYPES: Record<string, ManaColor> = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
};
const SUPERTYPES = new Set(["Basic", "Legendary"]);
const ORDINARY_TYPES = new Set(["Artifact", "Enchantment", "Creature"]);
const KEYWORDS = new Map(
  Object.keys(LEGACY_KEYWORD_RULES).map((keyword) => [
    keyword.replaceAll("-", " "),
    keyword as Keyword,
  ]),
);

export function parsePlainManaCost(source: string): Cost | null {
  const tokens = source.match(/\{(?:\d+|[WUBRGC])\}/g);
  if (!tokens?.length || tokens.join("") !== source) return null;
  const cost: Cost = { ...emptyMana(), generic: 0 };
  for (const token of tokens) {
    const symbol = token.slice(1, -1);
    if (/^\d+$/.test(symbol)) cost.generic += Number(symbol);
    else cost[symbol as ManaColor]++;
  }
  if (!Object.values(cost).every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  return cost;
}

function characteristics(
  card: CatalogCard,
): { types: string[]; supertypes: string[]; subtypes: string[] } | null {
  const source = card.oracle.type_line;
  if (!source) return null;
  const parts = source.split(" — ");
  if (parts.length > 2) return null;
  const tokens = parts[0]?.split(" ") ?? [];
  return {
    types: tokens.filter((item) => !SUPERTYPES.has(item)),
    supertypes: tokens.filter((item) => SUPERTYPES.has(item)),
    subtypes: parts[1]?.split(" ") ?? [],
  };
}

function textProgram(
  text: string,
  keywordReminders = false,
): { keywords: Keyword[]; manaAbilities: ManaColor[] } | null {
  const keywords: Keyword[] = [],
    manaAbilities: ManaColor[] = [];
  if (!text) return { keywords, manaAbilities };
  for (const line of text.split("\n")) {
    const annotated = keywordReminders ? exactKeywordReminder(line) : null;
    if (annotated) {
      keywords.push(annotated);
      continue;
    }
    const mana = /^\{T\}: Add \{([WUBRGC])\}\.$/.exec(line);
    if (mana?.[1]) {
      manaAbilities.push(mana[1] as ManaColor);
      continue;
    }
    for (const clause of line.split(", ")) {
      const keyword = KEYWORDS.get(clause.toLowerCase());
      if (!keyword) return null;
      keywords.push(keyword);
    }
  }
  if (
    new Set(keywords).size !== keywords.length ||
    new Set(manaAbilities).size !== manaAbilities.length
  )
    return null;
  return { keywords, manaAbilities };
}

/** Reconstruct the finite whole-body declaration before using its empty external-dependency claim. */
export function reviewedSelfEntryDefinition(definition: CardDefinition): boolean {
  const typeParts = definition.typeLine.split(" — ");
  const typeTokens = typeParts[0]?.split(" ") ?? [];
  if (
    ![SELF_ENTRY_RECIPE_VERSION, SELF_ENTRY_SEQUENCE_VERSION].includes(
      definition.implementationRevision,
    ) ||
    definition.triggerPrograms === undefined ||
    !definition.types.includes("Creature") ||
    definition.types.some((type) => !ORDINARY_TYPES.has(type)) ||
    definition.supertypes.some((type) => !SUPERTYPES.has(type)) ||
    typeParts.length > 2 ||
    canonicalJson(definition.types) !==
      canonicalJson(typeTokens.filter((type) => !SUPERTYPES.has(type))) ||
    canonicalJson(definition.supertypes) !==
      canonicalJson(typeTokens.filter((type) => SUPERTYPES.has(type))) ||
    canonicalJson(definition.subtypes) !== canonicalJson(typeParts[1]?.split(" ") ?? []) ||
    !Number.isSafeInteger(definition.power) ||
    !Number.isSafeInteger(definition.toughness) ||
    definition.manaCost === null ||
    definition.manaValue !==
      Object.values(definition.manaCost).reduce((sum, amount) => sum + amount, 0) ||
    definition.spellProgram !== undefined
  )
    return false;
  const entry =
    definition.implementationRevision === SELF_ENTRY_SEQUENCE_VERSION
      ? reviewedSequenceProposal(definition)
      : proposeSelfEntryBody(definition.oracleText);
  const remainder = entry ? textProgram(entry.remainder) : null;
  return (
    entry !== null &&
    remainder !== null &&
    canonicalJson(definition.triggerPrograms) === canonicalJson([entry.program]) &&
    canonicalJson(definition.keywords) === canonicalJson(remainder.keywords) &&
    canonicalJson(definition.manaAbilities) === canonicalJson(remainder.manaAbilities)
  );
}

/** Shared ordinary characteristic proof used only by reviewed creature constructors. */
function ordinaryDefinition(definition: CardDefinition): boolean {
  const typeParts = definition.typeLine.split(" — ");
  const typeTokens = typeParts[0]?.split(" ") ?? [];
  if (
    !definition.types.includes("Creature") ||
    definition.types.some((type) => !ORDINARY_TYPES.has(type)) ||
    definition.supertypes.some((type) => !SUPERTYPES.has(type)) ||
    typeParts.length > 2 ||
    canonicalJson(definition.types) !==
      canonicalJson(typeTokens.filter((type) => !SUPERTYPES.has(type))) ||
    canonicalJson(definition.supertypes) !==
      canonicalJson(typeTokens.filter((type) => SUPERTYPES.has(type))) ||
    canonicalJson(definition.subtypes) !== canonicalJson(typeParts[1]?.split(" ") ?? []) ||
    !Number.isSafeInteger(definition.power) ||
    !Number.isSafeInteger(definition.toughness) ||
    definition.manaCost === null ||
    definition.manaValue !==
      Object.values(definition.manaCost).reduce((sum, amount) => sum + amount, 0) ||
    definition.spellProgram !== undefined
  )
    return false;
  return true;
}
/** Source annotations do not change the rule programs. Unknown or altered complete bodies fail closed. */
export function reviewedKeywordReminderDefinition(definition: CardDefinition): boolean {
  if (
    definition.implementationRevision !== KEYWORD_REMINDER_RECIPE_VERSION ||
    !ordinaryDefinition(definition) ||
    definition.id !== `oracle:${definition.oracleId}` ||
    definition.deckLimit !== 1 ||
    definition.commanderEligible !== definition.supertypes.includes("Legendary") ||
    !definition.oracleText.split("\n").some((line) => exactKeywordReminder(line) !== null)
  )
    return false;
  const entry = proposeSelfEntryBody(definition.oracleText);
  const program = textProgram(entry?.remainder ?? definition.oracleText, true);
  return (
    program !== null &&
    canonicalJson(definition.keywords) === canonicalJson(program.keywords) &&
    canonicalJson(definition.manaAbilities) === canonicalJson(program.manaAbilities) &&
    (entry
      ? canonicalJson(definition.triggerPrograms) === canonicalJson([entry.program])
      : definition.triggerPrograms === undefined)
  );
}

function exactInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function definitionBase(card: CatalogCard, parts: NonNullable<ReturnType<typeof characteristics>>) {
  return {
    id: `oracle:${card.identity}`,
    oracleId: card.identity,
    sourceVersion: card.versionHash,
    name: card.oracle.name,
    typeLine: card.oracle.type_line ?? "",
    ...parts,
    colors: card.oracle.colors ?? [],
    colorIdentity: card.oracle.color_identity,
    oracleText: card.oracle.oracle_text ?? "",
    implementationRevision: RECIPE_VERSION,
  };
}

function basicLand(
  card: CatalogCard,
  parts: NonNullable<ReturnType<typeof characteristics>>,
): BindingResult {
  const color = BASIC_TYPES[card.oracle.name];
  const text = card.oracle.oracle_text;
  if (
    !color ||
    card.oracle.type_line !== `Basic Land — ${card.oracle.name}` ||
    (text !== "" && text !== `({T}: Add {${color}}.)`) ||
    (card.oracle.mana_cost !== undefined && card.oracle.mana_cost !== "")
  ) {
    return { kind: "unsupported", reason: "nonordinary-basic-land-or-additional-behavior" };
  }
  const definition = CardDefinition.parse({
    ...definitionBase(card, parts),
    manaCost: null,
    manaValue: 0,
    power: null,
    toughness: null,
    keywords: [],
    manaAbilities: [color],
    commanderEligible: false,
    deckLimit: null,
    obligations: ["rule:305.6", "rule:605.1a", "rule:903.5"],
  });
  return { kind: "bound", definition, recipes: ["basic-land/1"] };
}

function reviewedSpell(
  card: CatalogCard,
  parts: NonNullable<ReturnType<typeof characteristics>>,
): BindingResult {
  const recipe = REVIEWED_SPELLS.find((row) => row.identity === card.identity);
  if (!recipe) return { kind: "unsupported", reason: "spell-identity-has-no-reviewed-program" };
  if (
    card.versionHash !== recipe.sourceVersion ||
    card.oracle.oracle_id !== recipe.identity ||
    card.oracle.name !== recipe.name ||
    card.oracle.type_line !== recipe.type ||
    card.oracle.mana_cost !== recipe.cost ||
    card.oracle.oracle_text !== recipe.text
  )
    return { kind: "unsupported", reason: "reviewed-spell-source-mismatch" };
  const manaCost = parsePlainManaCost(recipe.cost);
  if (
    !manaCost ||
    card.oracle.cmc !== Object.values(manaCost).reduce((sum, amount) => sum + amount, 0)
  )
    return { kind: "unsupported", reason: "reviewed-spell-cost-mismatch" };
  const rules = ["601.2", "608.2b", "608.2c", recipe.type === "Instant" ? "304.1" : "307.1"];
  for (const effect of recipe.program.effects)
    rules.push(effect.kind === "draw" ? "121.1" : effect.kind === "damage" ? "120.3" : "119.3");
  const definition = CardDefinition.parse({
    ...definitionBase(card, parts),
    manaCost,
    manaValue: card.oracle.cmc,
    power: null,
    toughness: null,
    keywords: [],
    manaAbilities: [],
    commanderEligible: false,
    deckLimit: 1,
    obligations: [...new Set(rules)].map((rule) => `rule:${rule}`),
    implementationRevision: SPELL_RECIPE_VERSION,
    spellProgram: recipe.program,
  });
  return { kind: "bound", definition, recipes: [SPELL_RECIPE_VERSION] };
}

function familySpell(
  card: CatalogCard,
  parts: NonNullable<ReturnType<typeof characteristics>>,
): BindingResult {
  const match = bindExactSpellFamily(card.oracle.name, card.oracle.oracle_text ?? "");
  if (!match)
    return { kind: "unsupported", reason: "spell-complete-body-outside-reviewed-families" };
  if (card.identity !== card.oracle.oracle_id || (card.oracle.keywords?.length ?? 0) > 0)
    return { kind: "unsupported", reason: "spell-family-source-identity-or-keyword-discrepancy" };
  const manaCost = parsePlainManaCost(card.oracle.mana_cost ?? "");
  if (
    !manaCost ||
    card.oracle.cmc !== Object.values(manaCost).reduce((sum, amount) => sum + amount, 0)
  )
    return { kind: "unsupported", reason: "spell-family-requires-plain-cost-and-exact-mana-value" };
  const rules = [
    ...match.rules,
    "601.2",
    "608.2c",
    "608.2n",
    card.oracle.type_line === "Instant" ? "304.1" : "307.1",
  ];
  const definition = CardDefinition.parse({
    ...definitionBase(card, parts),
    manaCost,
    manaValue: card.oracle.cmc,
    power: null,
    toughness: null,
    keywords: [],
    manaAbilities: [],
    commanderEligible: false,
    deckLimit: 1,
    obligations: [...new Set(rules)].map((rule) => `rule:${rule}`),
    implementationRevision: SPELL_FAMILY_VERSION,
    spellProgram: match.program,
  });
  return { kind: "bound", definition, recipes: [SPELL_FAMILY_VERSION, match.family] };
}

function consistentReminderMetadata(
  input: CatalogCard,
  program: ReturnType<typeof textProgram>,
): boolean {
  if (input.identity !== input.oracle.oracle_id || program === null) return false;
  const declared = [
    ...new Set(input.oracle.keywords.map((word) => word.toLowerCase().replaceAll(" ", "-"))),
  ].sort();
  return canonicalJson(declared) === canonicalJson([...program.keywords].sort());
}

interface BindingOptions {
  staticKeywordGrants?: boolean;
  staticEvasionPermanents?: boolean;
  ordinaryActivatedAbilities?: boolean;
  damageReplacementPermanents?: boolean;
  entryObserverTriggers?: boolean;
  conditionalSelfEntryTriggers?: boolean;
  strictProctorTriggers?: boolean;
  staticBonusPermanents?: boolean;
  fixedTokenSpells?: boolean;
  creatureReturnSpells?: boolean;
  counterSpells?: boolean;
  spellFamilies?: boolean;
  selfEntryTriggers?: boolean;
  selfEntrySequences?: boolean;
  temporaryCreatureSpells?: boolean;
  keywordReminders?: boolean;
}
function bindSpell(
  input: CatalogCard,
  parts: NonNullable<ReturnType<typeof characteristics>>,
  options: BindingOptions,
): BindingResult {
  if (options.fixedTokenSpells) {
    const definition = bindFixedTokenSpell(input);
    if (definition) return { kind: "bound", definition, recipes: [FIXED_TOKEN_VERSION] };
  }
  if (options.creatureReturnSpells) {
    const definition = bindCreatureReturnSpell(input);
    if (definition) return { kind: "bound", definition, recipes: [CREATURE_RETURN_VERSION] };
  }
  if (options.counterSpells) {
    const definition = bindCounterSpell(input);
    if (definition) return { kind: "bound", definition, recipes: [COUNTER_SPELL_VERSION] };
  }
  if (options.temporaryCreatureSpells) {
    const definition = bindTemporaryCreatureSpell(input);
    if (definition) return { kind: "bound", definition, recipes: [TEMPORARY_CREATURE_VERSION] };
  }
  if (REVIEWED_SPELLS.some((recipe) => recipe.identity === input.identity))
    return reviewedSpell(input, parts);
  if (
    options.spellFamilies &&
    (input.oracle.type_line === "Instant" || input.oracle.type_line === "Sorcery")
  )
    return familySpell(input, parts);
  return reviewedSpell(input, parts);
}
interface KnownPermanentBinder {
  sources: readonly { identity: string; sourceVersion: string }[];
  option: keyof BindingOptions;
  bind: (input: CatalogCard) => CardDefinition | null;
  version: string;
  reasonPrefix: string;
}
const knownPermanentBinders: readonly KnownPermanentBinder[] = [
  {
    sources: STATIC_KEYWORD_GRANTS,
    option: "staticKeywordGrants",
    bind: bindStaticKeywordGrant,
    version: STATIC_KEYWORD_GRANT_VERSION,
    reasonPrefix: "static-keyword-grant",
  },
  {
    sources: STATIC_EVASION_PERMANENTS,
    option: "staticEvasionPermanents",
    bind: bindStaticEvasionPermanent,
    version: STATIC_EVASION_VERSION,
    reasonPrefix: "static-evasion",
  },
  {
    sources: ORDINARY_ACTIVATED_PERMANENTS,
    option: "ordinaryActivatedAbilities",
    bind: bindOrdinaryActivatedPermanent,
    version: ORDINARY_ACTIVATED_VERSION,
    reasonPrefix: "ordinary-activated",
  },
  {
    sources: DAMAGE_REPLACEMENT_PERMANENTS,
    option: "damageReplacementPermanents",
    bind: bindDamageReplacementPermanent,
    version: DAMAGE_REPLACEMENT_VERSION,
    reasonPrefix: "damage-replacement",
  },
  {
    sources: STRICT_PROCTOR_PERMANENTS,
    option: "strictProctorTriggers",
    bind: bindStrictProctorPermanent,
    version: STRICT_PROCTOR_VERSION,
    reasonPrefix: "strict-proctor",
  },
  {
    sources: CONDITIONAL_SELF_ENTRY_PERMANENTS,
    option: "conditionalSelfEntryTriggers",
    bind: bindConditionalSelfEntryPermanent,
    version: CONDITIONAL_SELF_ENTRY_VERSION,
    reasonPrefix: "conditional-self-entry",
  },
  {
    sources: ENTRY_OBSERVER_PERMANENTS,
    option: "entryObserverTriggers",
    bind: bindEntryObserverPermanent,
    version: ENTRY_OBSERVER_VERSION,
    reasonPrefix: "entry-observer",
  },
  {
    sources: STATIC_BONUS_PERMANENTS,
    option: "staticBonusPermanents",
    bind: bindStaticBonusPermanent,
    version: STATIC_BONUS_VERSION,
    reasonPrefix: "static-bonus",
  },
];
function bindKnownPermanent(input: CatalogCard, options: BindingOptions): BindingResult | null {
  // Known source anchors cannot be relabeled or stripped into a legacy vanilla constructor.
  const descriptor = knownPermanentBinders.find((row) =>
    row.sources.some(
      (source) =>
        source.identity === input.identity ||
        source.identity === input.oracle.oracle_id ||
        source.sourceVersion === input.versionHash,
    ),
  );
  if (!descriptor) return null;
  const enabled = options[descriptor.option];
  const definition = enabled ? descriptor.bind(input) : null;
  return definition
    ? { kind: "bound", definition, recipes: [descriptor.version] }
    : {
        kind: "unsupported",
        reason: `${descriptor.reasonPrefix}-${enabled ? "source-mismatch" : "requires-explicit-opt-in"}`,
      };
}
/** Binds only explicitly reviewed data recipes. No unknown English clause can become a no-op. */
export function bindDevelopmentCard(
  input: CatalogCard,
  options: BindingOptions = {},
): BindingResult {
  const known = bindKnownPermanent(input, options);
  if (known) return known;
  if (!input.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate"))
    return { kind: "unsupported", reason: "not-observed-main-deck-candidate" };
  const card = input.oracle;
  if (card.layout !== "normal" || card.card_faces || !card.oracle_id)
    return { kind: "unsupported", reason: "layout-or-identity-requires-specialized-definition" };
  const parts = characteristics(input);
  if (!parts) return { kind: "unsupported", reason: "type-characteristics-not-established" };
  if (parts.types.includes("Land")) return basicLand(input, parts);
  if (parts.types.length === 1 && (parts.types[0] === "Instant" || parts.types[0] === "Sorcery"))
    return bindSpell(input, parts, options);
  return bindOrdinaryCreature(input, parts, options);
}
function bindOrdinaryCreature(
  input: CatalogCard,
  parts: NonNullable<ReturnType<typeof characteristics>>,
  options: BindingOptions,
): BindingResult {
  const card = input.oracle;
  if (!parts.types.includes("Creature") || parts.types.some((type) => !ORDINARY_TYPES.has(type)))
    return { kind: "unsupported", reason: "card-type-requires-specialized-definition" };
  const manaCost = parsePlainManaCost(card.mana_cost ?? ""),
    power = exactInteger(card.power),
    toughness = exactInteger(card.toughness);
  if (
    !manaCost ||
    power === null ||
    toughness === null ||
    card.cmc !== Object.values(manaCost).reduce((sum, amount) => sum + amount, 0)
  )
    return { kind: "unsupported", reason: "nonordinary-cost-or-characteristic-expression" };
  if (typeof card.oracle_text !== "string")
    return { kind: "unsupported", reason: "missing-oracle-behavior-source" };
  const sequence = options.selfEntrySequences ? bindSelfEntrySequence(input) : null;
  const entry =
    sequence ?? (options.selfEntryTriggers ? proposeSelfEntryBody(card.oracle_text) : null);
  const entryRecipe = sequence ? SELF_ENTRY_SEQUENCE_VERSION : SELF_ENTRY_RECIPE_VERSION;
  if (
    entry &&
    (input.identity !== card.oracle_id ||
      card.keywords.some((keyword) => !KEYWORDS.has(keyword.toLowerCase())))
  )
    return { kind: "unsupported", reason: "self-entry-source-identity-or-keyword-discrepancy" };
  const body = entry?.remainder ?? card.oracle_text;
  const hasReminder =
    options.keywordReminders === true &&
    body.split("\n").some((line) => exactKeywordReminder(line) !== null);
  if (hasReminder && sequence)
    return { kind: "unsupported", reason: "keyword-reminder-sequence-composition-not-reviewed" };
  const program = textProgram(body, hasReminder);
  if (hasReminder && !consistentReminderMetadata(input, program))
    return {
      kind: "unsupported",
      reason: "keyword-reminder-source-identity-or-keyword-discrepancy",
    };
  if (!program)
    return {
      kind: "unsupported",
      reason: "unrecognized-oracle-clause; reviewed-definition-required",
    };
  const recipes = ["ordinary-creature/1"];
  if (entry) recipes.push(entryRecipe);
  if (hasReminder) recipes.push(KEYWORD_REMINDER_RECIPE_VERSION);
  if (program.keywords.length) recipes.push("keyword-creature/1");
  if (program.manaAbilities.length) recipes.push("mana-creature/1");
  const obligations = [
    "rule:302",
    "rule:601.2",
    "rule:903.5",
    ...program.keywords.map((keyword) => `rule:${KEYWORD_RULES[keyword]}`),
  ];
  if (hasReminder) obligations.push(...KEYWORD_REMINDER_RULES.map((rule) => `rule:${rule}`));
  if (program.manaAbilities.length) obligations.push("rule:605.1a", "rule:302.6");
  if (entry)
    obligations.push(
      ...SELF_ENTRY_RULES.map((rule) => `rule:${rule}`),
      ...selfEntryEffects(entry.program).map((effect) =>
        effect.kind === "draw" ? "rule:121.1" : "rule:119.3",
      ),
      ...(sequence ? SELF_ENTRY_SEQUENCE_RULES.map((rule) => `rule:${rule}`) : []),
    );
  if (parts.supertypes.includes("Legendary")) obligations.push("rule:704.5j", "rule:903.3");
  const definition = CardDefinition.parse({
    ...definitionBase(input, parts),
    manaCost,
    manaValue: card.cmc,
    power,
    toughness,
    ...program,
    ...(entry ? { triggerPrograms: [entry.program], implementationRevision: entryRecipe } : {}),
    ...(hasReminder ? { implementationRevision: KEYWORD_REMINDER_RECIPE_VERSION } : {}),
    commanderEligible: parts.supertypes.includes("Legendary"),
    deckLimit: 1,
    obligations,
  });
  return { kind: "bound", definition, recipes };
}

/** Reconstruct old bounded declarations instead of trusting a familiar revision label. */
export function reviewedLegacyDefinition(definition: CardDefinition): boolean {
  if (definition.triggerPrograms !== undefined) return false;
  if (definition.implementationRevision === RECIPE_VERSION) {
    if (definition.spellProgram !== undefined) return false;
    const color = BASIC_TYPES[definition.name];
    if (definition.types.includes("Land"))
      return (
        color !== undefined &&
        definition.typeLine === `Basic Land — ${definition.name}` &&
        canonicalJson(definition.types) === canonicalJson(["Land"]) &&
        canonicalJson(definition.supertypes) === canonicalJson(["Basic"]) &&
        canonicalJson(definition.subtypes) === canonicalJson([definition.name]) &&
        (definition.oracleText === "" || definition.oracleText === `({T}: Add {${color}}.)`) &&
        definition.manaCost === null &&
        definition.manaValue === 0 &&
        definition.power === null &&
        definition.toughness === null &&
        definition.keywords.length === 0 &&
        canonicalJson(definition.manaAbilities) === canonicalJson([color]) &&
        definition.deckLimit === null &&
        !definition.commanderEligible
      );
    if (
      !ordinaryDefinition(definition) ||
      definition.deckLimit !== 1 ||
      definition.commanderEligible !== definition.supertypes.includes("Legendary")
    )
      return false;
    const program = textProgram(definition.oracleText);
    return (
      program !== null &&
      canonicalJson(program.keywords) === canonicalJson(definition.keywords) &&
      canonicalJson(program.manaAbilities) === canonicalJson(definition.manaAbilities)
    );
  }
  return reviewedLegacySpell(definition);
}
function reviewedLegacySpell(definition: CardDefinition): boolean {
  if (definition.typeLine !== "Instant" && definition.typeLine !== "Sorcery") return false;
  if (
    canonicalJson(definition.types) !== canonicalJson([definition.typeLine]) ||
    definition.subtypes.length ||
    definition.supertypes.length ||
    definition.keywords.length ||
    definition.manaAbilities.length ||
    definition.power !== null ||
    definition.toughness !== null ||
    definition.commanderEligible ||
    definition.deckLimit !== 1 ||
    definition.manaCost === null ||
    definition.manaValue !==
      Object.values(definition.manaCost).reduce((sum, value) => sum + value, 0)
  )
    return false;
  if (definition.implementationRevision === SPELL_FAMILY_VERSION) {
    const match = bindExactSpellFamily(definition.name, definition.oracleText);
    return (
      match !== null && canonicalJson(match.program) === canonicalJson(definition.spellProgram)
    );
  }
  if (definition.implementationRevision !== SPELL_RECIPE_VERSION) return false;
  const recipe = REVIEWED_SPELLS.find((row) => row.identity === definition.oracleId);
  return (
    recipe !== undefined &&
    definition.sourceVersion === recipe.sourceVersion &&
    definition.name === recipe.name &&
    definition.typeLine === recipe.type &&
    definition.oracleText === recipe.text &&
    canonicalJson(definition.manaCost) === canonicalJson(parsePlainManaCost(recipe.cost)) &&
    canonicalJson(definition.spellProgram) === canonicalJson(recipe.program)
  );
}
