export { compileConditionalSelfEntryDraft } from "./conditional-self-entry-expansion";
export { makeCreatureReturnDecks } from "./creature-return-decks";
export { compileCreatureReturnDraft } from "./creature-return-expansion";
export { makeConditionalSelfEntryDecks } from "./development-conditional-self-entry-decks";
export { makeEntryObserverDecks } from "./development-entry-observer-decks";
export { compileEntryObserverDraft } from "./entry-observer-expansion";
export { makeFixedTokenDecks } from "./fixed-token-decks";
export { compileFixedTokenDraft } from "./fixed-token-expansion";
export { makeStaticBonusDecks } from "./static-bonus-decks";
export { compileStaticBonusDraft } from "./static-bonus-expansion";

import { Database } from "bun:sqlite";

export { makeCounterSpellDecks } from "./counter-spell-decks";
export { compileCounterSpellDraft } from "./counter-spell-expansion";
export { makeKeywordReminderDecks } from "./keyword-reminder-decks";
export { compileKeywordReminderDraft } from "./keyword-reminder-expansion";
export { buildDevelopmentMatchPlan, computeDependencyClosure, MATCH_PLAN_VERSION } from "./plan";
export { compileSelfEntryDraft } from "./self-entry-expansion";
export { compileSpellFamilyDraft } from "./spell-expansion";

import {
  bindDevelopmentCard,
  bindExactSpellFamily,
  CONDITIONAL_SELF_ENTRY_PERMANENTS,
  CONDITIONAL_SELF_ENTRY_VERSION,
  COUNTER_SPELL_VERSION,
  COUNTER_SPELLS,
  CREATURE_RETURN_SPELLS,
  CREATURE_RETURN_VERSION,
  ENTRY_OBSERVER_PERMANENTS,
  ENTRY_OBSERVER_VERSION,
  FIXED_TOKEN_SPELLS,
  FIXED_TOKEN_TEMPLATES,
  FIXED_TOKEN_VERSION,
  KEYWORD_REMINDER_RECIPE_VERSION,
  KEYWORD_REMINDER_REGISTRY,
  RECIPE_REGISTRY,
  RECIPE_VERSION,
  REVIEWED_SPELLS,
  reviewedSelfEntryDefinition,
  reviewedTemporaryCreatureDefinition,
  SELF_ENTRY_RECIPE_VERSION,
  SELF_ENTRY_REGISTRY,
  SELF_ENTRY_SEQUENCE_VERSION,
  SELF_ENTRY_SEQUENCES,
  SPELL_FAMILY_REGISTRY,
  SPELL_FAMILY_VERSION,
  STATIC_BONUS_PERMANENTS,
  STATIC_BONUS_VERSION,
  TEMPORARY_CREATURE_BODIES,
  TEMPORARY_CREATURE_SPELLS,
  TEMPORARY_CREATURE_VERSION,
} from "@iwsdk-apps/card-programs";
import { type CatalogInventory, readCandidateCards, readInventory } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  type Keyword,
  semanticHash,
} from "@iwsdk-apps/contracts";

export const COMPILER_VERSION = "commander-development-compiler/4";
export const REVIEWED_RULES_HASH =
  "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f";

