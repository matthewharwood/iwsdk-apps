import { ATTACHMENT_PERMANENTS, ATTACHMENT_VERSION } from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Exact whole-source attachments; binding is distinct from execution and certification. */
export async function compileAttachmentDraft(dbPath: string) {
  const options = {
    staticKeywordGrants: true,
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
    attachmentPermanents: true,
  });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Attachment expansion changed a prior definition: ${id}`);
  if (
    canonicalJson(result.release.tokenTemplates) !== canonicalJson(baseline.release.tokenTemplates)
  )
    throw new Error("Attachment expansion changed auxiliary token templates");
  const candidates = readCandidateCards(dbPath);
  const matches = [];
  for (const recipe of ATTACHMENT_PERMANENTS) {
    const card = candidates.find((row) => row.identity === recipe.identity);
    if (!card) throw new Error(`Missing pinned attachment source: ${recipe.name}`);
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Attachment catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    if (!definition || definition.implementationRevision !== ATTACHMENT_VERSION)
      throw new Error(`Attachment source no longer matches reviewed recipe: ${recipe.name}`);
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
      attachmentProgram: definition.attachmentProgram,
      externalDefinitionDependencies: [],
    });
  }
  const body = {
    schema: "attachment-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: ATTACHMENT_VERSION,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.length,
    allBindings: Object.keys(result.release.definitions).length,
    auxiliaryTokenTemplates: Object.keys(result.release.tokenTemplates ?? {}).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    sourceAuthentication: "attachment-source-research/source-authentication.json",
    reviewStatus: "author-full-body-and-rule-review-independent-execution-pending",
    reviewScope:
      "151 complete pinned attachment bodies: 87 Auras and 64 Equipment, including a separate 21-card intrinsic-keyword annex. Exact enchant restrictions, fixed attached modifiers, explicit equip cost/owned target/sorcery timing and intrinsic-versus-recipient keywords are preserved. This compiled proposal is not admitted to the closed execution registry until independent source and compiled joins pass; runtime qualification remains separate.",
    baseResearchManifest: "f992b3ec3092db52507338258f2f8c28ed22a07da25887ad1306c9ac84ce021a",
    annexResearchManifest: "a9f6eb3bb3598bcd90d928b4b5b650dd0391f27b8a560e9c57614e0feba78fde",
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...body, hash: await semanticHash(body) } };
}
