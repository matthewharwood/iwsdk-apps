import { SPELL_FAMILY_VERSION } from "@iwsdk-apps/card-programs";
import { ContentRelease, DeckRevision, semanticHash } from "@iwsdk-apps/contracts";

export const MATCH_PLAN_VERSION = "development-match-plan/1";
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
const RECOGNIZED_RECIPES = new Set([
  "commander-development-recipes/1",
  "reviewed-spell/1",
  SPELL_FAMILY_VERSION,
]);
/** Reviewed development families create no tokens, copied/granted abilities, or external definitions. */
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
    registry: Object.values(release.definitions).map((definition) => ({
      identity: definition.id,
      implemented: RECOGNIZED_RECIPES.has(definition.implementationRevision),
      dependencies: RECOGNIZED_RECIPES.has(definition.implementationRevision) ? [] : null,
    })),
    core: DEVELOPMENT_CORE.map((identity) => ({ identity, implemented: true })),
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
        "no generated, copied, granted or external definitions in admitted programs",
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
