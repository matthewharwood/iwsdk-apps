import { ContentRelease, DeckRevision, ENGINE_VERSION, semanticHash } from "@iwsdk-apps/contracts";
import { evasionFixtureSource } from "./static-evasion";
import metadata from "./static-keyword-grant.json";
export const staticKeywordFixtureMetadata = metadata;
export async function staticKeywordFixtureSource() {
  const old = await evasionFixtureSource();
  const definitions = { ...old.definitions, ...metadata.extraDefinitions };
  const body = {
    schema: "commander-content/1",
    id: "authenticated-static-keyword-grant-fixture/1",
    sourceBundle: metadata.sourceBundle,
    rulesHash: metadata.rulesHash,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions,
    tokenTemplates: old.tokenTemplates,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "static-keyword-grant-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
export const staticKeywordPriorDecks = () =>
  metadata.priorDecks.map((deck) => DeckRevision.parse(deck));
