import {
  COUNTER_SPELL_VERSION,
  CREATURE_RETURN_VERSION,
  ENTRY_OBSERVER_VERSION,
  FIXED_TOKEN_VERSION,
  KEYWORD_REMINDER_RECIPE_VERSION,
  reviewedCounterSpellDefinition,
  reviewedCreatureReturnSpellDefinition,
  reviewedEntryObserverDefinition,
  reviewedFixedTokenDefinition,
  reviewedKeywordReminderDefinition,
  reviewedLegacyDefinition,
  reviewedSelfEntryDefinition,
  reviewedStaticBonusDefinition,
  reviewedTemporaryCreatureDefinition,
  reviewedTokenTemplate,
  SELF_ENTRY_RECIPE_VERSION,
  SELF_ENTRY_SEQUENCE_VERSION,
  STATIC_BONUS_VERSION,
  TEMPORARY_CREATURE_VERSION,
} from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  ContentRelease,
  DeckRevision,
  semanticHash,
} from "@iwsdk-apps/contracts";

import { REVIEWED_SOURCE_BINDINGS } from "./reviewed-source-bindings";

export const MATCH_PLAN_VERSION = "development-match-plan/10";
export const SELF_ENTRY_PROCESSOR_ABI = "commander-engine/0.14.0";
export const SELF_ENTRY_CORE_CAPABILITIES = [
  "trigger:capture",
  "trigger:waiting",
  "trigger:apnap",
  "trigger:noncard-stack",
  "trigger:resolution",
  "trigger:serialization",
  "trigger:ordered-effects",
  "trigger:individual-draws",
] as const;
export const TEMPORARY_CREATURE_CORE_CAPABILITIES = [
  "continuous:fixed-object-generation",
  "continuous:layer6-intrinsic-keywords",
  "continuous:layer7c-fixed-deltas",
  "continuous:cleanup-expiry",
  "continuous:serialization",
] as const;
export const COUNTER_SPELL_CORE_CAPABILITIES = [
  "core:stack-spell-target-domain",
  "core:spell-self-target-exclusion",
  "core:counter-spell-owner-graveyard",
  "core:stack-target-revalidation",
] as const;
export const CREATURE_RETURN_CORE_CAPABILITIES = [
  "resolution:durable-continuation",
  "resolution:commander-hand-replacement",
  "resolution:replacement-owner-choice",
  "resolution:ordered-return-draw",
  "resolution:no-priority-between-effects",
] as const;
export const FIXED_TOKEN_CORE_CAPABILITIES = [
  "token:fixed-source-template",
  "token:batch-creation-and-entry",
  "token:noncard-inventory",
  "token:zone-departure-and-state-based-cease",
  "token:no-reentry-after-departure",
  "token:deterministic-durable-identities",
] as const;
export const ENTRY_OBSERVER_CORE_CAPABILITIES = [
  "trigger:entry-post-committed-batch",
  "trigger:entry-subject-occurrences",
  "trigger:entry-filter-type-subtype",
  "trigger:entry-self-or-filter",
  "trigger:entry-captured-controller",
  "trigger:entry-durable-subject-context",
  "trigger:legal-land-play-entry",
] as const;
export const STATIC_BONUS_CORE_CAPABILITIES = [
  "core:static-battlefield-source",
  "core:static-current-controller",
  "core:static-source-incarnation-exclusion",
  "core:characteristics-pre-layer-7c",
  "core:static-creature-predicate",
  "core:static-additive-7c",
  "core:static-entry-characteristics",
  "core:static-source-cessation",
  "core:static-sba-recompute",
] as const;
export const STATIC_ENCHANTMENT_CORE_CAPABILITIES = [
  "core:non-aura-enchantment-spell",
  "core:legendary-permanent-unsupported-guard",
] as const;
export type Dependency =
  | { kind: "exact"; identity: string }
  | { kind: "class-bounded"; classId: string; boundVersion: string }
  | { kind: "registry-wide"; reason: string };
