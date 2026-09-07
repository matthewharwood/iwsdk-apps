import { STATIC_BONUS_PERMANENTS, STATIC_BONUS_VERSION } from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Exact whole-source static programs; binding is distinct from execution and certification. */
export async function compileStaticBonusDraft(dbPath: string) {
  const options = {
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
    staticBonusPermanents: true,
  });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Static-bonus expansion changed a prior definition: ${id}`);
  if (
    canonicalJson(result.release.tokenTemplates) !== canonicalJson(baseline.release.tokenTemplates)
  )
    throw new Error("Static-bonus expansion changed auxiliary token templates");
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of STATIC_BONUS_PERMANENTS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned static-bonus source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Static-bonus catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== STATIC_BONUS_VERSION)
      throw new Error(`Static-bonus source no longer matches reviewed recipe: ${recipe.name}`);
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
      typedPrograms: definition.staticPrograms,
      externalDefinitionDependencies: [],
    });
  }
  const body = {
    schema: "static-bonus-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: STATIC_BONUS_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    auxiliaryTokenTemplates: Object.keys(result.release.tokenTemplates ?? {}).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    sourceReviewHash: "134143cd91e252084ed5c727549e6acf8bc6d62e56042ae78dc444ea7b619b12",
    reviewScope:
      "Forty-one exact source records; live creature predicates and additive layer 7c only. No general continuous-effect, timestamp, dependency, or legend-choice certification.",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
