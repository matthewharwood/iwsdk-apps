import {
  ORDINARY_ACTIVATED_PERMANENTS,
  ORDINARY_ACTIVATED_VERSION,
} from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Exact whole-source ordinary activated programs; binding is distinct from execution and certification. */
export async function compileOrdinaryActivatedDraft(dbPath: string) {
  const options = {
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
    ordinaryActivatedAbilities: true,
  });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Ordinary activation expansion changed a prior definition: ${id}`);
  if (
    canonicalJson(result.release.tokenTemplates) !== canonicalJson(baseline.release.tokenTemplates)
  )
    throw new Error("Ordinary activation expansion changed auxiliary token templates");
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of ORDINARY_ACTIVATED_PERMANENTS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned ordinary-activated source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Ordinary activation catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== ORDINARY_ACTIVATED_VERSION)
      throw new Error(
        `Ordinary activation source no longer matches reviewed recipe: ${recipe.name}`,
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
      typedPrograms: definition.activatedPrograms,
      externalDefinitionDependencies: [],
    });
  }
  const body = {
    schema: "ordinary-activated-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: ORDINARY_ACTIVATED_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    auxiliaryTokenTemplates: Object.keys(result.release.tokenTemplates ?? {}).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    discoveryManifestSha256: "1dc8a25f150c6fe3844a2f20a261b7156fa46fbf21845c6d2a2f33646a4519b6",
    independentProposalsSha256: "6d7315d40ed2ccd26f523d97354e38fb93ec4620e42f9b879c40612dc9d5c038",
    independentReviewManifestSha256:
      "8ab942cd8099f6cdb318f71c42f96e608314b1ee6fe0b2e8d558f540b7195ab8",
    independentReviewStatus: "source-and-rules-review-sealed-execution-not-certified",
    reviewScope:
      "239 complete pinned bodies across self power/toughness, self keyword, target creature power/toughness, tap target creature, controller draw and life gain. Plain fixed mana and/or source tap costs only, with absent mana distinct from explicit zero. No mana output, token production, sacrifices, variable costs or unaccounted clauses are admitted by this constructor. Binding, legal deck availability, actual ability execution and full semantic coverage are separate results.",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
