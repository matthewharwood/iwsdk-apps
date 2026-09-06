import {
  COUNTER_SPELLS,
  KEYWORD_REMINDER_REGISTRY,
  RECIPE_REGISTRY,
  SELF_ENTRY_REGISTRY,
  SELF_ENTRY_SEQUENCES,
  SPELL_FAMILY_REGISTRY,
  TEMPORARY_CREATURE_BODIES,
  TEMPORARY_CREATURE_SPELLS,
} from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  ContentRelease,
  DeckRevision,
  type ExecutionRegistry,
  PreparedMatchArtifact,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { buildDevelopmentMatchPlan, MATCH_PLAN_VERSION } from "./plan";

import { REVIEWED_BINDING_SNAPSHOT, REVIEWED_SOURCE_BINDINGS } from "./reviewed-source-bindings";

export class PreparedAdmissionError extends Error {
  constructor(
    readonly code: "InvalidSource" | "InvalidDeck" | "InvalidArtifact" | "UnresolvedDependency",
    message: string,
  ) {
    super(message);
    this.name = "PreparedAdmissionError";
  }
}
export async function verifySourceRelease(input: ContentRelease): Promise<ContentRelease> {
  const source = ContentRelease.parse(input);
  const { hash, ...body } = source;
  if ((await semanticHash(body)) !== hash)
    throw new PreparedAdmissionError("InvalidSource", "Full source release hash mismatch");
  if (
    source.sourceBundle !== REVIEWED_BINDING_SNAPSHOT.sourceBundle ||
    source.rulesHash !== REVIEWED_BINDING_SNAPSHOT.rulesHash
  )
    throw new PreparedAdmissionError(
      "InvalidSource",
      "Unauthenticated source bundle or rules snapshot",
    );
  for (const [identity, definition] of Object.entries(source.definitions)) {
    if (identity !== definition.id || identity !== `oracle:${definition.oracleId}`)
      throw new PreparedAdmissionError(
        "InvalidSource",
        `Definition dictionary identity mismatch: ${identity}`,
      );
    const expected = REVIEWED_SOURCE_BINDINGS[definition.oracleId];
    if (
      !expected ||
      definition.sourceVersion !== expected.sourceVersion ||
      definition.implementationRevision !== expected.implementationRevision ||
      (await semanticHash(definition)) !== expected.definitionHash
    )
      throw new PreparedAdmissionError("InvalidSource", `Unauthenticated definition: ${identity}`);
  }
  return source;
}
async function verifiedDecks(inputs: readonly DeckRevision[]): Promise<DeckRevision[]> {
  if (inputs.length !== 2 && inputs.length !== 4)
    throw new PreparedAdmissionError(
      "InvalidDeck",
      "Prepared matches require two or four deck revisions",
    );
  const decks: DeckRevision[] = [];
  for (const input of inputs) {
    const deck = DeckRevision.parse(input);
    const { hash, ...body } = deck;
    if ((await semanticHash(body)) !== hash)
      throw new PreparedAdmissionError("InvalidDeck", `Deck hash mismatch: ${deck.id}`);
    if (new Set(deck.entries.map((entry) => entry.definition)).size !== deck.entries.length)
      throw new PreparedAdmissionError("InvalidDeck", `Duplicate deck definition rows: ${deck.id}`);
    if (!deck.entries.some((entry) => entry.definition === deck.commander))
      throw new PreparedAdmissionError(
        "InvalidDeck",
        `Commander missing from deck roots: ${deck.id}`,
      );
    decks.push(deck);
  }
  return decks;
}
async function artifactFor(
  source: ContentRelease,
  decks: readonly DeckRevision[],
): Promise<PreparedMatchArtifact> {
  const plan = await buildDevelopmentMatchPlan(source, decks);
  if (plan.closure.blockers.length > 0)
    throw new PreparedAdmissionError(
      "UnresolvedDependency",
      `Prepared execution blocked: ${plan.closure.blockers.join(", ")}`,
    );
  const retainedDefinitions = [];
  for (const identity of plan.closure.retained) {
    const definition = source.definitions[identity];
    if (!definition)
      throw new PreparedAdmissionError(
        "UnresolvedDependency",
        `Required definition unavailable: ${identity}`,
      );
    retainedDefinitions.push({
      identity,
      definitionHash: await semanticHash(definition),
      sourceVersion: definition.sourceVersion,
    });
  }
  const deckHashes = decks.map((deck) => deck.hash);
  const deckDigest = await semanticHash(deckHashes);
  const base = {
    schema: "prepared-match/1" as const,
    id: `prepared:${source.hash}:${deckDigest}`,
    sourceReleaseHash: source.hash,
    sourceBundle: source.sourceBundle,
    rulesHash: source.rulesHash,
    profile: source.profile,
    processorAbi: source.processorAbi,
    compilerVersion: MATCH_PLAN_VERSION,
    recipeRegistryHash: await semanticHash({
      recipes: RECIPE_REGISTRY,
      spellFamilies: SPELL_FAMILY_REGISTRY,
      selfEntryTriggers: SELF_ENTRY_REGISTRY,
      keywordReminders: KEYWORD_REMINDER_REGISTRY,
      counterSpells: COUNTER_SPELLS,
      reviewedBindingSnapshot: REVIEWED_BINDING_SNAPSHOT,
      reviewedBindingGuard: "closed-source-registry-bundle-rules/1",
      selfEntrySequences: SELF_ENTRY_SEQUENCES,
      temporaryCreatureSpells: TEMPORARY_CREATURE_SPELLS,
      temporaryCreatureBodies: TEMPORARY_CREATURE_BODIES,
    }),
    deckHashes,
    closure: plan.closure,
    retainedDefinitions,
    requiredCoreCapabilities: plan.closure.retainedCoreCapabilities,
    analysisHash: plan.hash,
    assurance: source.assurance,
    fullRegistryAvailable: false as const,
  };
  return PreparedMatchArtifact.parse({ ...base, hash: await semanticHash(base) });
}

