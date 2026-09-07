import { STATIC_EVASION_PERMANENTS, STATIC_EVASION_VERSION } from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Exact whole-source ordinary activated programs; binding is distinct from execution and certification. */
export async function compileStaticEvasionDraft(dbPath: string) {
  const options = {
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
    staticEvasionPermanents: true,
  });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Static evasion expansion changed a prior definition: ${id}`);
  if (
    canonicalJson(result.release.tokenTemplates) !== canonicalJson(baseline.release.tokenTemplates)
  )
    throw new Error("Static evasion expansion changed auxiliary token templates");
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of STATIC_EVASION_PERMANENTS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned static-evasion source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Static evasion catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== STATIC_EVASION_VERSION)
      throw new Error(`Static evasion source no longer matches reviewed recipe: ${recipe.name}`);
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
      blockingRestrictions: definition.blockingRestrictions ?? [],
      externalDefinitionDependencies: [],
    });
  }
  const body = {
    schema: "static-evasion-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: STATIC_EVASION_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    auxiliaryTokenTemplates: Object.keys(result.release.tokenTemplates ?? {}).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    sourceAuthentication: "evasion-source/authentication.json",
    reviewStatus: "author-full-body-and-rule-review-independent-execution-pending",
    reviewScope:
      "146 complete pinned creature bodies across ten evasion keywords and three nonkeyword blocking restrictions. Exact finite body mapping preserves every existing intrinsic keyword, ordinary fixed characteristics, source and paper-eligibility metadata. Binding, legal deck availability and execution remain separate. No general landwalk, blocking requirement/cost or unsupported compound body is admitted.",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
