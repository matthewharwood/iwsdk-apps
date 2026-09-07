import {
  CONDITIONAL_SELF_ENTRY_PERMANENTS,
  CONDITIONAL_SELF_ENTRY_VERSION,
} from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Exact whole-source conditional-self-entry programs; binding is distinct from execution and certification. */
export async function compileConditionalSelfEntryDraft(dbPath: string) {
  const options = {
    entryObserverTriggers: true,
    staticBonusPermanents: true,
    fixedTokenSpells: true,
    creatureReturnSpells: true,
    counterSpells: true,
    spellFamilies: true,
    selfEntryTriggers: true,
    selfEntrySequences: true,
    temporaryCreatureSpells: true,
    keywordReminders: true,
  };
  const baseline = await compileDevelopmentRelease(dbPath, options);
  const result = await compileDevelopmentRelease(dbPath, {
    ...options,
    conditionalSelfEntryTriggers: true,
  });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Conditional-self-entry expansion changed a prior definition: ${id}`);
  if (
    canonicalJson(result.release.tokenTemplates) !== canonicalJson(baseline.release.tokenTemplates)
  )
    throw new Error("Conditional-self-entry expansion changed auxiliary token templates");
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of CONDITIONAL_SELF_ENTRY_PERMANENTS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned conditional-self-entry source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Conditional-self-entry catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== CONDITIONAL_SELF_ENTRY_VERSION)
      throw new Error(
        `Conditional-self-entry source no longer matches reviewed recipe: ${recipe.name}`,
      );
    matches.push({
      identity: card.identity,
      name: card.oracle.name,
      sourceVersion: card.versionHash,
      sourceArchiveHash: card.sourceArchiveHash,
      sourceOrdinal: card.sourceOrdinal,
      oracle: card.oracle,
      status: "bound" as const,
      definitionId: definition.id,
      definitionHash: await semanticHash(definition),
      typedPrograms: definition.triggerPrograms,
      externalDefinitionDependencies: [],
    });
  }
  const body = {
    schema: "conditional-self-entry-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: CONDITIONAL_SELF_ENTRY_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    auxiliaryTokenTemplates: Object.keys(result.release.tokenTemplates ?? {}).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    sourceReviewHash: "3b6129e5f4160561a484205c32d68ffc8f6d44794e892106ffac9b2a87b8de2f",
    reviewScope:
      "Two exact mandatory self-entry source bodies; current captured-controller Artifact existence checked at entry and resolution, followed by draw one only. Other predicates, optional effects, meta-triggers and broader rules remain unsupported.",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