export async function createPreparedMatchArtifact(
  sourceInput: ContentRelease,
  deckInputs: readonly DeckRevision[],
): Promise<PreparedMatchArtifact> {
  const source = await verifySourceRelease(sourceInput);
  return artifactFor(source, await verifiedDecks(deckInputs));
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
function registry(
  source: ContentRelease,
  identities: readonly string[],
  artifactHash: string | null,
): ExecutionRegistry {
  const entries: [string, CardDefinition][] = [];
  for (const identity of identities) {
    const definition = source.definitions[identity];
    if (!definition)
      throw new PreparedAdmissionError(
        "UnresolvedDependency",
        `Definition unavailable: ${identity}`,
      );
    entries.push([identity, structuredClone(definition)]);
  }
  const definitions: Record<string, CardDefinition> = Object.fromEntries(entries);
  return deepFreeze({
    sourceReleaseHash: source.hash,
    preparedArtifactHash: artifactHash,
    definitions,
  });
}
export async function createFullExecutionRegistry(
  sourceInput: ContentRelease,
): Promise<ExecutionRegistry> {
  const source = await verifySourceRelease(sourceInput);
  return registry(source, Object.keys(source.definitions).sort(), null);
}
/** Full source verification authenticates subset membership; the artifact never impersonates a release. */
export async function admitPreparedMatchArtifact(
  artifactInput: unknown,
  sourceInput: ContentRelease,
  deckInputs: readonly DeckRevision[],
): Promise<ExecutionRegistry> {
  const artifact = PreparedMatchArtifact.parse(artifactInput);
  const { hash, ...body } = artifact;
  if ((await semanticHash(body)) !== hash)
    throw new PreparedAdmissionError("InvalidArtifact", "Prepared artifact hash mismatch");
  const source = await verifySourceRelease(sourceInput);
  if (source.hash !== artifact.sourceReleaseHash)
    throw new PreparedAdmissionError(
      "InvalidSource",
      "Prepared artifact references a different full source release",
    );
  const expected = await artifactFor(source, await verifiedDecks(deckInputs));
  // Reconstructing all fields rejects forged exclusions, empty core lists, altered refs, ABI drift, and unproven plan claims even if the submitter recomputes its hash.
  if ((await semanticHash(artifact)) !== (await semanticHash(expected)))
    throw new PreparedAdmissionError(
      "InvalidArtifact",
      "Prepared artifact does not match recomputed source, deck, closure, or definition evidence",
    );
  return registry(source, expected.closure.retained, artifact.hash);
}
