import {
  proposeSelfEntryBody,
  SELF_ENTRY_RECIPE_VERSION,
  SELF_ENTRY_REGISTRY,
} from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { type SelfEntryProgram, semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Complete-body constructor outcomes and source references; neither execution nor semantic certification. */
export async function compileSelfEntryDraft(dbPath: string) {
  const result = await compileDevelopmentRelease(dbPath, {
    spellFamilies: true,
    selfEntryTriggers: true,
  });
  const cards = readCandidateCards(dbPath);
  const matches: {
    identity: string;
    name: string;
    sourceVersion: string;
    sourceArchiveHash: string;
    sourceOrdinal: number;
    completeText: string | null;
    layout: string;
    typeLine: string | null;
    cost: string | null;
    manaValue: number | null;
    power: unknown;
    toughness: unknown;
    proposedProgram: SelfEntryProgram;
    remainingText: string;
    status: "bound" | "unsupported";
    reason: string | null;
    definitionId: string | null;
    boundPrograms: SelfEntryProgram[] | null;
    externalDefinitionDependencies: string[] | null;
  }[] = [];
  for (const card of cards) {
    const proposal = proposeSelfEntryBody(card.oracle.oracle_text ?? "");
    if (!proposal) continue;
    if ((await semanticHash(card.oracle)) !== card.versionHash)
      throw new Error(`Catalog source version mismatch: ${card.identity}`);
    const definition = result.release.definitions[`oracle:${card.identity}`];
    const unsupported = result.report.unsupported.find((row) => row.identity === card.identity);
    matches.push({
      identity: card.identity,
      name: card.oracle.name,
      sourceVersion: card.versionHash,
      sourceArchiveHash: card.sourceArchiveHash,
      sourceOrdinal: card.sourceOrdinal,
      completeText: card.oracle.oracle_text ?? null,
      layout: card.oracle.layout,
      typeLine: card.oracle.type_line ?? null,
      cost: card.oracle.mana_cost ?? null,
      manaValue: card.oracle.cmc ?? null,
      power: card.oracle.power ?? null,
      toughness: card.oracle.toughness ?? null,
      proposedProgram: proposal.program,
      remainingText: proposal.remainder,
      status: definition?.triggerPrograms ? ("bound" as const) : ("unsupported" as const),
      reason: unsupported?.reason ?? null,
      definitionId: definition?.triggerPrograms ? definition.id : null,
      boundPrograms: definition?.triggerPrograms ?? null,
      externalDefinitionDependencies: definition?.triggerPrograms ? [] : null,
    });
  }
  const base = {
    schema: "self-entry-expansion/1",
    assurance: "draft-source-bindings-awaiting-runtime-validation" as const,
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    releaseHash: result.release.hash,
    processorAbi: result.release.processorAbi,
    candidateDenominator: cards.length,
    recipeVersion: SELF_ENTRY_RECIPE_VERSION,
    familyRegistry: SELF_ENTRY_REGISTRY,
    counts: SELF_ENTRY_REGISTRY.map((recipe) => ({
      kind: recipe.kind,
      amount: recipe.amount,
      exactClauseMatches: matches.filter(
        (row) =>
          row.proposedProgram.effect.kind === recipe.kind &&
          row.proposedProgram.effect.amount === recipe.amount,
      ).length,
      completeBodyBindings: matches.filter(
        (row) =>
          row.status === "bound" &&
          row.proposedProgram.effect.kind === recipe.kind &&
          row.proposedProgram.effect.amount === recipe.amount,
      ).length,
    })),
    matches,
    retainedUnsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    executedGames: 0,
    independentlyReviewedRecords: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...base, hash: await semanticHash(base) } };
}