export interface DependencyRecord {
  identity: string;
  implemented: boolean;
  /** Null means that dependency analysis is unresolved, never an empty dependency set. */
  dependencies: Dependency[] | null;
}
export interface TestedClassBound {
  version: string;
  identities: string[];
  tests: string[];
}
export interface ClosureResult {
  roots: string[];
  retained: string[];
  excluded: string[];
  retainedCoreCapabilities: string[];
  blockers: string[];
  widened: { identity: string; reason: string }[];
  iterations: number;
}
const ordered = (values: Iterable<string>): string[] => [...new Set(values)].sort();

/** Finite dependency reachability only. This is not a game-rules fixed point. */
export function computeDependencyClosure(input: {
  roots: readonly string[];
  registry: readonly DependencyRecord[];
  classes?: Readonly<Record<string, TestedClassBound>>;
  core: readonly { identity: string; implemented: boolean }[];
}): ClosureResult {
  const registry = new Map(input.registry.map((record) => [record.identity, record]));
  if (registry.size !== input.registry.length || input.registry.some((r) => !r.identity))
    throw new Error("Dependency registry identities must be nonempty and unique");
  const retained = new Set(input.roots),
    visited = new Set<string>(),
    blockers = new Set<string>();
  const widened: ClosureResult["widened"] = [];
  let iterations = 0;
  const widen = (identity: string, reason: string): void => {
    for (const key of registry.keys()) retained.add(key);
    widened.push({ identity, reason });
  };
  const dependency = (source: string, entry: Dependency): void => {
    if (entry.kind === "exact") {
      retained.add(entry.identity);
      return;
    }
    if (entry.kind === "registry-wide") {
      widen(source, entry.reason);
      return;
    }
    const bound = input.classes?.[entry.classId];
    if (!bound || bound.version !== entry.boundVersion || bound.tests.length === 0) {
      widen(source, `unverified-class-bound:${entry.classId}:${entry.boundVersion}`);
      blockers.add(`unverified-class-bound:${entry.classId}:${entry.boundVersion}`);
      return;
    }
    for (const key of bound.identities) retained.add(key);
  };
  while ([...retained].some((id) => !visited.has(id))) {
    iterations++;
    const pending = [...retained].filter((id) => !visited.has(id));
    for (const id of pending) {
      visited.add(id);
      const record = registry.get(id);
      if (!record) {
        blockers.add(`unavailable-definition:${id}`);
        continue;
      }
      if (!record.implemented) blockers.add(`unimplemented-definition:${id}`);
      if (record.dependencies === null) {
        widen(id, "unresolved-dependency-analysis");
        blockers.add(`unresolved-dependencies:${id}`);
      } else for (const entry of record.dependencies) dependency(id, entry);
    }
  }
  for (const core of input.core)
    if (!core.implemented) blockers.add(`unimplemented-core:${core.identity}`);
  return {
    roots: ordered(input.roots),
    retained: ordered(retained),
    excluded: ordered([...registry.keys()].filter((id) => !retained.has(id))),
    retainedCoreCapabilities: ordered(input.core.map((c) => c.identity)),
    blockers: ordered(blockers),
    widened,
    iterations,
  };
}

const DEVELOPMENT_CORE = [
  "profile:tabletop-commander",
  "setup:mulligan",
  "turn-priority",
  "zone-generations",
  "casting-payment",
  "development-characteristics",
  "development-combat",
  "state-based-actions",
  "elimination",
  "spell-sequence",
];
const REVIEWED_BINDINGS_BY_VERSION = new Map(
  Object.values(REVIEWED_SOURCE_BINDINGS).map((binding) => [binding.sourceVersion, binding]),
);

