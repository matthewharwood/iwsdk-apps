import { COUNTER_SPELL_VERSION, COUNTER_SPELLS } from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Fixed seven-record expansion. Source bindings do not certify counterspell execution. */
export async function compileCounterSpellDraft(dbPath: string) {
  const options = {
    spellFamilies: true,
    selfEntryTriggers: true,
    selfEntrySequences: true,
    temporaryCreatureSpells: true,
    keywordReminders: true,
  };
  const baseline = await compileDevelopmentRelease(dbPath, options);
  const result = await compileDevelopmentRelease(dbPath, { ...options, counterSpells: true });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Counterspell expansion changed a prior definition: ${id}`);
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of COUNTER_SPELLS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned counterspell source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Counterspell catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== COUNTER_SPELL_VERSION)
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
    schema: "counter-spell-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: COUNTER_SPELL_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    sourceReviewHash: "e0c17a7e92b7e5b8ff268e2caa5ea1432ecc8c914eef66a6b2ee24e9f0dd4a04",
    reviewScope:
      "Seven exact source records reviewed independently; compilation and dependency admission do not constitute execution or semantic certification.",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