export interface CompilationReport {
  assurance: "development-subset-bindings-not-semantic-certification";
  sourceInventory: CatalogInventory;
  recipeRegistry: typeof RECIPE_REGISTRY;
  rulesHash: string;
  bindings: {
    definitionId: string;
    sourceVersion: string;
    sourceArchiveHash: string;
    sourceOrdinal: number;
    recipes: string[];
  }[];
  unsupported: { identity: string; name: string; reason: string }[];
  unresolvedEligibility: { identity: string; name: string; role: string; reason: string }[];
  executedAssertions: 0;
  spellFamilies: { enabled: boolean; version: string; registry: typeof SPELL_FAMILY_REGISTRY };
  keywordReminders: {
    enabled: boolean;
    version: string;
    registry: typeof KEYWORD_REMINDER_REGISTRY;
  };
  selfEntryTriggers: { enabled: boolean; version: string; registry: typeof SELF_ENTRY_REGISTRY };
  selfEntrySequences: { enabled: boolean; version: string; registry: typeof SELF_ENTRY_SEQUENCES };
  conditionalSelfEntryTriggers: {
    enabled: boolean;
    version: string;
    registry: typeof CONDITIONAL_SELF_ENTRY_PERMANENTS;
  };
  entryObserverTriggers: {
    enabled: boolean;
    version: string;
    registry: typeof ENTRY_OBSERVER_PERMANENTS;
  };
  staticBonusPermanents: {
    enabled: boolean;
    version: string;
    registry: typeof STATIC_BONUS_PERMANENTS;
  };
  fixedTokenSpells: {
    enabled: boolean;
    version: string;
    registry: typeof FIXED_TOKEN_SPELLS;
    tokenTemplates: typeof FIXED_TOKEN_TEMPLATES;
  };
  creatureReturnSpells: {
    enabled: boolean;
    version: string;
    registry: typeof CREATURE_RETURN_SPELLS;
  };
  counterSpells: { enabled: boolean; version: string; registry: typeof COUNTER_SPELLS };
  temporaryCreatureSpells: {
    enabled: boolean;
    version: string;
    registry: typeof TEMPORARY_CREATURE_SPELLS;
    bodies: typeof TEMPORARY_CREATURE_BODIES;
  };
}

function describeCompilerRecipes(
  options: NonNullable<Parameters<typeof bindDevelopmentCard>[1]>,
): string {
  return `${COMPILER_VERSION}${options.spellFamilies ? "+spell-families/1" : ""}${options.selfEntryTriggers ? "+self-entry/1" : ""}${options.selfEntrySequences ? "+self-entry-sequence-four/1" : ""}${options.temporaryCreatureSpells ? "+temporary-creature-spells/1" : ""}${options.keywordReminders ? "+keyword-reminders/1" : ""}${options.counterSpells ? "+stack-counter-spell/1" : ""}${options.creatureReturnSpells ? "+creature-return-spell/1" : ""}${options.fixedTokenSpells ? "+fixed-token-spells/1" : ""}${options.staticBonusPermanents ? "+static-bonus-permanent/1" : ""}${options.entryObserverTriggers ? "+entry-observer-permanent/1" : ""}${options.conditionalSelfEntryTriggers ? "+conditional-self-entry-artifact/1" : ""}`;
}

async function compilerRevision(
  options: NonNullable<Parameters<typeof bindDevelopmentCard>[1]>,
): Promise<string> {
  const recipeCompilerVersion = describeCompilerRecipes(options);
  return options.conditionalSelfEntryTriggers
    ? `${COMPILER_VERSION}+conditional-self-entry-artifact/1:${await semanticHash(recipeCompilerVersion)}`
    : options.entryObserverTriggers
      ? `${COMPILER_VERSION}+entry-observer-permanent/1:${await semanticHash(recipeCompilerVersion)}`
      : options.staticBonusPermanents
        ? `${COMPILER_VERSION}+static-bonus-permanent/1:${await semanticHash(recipeCompilerVersion)}`
        : options.fixedTokenSpells
          ? `${COMPILER_VERSION}+fixed-token-spells/1:${await semanticHash(recipeCompilerVersion)}`
          : recipeCompilerVersion;
}