async function recognizedDependencyDeclaration(
  definition: CardDefinition,
  processorAbi: string,
  dictionaryIdentity: string,
): Promise<boolean> {
  if (dictionaryIdentity !== definition.id) return false;
  const byOracle = REVIEWED_SOURCE_BINDINGS[definition.oracleId];
  const byId = REVIEWED_SOURCE_BINDINGS[definition.id.replace(/^oracle:/, "")];
  const byDictionary = REVIEWED_SOURCE_BINDINGS[dictionaryIdentity.replace(/^oracle:/, "")];
  const bySourceVersion = REVIEWED_BINDINGS_BY_VERSION.get(definition.sourceVersion);
  const pinned = byOracle ?? byId ?? byDictionary ?? bySourceVersion;
  if (
    pinned &&
    (byOracle !== pinned ||
      byId !== pinned ||
      byDictionary !== pinned ||
      bySourceVersion !== pinned ||
      definition.id !== `oracle:${definition.oracleId}` ||
      definition.sourceVersion !== pinned.sourceVersion ||
      definition.implementationRevision !== pinned.implementationRevision ||
      (await semanticHash(definition)) !== pinned.definitionHash)
  )
    return false;
  if (definition.implementationRevision === ENTRY_OBSERVER_VERSION)
    return processorAbi === SELF_ENTRY_PROCESSOR_ABI && reviewedEntryObserverDefinition(definition);
  if (definition.implementationRevision === STATIC_BONUS_VERSION)
    return processorAbi === SELF_ENTRY_PROCESSOR_ABI && reviewedStaticBonusDefinition(definition);
  if (definition.implementationRevision === FIXED_TOKEN_VERSION)
    return processorAbi === SELF_ENTRY_PROCESSOR_ABI && reviewedFixedTokenDefinition(definition);
  if (definition.implementationRevision === CREATURE_RETURN_VERSION)
    return (
      processorAbi === SELF_ENTRY_PROCESSOR_ABI && reviewedCreatureReturnSpellDefinition(definition)
    );
  if (definition.implementationRevision === COUNTER_SPELL_VERSION)
    return processorAbi === SELF_ENTRY_PROCESSOR_ABI && reviewedCounterSpellDefinition(definition);
  if (definition.implementationRevision === KEYWORD_REMINDER_RECIPE_VERSION)
    return (
      processorAbi === SELF_ENTRY_PROCESSOR_ABI && reviewedKeywordReminderDefinition(definition)
    );
  if (definition.implementationRevision === TEMPORARY_CREATURE_VERSION)
    return (
      processorAbi === SELF_ENTRY_PROCESSOR_ABI && reviewedTemporaryCreatureDefinition(definition)
    );
  if (
    [SELF_ENTRY_RECIPE_VERSION, SELF_ENTRY_SEQUENCE_VERSION].includes(
      definition.implementationRevision,
    )
  )
    return processorAbi === SELF_ENTRY_PROCESSOR_ABI && reviewedSelfEntryDefinition(definition);
  return reviewedLegacyDefinition(definition);
}
/** Exact producer-to-template edges preserve auxiliary token dependencies without adding deck cards. */
export async function buildDevelopmentMatchPlan(
  releaseInput: ContentRelease,
  deckInputs: readonly DeckRevision[],
) {
  const release = ContentRelease.parse(releaseInput);
  const { hash, ...body } = release;
  if ((await semanticHash(body)) !== hash) throw new Error("Content release hash mismatch");
  const decks: DeckRevision[] = [];
  for (const input of deckInputs) {
    const deck = DeckRevision.parse(input);
    const { hash: deckHash, ...deckBody } = deck;
    if ((await semanticHash(deckBody)) !== deckHash)
      throw new Error(`Deck hash mismatch: ${deck.id}`);
    decks.push(deck);
  }
  const closure = computeDependencyClosure({
    roots: decks.flatMap((deck) => [
      deck.commander,
      ...deck.entries.map((entry) => entry.definition),
    ]),
    registry: [
      ...(await Promise.all(
        Object.entries(release.definitions).map(async ([identity, definition]) => {
          const known = await recognizedDependencyDeclaration(
            definition,
            release.processorAbi,
            identity,
          );
          const dependencies: Dependency[] =
            definition.spellProgram?.effects.flatMap((effect) =>
              effect.kind === "create-token"
                ? [{ kind: "exact" as const, identity: effect.templateId }]
                : [],
            ) ?? [];
          return { identity, implemented: known, dependencies: known ? dependencies : null };
        }),
      )),
      ...Object.entries(release.tokenTemplates ?? {}).map(([identity, template]) => {
        const known =
          identity === template.id &&
          release.processorAbi === SELF_ENTRY_PROCESSOR_ABI &&
          reviewedTokenTemplate(template);
        return { identity, implemented: known, dependencies: known ? [] : null };
      }),
    ],
    core: [
      ...DEVELOPMENT_CORE,
      ...(release.processorAbi === SELF_ENTRY_PROCESSOR_ABI &&
      Object.values(release.definitions).some(
        (definition) => definition.implementationRevision === ENTRY_OBSERVER_VERSION,
      )
        ? ENTRY_OBSERVER_CORE_CAPABILITIES
        : []),
      ...(release.processorAbi === SELF_ENTRY_PROCESSOR_ABI &&
      Object.values(release.definitions).some(
        (definition) => definition.implementationRevision === STATIC_BONUS_VERSION,
      )
        ? STATIC_BONUS_CORE_CAPABILITIES
        : []),
      ...(release.processorAbi === SELF_ENTRY_PROCESSOR_ABI &&
      Object.values(release.definitions).some(
        (definition) =>
          [STATIC_BONUS_VERSION, ENTRY_OBSERVER_VERSION].includes(
            definition.implementationRevision,
          ) && definition.types.includes("Enchantment"),
      )
        ? STATIC_ENCHANTMENT_CORE_CAPABILITIES
        : []),
      ...(release.processorAbi === SELF_ENTRY_PROCESSOR_ABI &&
      Object.values(release.definitions).some(
        (definition) => definition.implementationRevision === FIXED_TOKEN_VERSION,
      )
        ? FIXED_TOKEN_CORE_CAPABILITIES
        : []),
      ...(release.processorAbi === SELF_ENTRY_PROCESSOR_ABI &&
      Object.values(release.definitions).some(
        (definition) => definition.implementationRevision === CREATURE_RETURN_VERSION,
      )
        ? CREATURE_RETURN_CORE_CAPABILITIES
        : []),
      ...(release.processorAbi === SELF_ENTRY_PROCESSOR_ABI &&
      Object.values(release.definitions).some(
        (definition) => definition.implementationRevision === COUNTER_SPELL_VERSION,
      )
        ? COUNTER_SPELL_CORE_CAPABILITIES
        : []),
      ...(release.processorAbi === SELF_ENTRY_PROCESSOR_ABI ? SELF_ENTRY_CORE_CAPABILITIES : []),
      ...(release.processorAbi === SELF_ENTRY_PROCESSOR_ABI &&
      Object.values(release.definitions).some(
        (definition) => definition.implementationRevision === TEMPORARY_CREATURE_VERSION,
      )
        ? TEMPORARY_CREATURE_CORE_CAPABILITIES
        : []),
    ].map((identity) => ({ identity, implemented: true })),
  });
  const base = {
    schema: MATCH_PLAN_VERSION,
    assurance: "development-plan-not-semantic-certification" as const,
    releaseHash: release.hash,
    processorAbi: release.processorAbi,
    deckHashes: decks.map((deck) => deck.hash),
    closure,
    unavailableUncertifiedRegistryIdentities: release.unsupportedOracleIds,
    fullRegistryAvailable: false as const,
    pruning: closure.excluded.map((identity) => ({
      identity,
      compilerVersion: MATCH_PLAN_VERSION,
      assumptions: [
        "fixed pinned release",
        "recognized development recipe dependency declarations",
        "exact fixed-token template edges; static and entry-observer predicates select game objects without external card dependencies; no copies or unbounded external definitions; intrinsic keywords use bounded core capabilities",
      ],
      proof: "not reachable from deck roots under complete declared development dependencies",
      tests: ["packages/compiler/src/plan.test.ts"],
      sourceConstraint: release.rulesHash,
    })),
    selectorStrategy: "dynamic-current-view; no initial affected-object sets frozen" as const,
    executedAssertions: 0 as const,
  };
  return { ...base, hash: await semanticHash(base) };
}
