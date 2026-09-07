import { ContentRelease, DeckRevision, ENGINE_VERSION, semanticHash } from "@iwsdk-apps/contracts";
import metadata from "./static-evasion-decks.json";
import shard1 from "./static-evasion-decks-definitions-1.json";
import shard2 from "./static-evasion-decks-definitions-2.json";
import shard3 from "./static-evasion-decks-definitions-3.json";
export const evasionFixtureMetadata = metadata;
export const evasionDefinitionShards = [shard1, shard2, shard3];
export async function evasionFixtureSource() {
  const definitions = { ...shard1, ...shard2, ...shard3 };
  const body = {
    schema: "commander-content/1",
    id: "authenticated-static-evasion-deck-fixture/1",
    sourceBundle: metadata.sourceBundle,
    rulesHash: metadata.rulesHash,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions,
    tokenTemplates: structuredClone(metadata.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "static-evasion-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
export const evasionPriorDecks = () => metadata.decks.map((deck) => DeckRevision.parse(deck));
