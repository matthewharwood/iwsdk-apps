import { FIXED_TOKEN_SPELLS, FIXED_TOKEN_VERSION } from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Fixed27-record expansion. Source bindings do not certify fixed-token spell execution. */
export async function compileFixedTokenDraft(dbPath: string) {
  const options = {
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
    fixedTokenSpells: true,
  });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Fixed-token expansion changed a prior definition: ${id}`);
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of FIXED_TOKEN_SPELLS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned fixed-token spell source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Fixed-token catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== FIXED_TOKEN_VERSION)
      throw new Error(`Fixed-token source no longer matches reviewed recipe: ${recipe.name}`);
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
      externalDefinitionDependencies:
        definition.spellProgram?.effects.flatMap((effect) =>
          effect.kind === "create-token" ? [effect.templateId] : [],
        ) ?? [],
    });
  }
  const body = {
    schema: "fixed-token-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: FIXED_TOKEN_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    auxiliaryTokenTemplates: Object.keys(result.release.tokenTemplates ?? {}).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    sourceReviewHash: "6af1fc6916f663c899d5d3a78ca8bb7023b7c4a52fe9d057976e568f8a746707",
    reviewScope:
      "Twenty-seven exact source records reviewed independently; compilation and dependency admission do not constitute execution or semantic certification.",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
