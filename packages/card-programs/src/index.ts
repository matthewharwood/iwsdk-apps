import type { CatalogCard } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  type Cost,
  canonicalJson,
  emptyMana,
  type Keyword,
  type ManaColor,
} from "@iwsdk-apps/contracts";
import { proposeSelfEntryBody, SELF_ENTRY_RECIPE_VERSION, SELF_ENTRY_RULES } from "./self-entry";
import { bindExactSpellFamily, SPELL_FAMILY_VERSION } from "./spell-families";
import { REVIEWED_SPELLS, SPELL_RECIPE_VERSION } from "./spells";

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
export const KEYWORD_RULES: Record<Keyword, string> = {
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
  Object.keys(KEYWORD_RULES).map((keyword) => [keyword.replaceAll("-", " "), keyword as Keyword]),
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

function textProgram(text: string): { keywords: Keyword[]; manaAbilities: ManaColor[] } | null {
  const keywords: Keyword[] = [],
    manaAbilities: ManaColor[] = [];
  if (!text) return { keywords, manaAbilities };
  for (const line of text.split("\n")) {
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
    definition.implementationRevision !== SELF_ENTRY_RECIPE_VERSION ||
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
  const entry = proposeSelfEntryBody(definition.oracleText);
  const remainder = entry ? textProgram(entry.remainder) : null;
  return (
    entry !== null &&
    remainder !== null &&
    canonicalJson(definition.triggerPrograms) === canonicalJson([entry.program]) &&
    canonicalJson(definition.keywords) === canonicalJson(remainder.keywords) &&
    canonicalJson(definition.manaAbilities) === canonicalJson(remainder.manaAbilities)
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

/** Binds only explicitly reviewed data recipes. No unknown English clause can become a no-op. */
export function bindDevelopmentCard(
  input: CatalogCard,
  options: { spellFamilies?: boolean; selfEntryTriggers?: boolean } = {},
): BindingResult {
  if (!input.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate"))
    return { kind: "unsupported", reason: "not-observed-main-deck-candidate" };
  const card = input.oracle;
  if (card.layout !== "normal" || card.card_faces || !card.oracle_id)
    return { kind: "unsupported", reason: "layout-or-identity-requires-specialized-definition" };
  const parts = characteristics(input);
  if (!parts) return { kind: "unsupported", reason: "type-characteristics-not-established" };
  if (parts.types.includes("Land")) return basicLand(input, parts);
  if (parts.types.length === 1 && (parts.types[0] === "Instant" || parts.types[0] === "Sorcery")) {
    if (REVIEWED_SPELLS.some((recipe) => recipe.identity === input.identity))
      return reviewedSpell(input, parts);
    if (options.spellFamilies && (card.type_line === "Instant" || card.type_line === "Sorcery"))
      return familySpell(input, parts);
    return reviewedSpell(input, parts);
  }
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
  const entry = options.selfEntryTriggers ? proposeSelfEntryBody(card.oracle_text) : null;
  if (
    entry &&
    (input.identity !== card.oracle_id ||
      card.keywords.some((keyword) => !KEYWORDS.has(keyword.toLowerCase())))
  )
    return { kind: "unsupported", reason: "self-entry-source-identity-or-keyword-discrepancy" };
  const program = textProgram(entry?.remainder ?? card.oracle_text);
  if (!program)
    return {
      kind: "unsupported",
      reason: "unrecognized-oracle-clause; reviewed-definition-required",
    };
  const recipes = ["ordinary-creature/1"];
  if (entry) recipes.push(SELF_ENTRY_RECIPE_VERSION);
  if (program.keywords.length) recipes.push("keyword-creature/1");
  if (program.manaAbilities.length) recipes.push("mana-creature/1");
  const obligations = [
    "rule:302",
    "rule:601.2",
    "rule:903.5",
    ...program.keywords.map((keyword) => `rule:${KEYWORD_RULES[keyword]}`),
  ];
  if (program.manaAbilities.length) obligations.push("rule:605.1a", "rule:302.6");
  if (entry)
    obligations.push(
      ...SELF_ENTRY_RULES.map((rule) => `rule:${rule}`),
      entry.program.effect.kind === "draw" ? "rule:121.1" : "rule:119.3",
    );
  if (parts.supertypes.includes("Legendary")) obligations.push("rule:704.5j", "rule:903.3");
  const definition = CardDefinition.parse({
    ...definitionBase(input, parts),
    manaCost,
    manaValue: card.cmc,
    power,
    toughness,
    ...program,
    ...(entry
      ? { triggerPrograms: [entry.program], implementationRevision: SELF_ENTRY_RECIPE_VERSION }
      : {}),
    commanderEligible: parts.supertypes.includes("Legendary"),
    deckLimit: 1,
    obligations,
  });
  return { kind: "bound", definition, recipes };
}
