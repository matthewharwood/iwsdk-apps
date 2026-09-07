import { ContentRelease, DeckRevision, ENGINE_VERSION, semanticHash } from "@iwsdk-apps/contracts";
import metadata from "./attachments.json";
import { staticKeywordFixtureSource } from "./static-keyword-grant";
export const attachmentFixtureMetadata = metadata;
export async function attachmentFixtureSource() {
  const old = await staticKeywordFixtureSource();
  const definitions = { ...old.definitions, ...metadata.extraDefinitions };
  const body = {
    schema: "commander-content/1",
    id: "authenticated-attachment-fixture/1",
    sourceBundle: metadata.sourceBundle,
    rulesHash: metadata.rulesHash,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions,
    tokenTemplates: old.tokenTemplates,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "attachment-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
export const attachmentPriorDecks = () =>
  metadata.priorDecks.map((deck) => DeckRevision.parse(deck));
