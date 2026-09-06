import { resolve } from "node:path";
import { buildObligationLedger, readInventory } from "@iwsdk-apps/catalog";
import { ContentRelease } from "@iwsdk-apps/contracts";
import { writeEvidence } from "./evidence";

/** Source inventory, executable bindings and reviewed assertions remain different denominators. */
export async function reportCoverage(
  directory: string,
): Promise<{ fullSnapshotSupported: false; blockers: string[] }> {
  const catalog = resolve(directory, "catalog.sqlite");
  const inventory = readInventory(catalog);
  const ledger = await buildObligationLedger(catalog);
  const release = ContentRelease.parse(
    await Bun.file(resolve(directory, "development-release.json")).json(),
  );
  const blockers = [
    `${release.unsupportedOracleIds.length} paper candidate identities have no executable binding in this development release.`,
    `${ledger.unresolvedObligations} research obligations remain unresolved; source accounting does not certify semantics.`,
    "Role-aware eligibility, supporting objects and named-ruling semantics are not fully reviewed.",
    "AOT/reference equivalence, reviewed high-risk scenario coverage and full regression/exploration release gates remain open.",
  ];
  const report = {
    schema: "commander-coverage/1",
    fullSnapshotSupported: false as const,
    releaseHash: release.hash,
    sourceBundle: release.sourceBundle,
    assurance: release.assurance,
    inventory,
    obligations: ledger,
    compiledDefinitions: Object.keys(release.definitions).length,
    eligibleCandidateDenominator: release.eligibleDenominator,
    unsupportedCandidates: release.unsupportedOracleIds.length,
    runtimeHitsAreNotSemanticAssertions: true,
    blockers,
  };
  const path = resolve(directory, "coverage-report.json");
  await writeEvidence(path, report);
  console.log(
    JSON.stringify(
      {
        fullSnapshotSupported: false,
        compiledDefinitions: report.compiledDefinitions,
        eligibleCandidateDenominator: report.eligibleCandidateDenominator,
        unsupportedCandidates: report.unsupportedCandidates,
        unresolvedObligations: ledger.unresolvedObligations,
        blockers,
        report: path,
      },
      null,
      2,
    ),
  );
  return { fullSnapshotSupported: false, blockers };
}