/** Compile only the declared development recipes; retain the full unsupported candidate universe. */
export async function compileDevelopmentRelease(
  dbPath: string,
  options: {
    conditionalSelfEntryTriggers?: boolean;
    entryObserverTriggers?: boolean;
    staticBonusPermanents?: boolean;
    fixedTokenSpells?: boolean;
    creatureReturnSpells?: boolean;
    counterSpells?: boolean;
    spellFamilies?: boolean;
    selfEntryTriggers?: boolean;
    selfEntrySequences?: boolean;
    temporaryCreatureSpells?: boolean;
    keywordReminders?: boolean;
  } = {},
): Promise<{ release: ContentRelease; report: CompilationReport }> {
  const inventory = readInventory(dbPath);
  if (!inventory || inventory.status !== "complete")
    throw new Error("A complete active source inventory is required");
  using db = new Database(dbPath, { readonly: true, strict: true });
  const rulesHash = db
    .query<{ hash: string }, [string]>(
      "SELECT hash FROM source_archives WHERE import_id=? AND kind='comprehensive-rules'",
    )
    .get(inventory.importId)?.hash;
  if (rulesHash !== REVIEWED_RULES_HASH)
    throw new Error("UnreviewedRulesVersion: review recipe source obligations before compilation");
  const report: CompilationReport = {
    assurance: "development-subset-bindings-not-semantic-certification",
    sourceInventory: inventory,
    recipeRegistry: RECIPE_REGISTRY,
    rulesHash,
    bindings: [],
    unsupported: [],
    unresolvedEligibility: db
      .query<{ identity: string; name: string; role: string; reason: string }, [string]>(
        "SELECT e.identity,c.name,e.role,e.reason FROM eligibility e JOIN card_versions c ON c.import_id=e.import_id AND c.identity=e.identity WHERE e.import_id=? AND e.role='main-deck' AND e.status='unresolved' ORDER BY c.name",
      )
      .all(inventory.importId),
    executedAssertions: 0,
    keywordReminders: {
      enabled: options.keywordReminders === true,
      version: KEYWORD_REMINDER_RECIPE_VERSION,
      registry: KEYWORD_REMINDER_REGISTRY,
    },
    conditionalSelfEntryTriggers: {
      enabled: options.conditionalSelfEntryTriggers === true,
      version: CONDITIONAL_SELF_ENTRY_VERSION,
      registry: CONDITIONAL_SELF_ENTRY_PERMANENTS,
    },
    entryObserverTriggers: {
      enabled: options.entryObserverTriggers === true,
      version: ENTRY_OBSERVER_VERSION,
      registry: ENTRY_OBSERVER_PERMANENTS,
    },
    staticBonusPermanents: {
      enabled: options.staticBonusPermanents === true,
      version: STATIC_BONUS_VERSION,
      registry: STATIC_BONUS_PERMANENTS,
    },
    fixedTokenSpells: {
      enabled: options.fixedTokenSpells === true,
      version: FIXED_TOKEN_VERSION,
      registry: FIXED_TOKEN_SPELLS,
      tokenTemplates: FIXED_TOKEN_TEMPLATES,
    },
    creatureReturnSpells: {
      enabled: options.creatureReturnSpells === true,
      version: CREATURE_RETURN_VERSION,
      registry: CREATURE_RETURN_SPELLS,
    },
    counterSpells: {
      enabled: options.counterSpells === true,
      version: COUNTER_SPELL_VERSION,
      registry: COUNTER_SPELLS,
    },
    temporaryCreatureSpells: {
      enabled: options.temporaryCreatureSpells === true,
      version: TEMPORARY_CREATURE_VERSION,
      registry: TEMPORARY_CREATURE_SPELLS,
      bodies: TEMPORARY_CREATURE_BODIES,
    },
    selfEntrySequences: {
      enabled: options.selfEntrySequences === true,
      version: SELF_ENTRY_SEQUENCE_VERSION,
      registry: SELF_ENTRY_SEQUENCES,
    },
    selfEntryTriggers: {
      enabled: options.selfEntryTriggers === true,
      version: SELF_ENTRY_RECIPE_VERSION,
      registry: SELF_ENTRY_REGISTRY,
    },
    spellFamilies: {
      enabled: options.spellFamilies === true,
      version: SPELL_FAMILY_VERSION,
      registry: SPELL_FAMILY_REGISTRY,
    },
  };
  const definitions: Record<string, CardDefinition> = {};
  const candidates = readCandidateCards(dbPath);
  for (const card of candidates) {
    const result = bindDevelopmentCard(card, options);
    if (result.kind === "unsupported") {
      report.unsupported.push({
        identity: card.identity,
        name: card.oracle.name,
        reason: result.reason,
      });
      continue;
    }
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Catalog source version mismatch: ${card.identity}`);
    definitions[result.definition.id] = result.definition;
    report.bindings.push({
      definitionId: result.definition.id,
      sourceVersion: card.versionHash,
      sourceArchiveHash: card.sourceArchiveHash,
      sourceOrdinal: card.sourceOrdinal,
      recipes: result.recipes,
    });
  }
  const expectedCount = inventory.eligibility.find(
    (row) => row.role === "main-deck" && row.status === "candidate",
  )?.count;
  if (
    candidates.length !== expectedCount ||
    report.bindings.length + report.unsupported.length !== candidates.length
  )
    throw new Error("Compiler candidate denominator mismatch");
  const compilerVersion = await compilerRevision(options);
  const base = {
    schema: "commander-content/1" as const,
    id:
      options.creatureReturnSpells ||
      options.fixedTokenSpells ||
      options.staticBonusPermanents ||
      options.entryObserverTriggers ||
      options.conditionalSelfEntryTriggers
        ? `development:${inventory.bundleHash.slice(0, 16)}:${await semanticHash({ compilerVersion, recipeVersion: RECIPE_VERSION })}`
        : `development:${inventory.bundleHash.slice(0, 16)}:${RECIPE_VERSION}:${COMPILER_VERSION}${options.spellFamilies ? ":spell-families/1" : ""}${options.selfEntryTriggers ? ":self-entry/1" : ""}${options.selfEntrySequences ? ":self-entry-sequence-four/1" : ""}${options.temporaryCreatureSpells ? ":temporary-creature-spells/1" : ""}${options.keywordReminders ? ":keyword-reminders/1" : ""}${options.counterSpells ? ":stack-counter-spell/1" : ""}${options.creatureReturnSpells ? ":creature-return-spell/1" : ""}`,
    sourceBundle: inventory.bundleHash,
    rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    ...(options.fixedTokenSpells ? { tokenTemplates: structuredClone(FIXED_TOKEN_TEMPLATES) } : {}),
    unsupportedOracleIds: report.unsupported.map((card) => card.identity),
    eligibleDenominator: candidates.length,
    compilerVersion,
    processorAbi: ENGINE_VERSION,
  };
  return { release: ContentRelease.parse({ ...base, hash: await semanticHash(base) }), report };
}

interface DeckProfile {
  commander: string;
  focus: "vanilla" | "mana" | Keyword;
  code: string;
  commanderSourceVersion?: string;
  spells?: readonly string[];
  familyLibrary?: boolean;
  triggerLibrary?: boolean;
  temporaryLibrary?: boolean;
}
const DECK_PROFILES: DeckProfile[] = [
  { commander: "Jasmine Boreal", focus: "vanilla", code: "gw-vanilla" },
  { commander: "Jasmine Boreal", focus: "flying", code: "gw-flying" },
  { commander: "Jasmine Boreal", focus: "vigilance", code: "gw-vigilance" },
  { commander: "Jasmine Boreal", focus: "first-strike", code: "gw-first-strike" },
  { commander: "Jasmine Boreal", focus: "lifelink", code: "gw-lifelink" },
  { commander: "Jasmine Boreal", focus: "mana", code: "gw-mana" },
  { commander: "The Lady of the Mountain", focus: "vanilla", code: "rg-vanilla" },
  { commander: "The Lady of the Mountain", focus: "trample", code: "rg-trample" },
  { commander: "The Lady of the Mountain", focus: "haste", code: "rg-haste" },
  { commander: "The Lady of the Mountain", focus: "menace", code: "rg-menace" },
  { commander: "The Lady of the Mountain", focus: "reach", code: "rg-reach" },
  { commander: "The Lady of the Mountain", focus: "mana", code: "rg-mana" },
];
export const SPELL_DECK_PROFILES: readonly DeckProfile[] = [
  {
    commander: "Tobias Andrion",
    commanderSourceVersion: "155d17db86833acd61d834269e09d90b88c99604cc3c9404c75e22ae72dc9758",
    focus: "vanilla",
    code: "wu-spell-sequences",
    spells: ["Divination", "Inspiration", "Sacred Nectar", "Revitalize", "Healing Hands"],
  },
  {
    commander: "Lady Orca",
    commanderSourceVersion: "9037ef0194812c2ef8a154d3a7e96b150d2b8d93f976df3bab2f39458a0cd56d",
    focus: "vanilla",
    code: "br-targeted-damage",
    spells: ["Flame Slash", "Sorin's Thirst"],
  },
];
export const FAMILY_DECK_PROFILES: readonly DeckProfile[] = [
  {
    commander: "Tobias Andrion",
    commanderSourceVersion: "155d17db86833acd61d834269e09d90b88c99604cc3c9404c75e22ae72dc9758",
    focus: "vanilla",
    code: "wu-family-library",
    familyLibrary: true,
  },
  {
    commander: "Lady Orca",
    commanderSourceVersion: "9037ef0194812c2ef8a154d3a7e96b150d2b8d93f976df3bab2f39458a0cd56d",
    focus: "vanilla",
    code: "br-family-removal",
    familyLibrary: true,
  },
  {
    commander: "Jasmine Boreal",
    commanderSourceVersion: "715ac4501a52d881b939d5793a333b1e407382c7aec56be50a2e2f2b4159d7b5",
    focus: "vanilla",
    code: "gw-family-life",
    familyLibrary: true,
  },
];

export const TRIGGER_DECK_PROFILES: readonly DeckProfile[] = [
  {
    commander: "Jasmine Boreal",
    commanderSourceVersion: "715ac4501a52d881b939d5793a333b1e407382c7aec56be50a2e2f2b4159d7b5",
    focus: "vanilla",
    code: "gw-self-entry-library",
    triggerLibrary: true,
  },
  {
    commander: "Sivitri Scarzam",
    commanderSourceVersion: "848d9ade8051172c06537d6f69dd3a6612df2d3441d20756bc4ca3c9f9458bbf",
    focus: "vanilla",
    code: "ub-self-entry-library",
    triggerLibrary: true,
  },
];

function deckTriggers(
  release: ContentRelease,
  commander: CardDefinition,
  profile: DeckProfile,
): CardDefinition[] {
  if (!profile.triggerLibrary) return [];
  const triggers = Object.values(release.definitions)
    .filter(
      (definition) =>
        definition.triggerPrograms &&
        definition.implementationRevision !== KEYWORD_REMINDER_RECIPE_VERSION &&
        definition.id !== commander.id &&
        definition.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
    )
    .sort((a, b) => compare(a.id, b.id));
  if (triggers.length === 0 || triggers.length > 60)
    throw new Error(
      `Trigger fixture needs between 1 and 60 compatible programs: ${profile.commander}`,
    );
  for (const definition of triggers)
    if (!reviewedSelfEntryDefinition(definition))
      throw new Error(`Unreviewed or altered trigger definition: ${definition.name}`);
  return triggers;
}

function reviewedFamilyProgram(definition: CardDefinition): boolean {
  if (definition.implementationRevision === TEMPORARY_CREATURE_VERSION)
    return reviewedTemporaryCreatureDefinition(definition);
  if (definition.implementationRevision === SPELL_FAMILY_VERSION) {
    const binding = bindExactSpellFamily(definition.name, definition.oracleText);
    return (
      binding !== null && canonicalJson(binding.program) === canonicalJson(definition.spellProgram)
    );
  }
  const recipe = REVIEWED_SPELLS.find((row) => row.identity === definition.oracleId);
  return (
    recipe !== undefined &&
    recipe.sourceVersion === definition.sourceVersion &&
    recipe.name === definition.name &&
    recipe.text === definition.oracleText &&
    canonicalJson(recipe.program) === canonicalJson(definition.spellProgram)
  );
}
function deckSpells(
  release: ContentRelease,
  commander: CardDefinition,
  profile: DeckProfile,
): CardDefinition[] {
  if (profile.familyLibrary || profile.temporaryLibrary) {
    const spells = Object.values(release.definitions)
      .filter(
        (definition) =>
          definition.spellProgram &&
          (profile.temporaryLibrary
            ? definition.implementationRevision === TEMPORARY_CREATURE_VERSION
            : definition.implementationRevision !== TEMPORARY_CREATURE_VERSION) &&
          definition.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
      )
      .sort((a, b) => compare(a.id, b.id));
    if (spells.length === 0 || spells.length > 60)
      throw new Error(
        `Family fixture needs between 1 and 60 compatible spells: ${profile.commander}`,
      );
    for (const spell of spells)
      if (!reviewedFamilyProgram(spell))
        throw new Error(`Unreviewed or altered spell family definition: ${spell.name}`);
    return spells;
  }
  return (profile.spells ?? []).map((name) => {
    const recipe = REVIEWED_SPELLS.find((row) => row.name === name);
    const definition = Object.values(release.definitions).find((row) => row.name === name);
    if (
      !recipe ||
      !definition?.spellProgram ||
      definition.sourceVersion !== recipe.sourceVersion ||
      !definition.colorIdentity.every((color) => commander.colorIdentity.includes(color))
    )
      throw new Error(`Missing source-bound spell ${name}`);
    return definition;
  });
}

function focusMatch(card: CardDefinition, focus: "vanilla" | "mana" | Keyword): boolean {
  if (focus === "vanilla") return card.keywords.length === 0 && card.manaAbilities.length === 0;
  if (focus === "mana") return card.manaAbilities.length > 0;
  return card.keywords.includes(focus);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function deckCreatures(
  release: ContentRelease,
  commander: CardDefinition,
  focus: "vanilla" | "mana" | Keyword,
  variant: number,
): CardDefinition[] {
  const candidates = Object.values(release.definitions).filter(
    (card) =>
      card.types.includes("Creature") &&
      card.implementationRevision !== KEYWORD_REMINDER_RECIPE_VERSION &&
      card.triggerPrograms === undefined &&
      card.id !== commander.id &&
      card.colorIdentity.every((color) => commander.colorIdentity.includes(color)) &&
      (card.power ?? 0) > 0 &&
      !card.keywords.includes("defender"),
  );
  const matching = candidates.filter((card) => focusMatch(card, focus));
  if (matching.length === 0)
    throw new Error(`No source-bound ${focus} creatures for ${commander.name}`);
  const scored = candidates.map((card) => ({
    card,
    focus: Number(focusMatch(card, focus)),
    curve: Math.abs(card.manaValue - (2 + (variant % 4))),
    tie: card.id.slice((variant % 4) + 7),
  }));
  scored.sort((a, b) => b.focus - a.focus || a.curve - b.curve || compare(a.tie, b.tie));
  const selected = scored.slice(0, 60).map((row) => row.card);
  if (selected.length !== 60 || new Set(selected.map((card) => card.name)).size !== 60)
    throw new Error("Development deck requires 60 distinct source-bound creatures");
  return selected;
}

/** Historical profiles retain their constructor pool; reminder fixtures use makeKeywordReminderDecks explicitly. */
export async function makeDevelopmentDecks(
  releaseInput: ContentRelease,
  options: {
    includeSpellDecks?: boolean;
    includeFamilyDecks?: boolean;
    includeTriggerDecks?: boolean;
    includeSequenceDecks?: boolean;
    includeTemporaryDecks?: boolean;
  } = {},
): Promise<DeckRevision[]> {
  const release = ContentRelease.parse(releaseInput);
  const { hash: releaseHash, ...releaseBody } = release;
  if ((await semanticHash(releaseBody)) !== releaseHash)
    throw new Error("Content release hash mismatch");
  const decks: DeckRevision[] = [];
  const includeTriggers =
    options.includeTriggerDecks || options.includeSequenceDecks || options.includeTemporaryDecks;
  const profiles = includeTriggers
    ? [...DECK_PROFILES, ...SPELL_DECK_PROFILES, ...FAMILY_DECK_PROFILES, ...TRIGGER_DECK_PROFILES]
    : options.includeFamilyDecks
      ? [...DECK_PROFILES, ...SPELL_DECK_PROFILES, ...FAMILY_DECK_PROFILES]
      : options.includeSpellDecks === false
        ? DECK_PROFILES
        : [...DECK_PROFILES, ...SPELL_DECK_PROFILES];
  if (options.includeSequenceDecks || options.includeTemporaryDecks)
    profiles.push({
      commander: "Tobias Andrion",
      commanderSourceVersion: "155d17db86833acd61d834269e09d90b88c99604cc3c9404c75e22ae72dc9758",
      focus: "vanilla",
      code: "wu-ordered-entry-library",
      triggerLibrary: true,
    });
  if (options.includeTemporaryDecks)
    profiles.push(
      {
        commander: "Jasmine Boreal",
        focus: "vanilla",
        code: "gw-temporary-creature",
        temporaryLibrary: true,
      },
      {
        commander: "The Lady of the Mountain",
        focus: "vanilla",
        code: "rg-temporary-creature",
        temporaryLibrary: true,
      },
      {
        commander: "Lady Orca",
        focus: "vanilla",
        code: "br-temporary-creature",
        temporaryLibrary: true,
      },
      {
        commander: "Tobias Andrion",
        focus: "vanilla",
        code: "wu-temporary-creature",
        temporaryLibrary: true,
      },
    );
  for (const [index, profile] of profiles.entries()) {
    const commander = Object.values(release.definitions).find(
      (card) => card.name === profile.commander,
    );
    if (!commander?.commanderEligible)
      throw new Error(`Missing supported commander ${profile.commander}`);
    if (
      profile.commanderSourceVersion &&
      commander.sourceVersion !== profile.commanderSourceVersion
    )
      throw new Error(`Commander source changed: ${profile.commander}`);
    const spells = deckSpells(release, commander, profile);
    const triggers = deckTriggers(release, commander, profile);
    const creatures = deckCreatures(release, commander, profile.focus, index).slice(
      0,
      60 - spells.length - triggers.length,
    );
    const lands = commander.colorIdentity.map((color) =>
      Object.values(release.definitions).find(
        (card) =>
          card.supertypes.includes("Basic") &&
          card.types.includes("Land") &&
          card.manaAbilities.length === 1 &&
          card.manaAbilities[0] === color,
      ),
    );
    if (lands.length !== 2 || lands.some((land) => !land))
      throw new Error("Expected two matching basic lands for development commander");
    const entries = [
      { definition: commander.id, count: 1 },
      ...creatures.map((card) => ({ definition: card.id, count: 1 })),
      ...spells.map((card) => ({ definition: card.id, count: 1 })),
      ...triggers.map((card) => ({ definition: card.id, count: 1 })),
      ...lands.map((land, ordinal) => ({
        definition: (land as CardDefinition).id,
        count: ordinal === 0 ? 20 : 19,
      })),
    ].sort((a, b) => compare(a.definition, b.definition));
    const base = {
      id: `development:${profile.code}:${release.hash.slice(0, 16)}`,
      commander: commander.id,
      entries,
    };
    decks.push(DeckRevision.parse({ ...base, hash: await semanticHash(base) }));
  }
  if (options.includeFamilyDecks || includeTriggers) {
    const included = new Set(
      decks.slice(14, 17).flatMap((deck) => deck.entries.map((entry) => entry.definition)),
    );
    const missing = Object.values(release.definitions).filter(
      (definition) =>
        definition.spellProgram &&
        definition.implementationRevision !== TEMPORARY_CREATURE_VERSION &&
        !included.has(definition.id),
    );
    if (missing.length > 0)
      throw new Error(
        `Family fixtures do not cover all admitted spell programs: ${missing.map((card) => card.name).join(", ")}`,
      );
  }
  if (includeTriggers) {
    const included = new Set(
      decks.slice(17).flatMap((deck) => deck.entries.map((entry) => entry.definition)),
    );
    const missing = Object.values(release.definitions).filter(
      (definition) =>
        definition.triggerPrograms &&
        definition.implementationRevision !== KEYWORD_REMINDER_RECIPE_VERSION &&
        !included.has(definition.id),
    );
    if (missing.length > 0)
      throw new Error(
        `Trigger fixtures do not cover all admitted trigger programs: ${missing.map((card) => card.name).join(", ")}`,
      );
  }
  if (options.includeTemporaryDecks) {
    const included = new Set(
      decks.slice(20).flatMap((deck) => deck.entries.map((entry) => entry.definition)),
    );
    const missing = Object.values(release.definitions).filter(
      (definition) =>
        definition.implementationRevision === TEMPORARY_CREATURE_VERSION &&
        !included.has(definition.id),
    );
    if (missing.length)
      throw new Error(`Temporary fixtures lack: ${missing.map((card) => card.name).join(", ")}`);
  }
  return decks;
}
