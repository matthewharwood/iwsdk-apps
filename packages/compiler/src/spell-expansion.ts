import {
  bindExactSpellFamily,
  SPELL_FAMILY_REGISTRY,
  SPELL_FAMILY_VERSION,
} from "@iwsdk-apps/card-programs";
import { readCandidateCards } from "@iwsdk-apps/catalog";
import { semanticHash } from "@iwsdk-apps/contracts";
import { compileDevelopmentRelease } from "./index";

/** Source binding report only. No match execution or independent semantic approval is inferred. */
export async function compileSpellFamilyDraft(dbPath: string) {
  const result = await compileDevelopmentRelease(dbPath, { spellFamilies: true });
  const cards = readCandidateCards(dbPath);
  const matches = cards.flatMap((card) => {
    const match = bindExactSpellFamily(card.oracle.name, card.oracle.oracle_text ?? "");
    if (!match) return [];
    const definition = result.release.definitions[`oracle:${card.identity}`];
    const unsupported = result.report.unsupported.find((row) => row.identity === card.identity);
    return [
      {
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
        family: match.family,
        program: match.program,
        status: definition?.spellProgram ? ("bound" as const) : ("unsupported" as const),
        reason: unsupported?.reason ?? null,
        newlyBound: definition?.implementationRevision === SPELL_FAMILY_VERSION,
      },
    ];
  });
  const counts = SPELL_FAMILY_REGISTRY.map((family) => ({
    family: family.id,
    fullTextMatches: matches.filter((row) => row.family === family.id).length,
    bound: matches.filter((row) => row.family === family.id && row.status === "bound").length,
    newlyBound: matches.filter((row) => row.family === family.id && row.newlyBound).length,
  }));
  const base = {
    schema: "spell-family-expansion/1",
    assurance: "draft-source-bindings-awaiting-record-review" as const,
    sourceBundle: result.release.sourceBundle,
    rulesHash: result.release.rulesHash,
    releaseHash: result.release.hash,
    candidateDenominator: cards.length,
    plainInstantSorceryCandidates: cards.filter(
      (card) => card.oracle.type_line === "Instant" || card.oracle.type_line === "Sorcery",
    ).length,
    familyRegistry: SPELL_FAMILY_REGISTRY,
    counts,
    matches,
    retainedUnsupportedCandidates: result.report.unsupported.length,
    unresolvedEligibility: result.report.unresolvedEligibility,
    executedGames: 0,
    independentlyReviewedRecords: 0,
    fullSemanticCoverage: false,
  };
  return { ...result, expansion: { ...base, hash: await semanticHash(base) } };
}
