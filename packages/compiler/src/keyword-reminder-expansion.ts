import {
  exactKeywordReminder,
  KEYWORD_REMINDER_RECIPE_VERSION,
  KEYWORD_REMINDER_REGISTRY,
} from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Exact annotated source bindings only. No execution or certification is inferred from compilation. */
export async function compileKeywordReminderDraft(dbPath: string) {
  const options = {
    spellFamilies: true,
    selfEntryTriggers: true,
    selfEntrySequences: true,
    temporaryCreatureSpells: true,
  };
  const baseline = await compileDevelopmentRelease(dbPath, options);
  const result = await compileDevelopmentRelease(dbPath, { ...options, keywordReminders: true });
  for (const [id, definition] of Object.entries(baseline.release.definitions))
    if (canonicalJson(result.release.definitions[id]) !== canonicalJson(definition))
      throw new Error(`Keyword reminder expansion changed a prior definition: ${id}`);
  const candidates = readCandidateCards(dbPath);
  const matched = candidates.filter((card) =>
    card.oracle.oracle_text?.split("\n").some((line) => exactKeywordReminder(line) !== null),
  );
  const matches = [];
  for (const card of matched) {
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    const added = definition?.implementationRevision === KEYWORD_REMINDER_RECIPE_VERSION;
    matches.push({
      identity: card.identity,
      name: card.oracle.name,
      sourceVersion: card.versionHash,
      sourceArchiveHash: card.sourceArchiveHash,
      sourceOrdinal: card.sourceOrdinal,
      oracle: card.oracle,
      exactAnnotations: (card.oracle.oracle_text ?? "").split("\n").flatMap((text) => {
        const keyword = exactKeywordReminder(text);
        return keyword ? [{ text, keyword }] : [];
      }),
      status: added ? "bound" : "unsupported",
      reason: added
        ? null
        : result.report.unsupported.find((row) => row.identity === card.identity)?.reason,
      definitionId: added ? definition.id : null,
      definitionHash: added ? await semanticHash(definition) : null,
      typedProgram: added
        ? {
            keywords: definition.keywords,
            manaAbilities: definition.manaAbilities,
            triggerPrograms: definition.triggerPrograms ?? [],
          }
        : null,
      externalDefinitionDependencies: added ? [] : null,
    });
  }
  const commanders = Object.values(result.release.definitions).filter(
    (definition) => definition.commanderEligible,
  );
  const deckColorAdmission = matches
    .filter((row) => row.status === "bound")
    .map((row) => {
      const definition = result.release.definitions[`oracle:${row.identity}`];
      if (!definition) throw Error(`Missing bound definition ${row.identity}`);
      return {
        identity: row.identity,
        name: row.name,
        colorIdentity: definition.colorIdentity,
        compatibleCommanderIds: commanders
          .filter((commander) =>
            definition.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
          )
          .map((commander) => commander.id),
      };
    });
  const base = {
    schema: "keyword-reminder-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation",
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    baselineReleaseHash: baseline.release.hash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    recipeVersion: KEYWORD_REMINDER_RECIPE_VERSION,
    registry: KEYWORD_REMINDER_REGISTRY,
    candidateDenominator: candidates.length,
    preservedDefinitions: Object.keys(baseline.release.definitions).length,
    addedBindings: matches.filter((row) => row.status === "bound").length,
    allBindings: Object.keys(result.release.definitions).length,
    unsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    matches,
    deckColorAdmission: {
      scope:
        "color compatibility only; does not establish legal 100-card deck composition or executed coverage",
      compatibleCount: deckColorAdmission.filter((row) => row.compatibleCommanderIds.length > 0)
        .length,
      blocked: deckColorAdmission.filter((row) => row.compatibleCommanderIds.length === 0),
    },
    independentlyReviewedRecords: 0,
    executedGames: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...base, hash: await semanticHash(base) } };
}
