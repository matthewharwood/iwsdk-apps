import { CREATURE_RETURN_SPELLS, CREATURE_RETURN_VERSION } from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Fixed five-record expansion. Source bindings do not certify creature-return spell execution. */
export async function compileCreatureReturnDraft(dbPath: string) {
  const options = {
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
    creatureReturnSpells: true,
  });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Counterspell expansion changed a prior definition: ${id}`);
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of CREATURE_RETURN_SPELLS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned creature-return spell source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Counterspell catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== CREATURE_RETURN_VERSION)
      throw new Error(`Counterspell source no longer matches reviewed recipe: ${recipe.name}`);
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
      typedProgram: definition.spellProgram,
      externalDefinitionDependencies: [],
    });
  }
  const body = {
    schema: "creature-return-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: CREATURE_RETURN_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    sourceReviewHash: "daf8b553fac01865e8f9817446f207d18f15cdc83b2a280b971210a017afa031",
    reviewScope:
      "Five exact source records reviewed independently; compilation and dependency admission do not constitute execution or semantic certification.",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
