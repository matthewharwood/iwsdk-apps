import {
  DAMAGE_REPLACEMENT_PERMANENTS,
  DAMAGE_REPLACEMENT_VERSION,
} from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Exact whole-source damage-replacement programs; binding is distinct from execution and certification. */
export async function compileDamageReplacementDraft(dbPath: string) {
  const options = {
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
    damageReplacementPermanents: true,
  });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Damage replacement expansion changed a prior definition: ${id}`);
  if (
    canonicalJson(result.release.tokenTemplates) !== canonicalJson(baseline.release.tokenTemplates)
  )
    throw new Error("Damage replacement expansion changed auxiliary token templates");
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of DAMAGE_REPLACEMENT_PERMANENTS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned damage-replacement source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Damage replacement catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== DAMAGE_REPLACEMENT_VERSION)
      throw new Error(
        `Damage replacement source no longer matches reviewed recipe: ${recipe.name}`,
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
      typedPrograms: definition.damagePrograms,
      externalDefinitionDependencies: [],
    });
  }
  const body = {
    schema: "damage-replacement-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: DAMAGE_REPLACEMENT_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    auxiliaryTokenTemplates: Object.keys(result.release.tokenTemplates ?? {}).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    sourceReviewManifestSha256: "982b97f1b1f994d4a2f6cf8c397951a845712a8b107f10206d11e0593819ad84",
    reviewScope:
      "Five complete pinned bodies: Furnace of Rath, Dictate of the Twin Gods including Flash, Benevolent Unicorn spell-damage subtraction, Urza's Armor prevention, and Excruciator own-source cannot-prevent. Binding is separate from runtime qualification. Broader event classes, copy/entry precedence, shields, result replacement and unsupported damage recipients remain outside this development subset.",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
