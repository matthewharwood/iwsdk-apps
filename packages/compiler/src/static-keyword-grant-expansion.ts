import { STATIC_KEYWORD_GRANT_VERSION, STATIC_KEYWORD_GRANTS } from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Exact whole-source static keyword grants; binding is distinct from execution and certification. */
export async function compileStaticKeywordGrantDraft(dbPath: string) {
  const options = {
    staticEvasionPermanents: true,
    ordinaryActivatedAbilities: true,
    damageReplacementPermanents: true,
    strictProctorTriggers: true,
    conditionalSelfEntryTriggers: true,
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
    staticKeywordGrants: true,
  });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Static keyword grant expansion changed a prior definition: ${id}`);
  if (
    canonicalJson(result.release.tokenTemplates) !== canonicalJson(baseline.release.tokenTemplates)
  )
    throw new Error("Static keyword grant expansion changed auxiliary token templates");
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of STATIC_KEYWORD_GRANTS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned static-keyword-grant source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Static keyword grant catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== STATIC_KEYWORD_GRANT_VERSION)
      throw new Error(
        `Static keyword grant source no longer matches reviewed recipe: ${recipe.name}`,
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
      keywords: definition.keywords,
      staticKeywordPrograms: definition.staticKeywordPrograms,
      externalDefinitionDependencies: [],
    });
  }
  const body = {
    schema: "static-keyword-grant-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: STATIC_KEYWORD_GRANT_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    auxiliaryTokenTemplates: Object.keys(result.release.tokenTemplates ?? {}).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    sourceAuthentication: "static-keyword-grant-research/source-authentication.json",
    reviewStatus: "author-full-body-and-rule-review-independent-execution-pending",
    reviewScope:
      "55 complete pinned permanent bodies with live additive layer6 keyword grants. Explicit own/all-controller, all-of type, subtype, color and same-object exclusion predicates preserve source semantics. No subtype-only noncreature domain, ability removal, keyword-dependent filter or unrecognized body is admitted. Source binding, legal deck availability and execution remain separate.",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
