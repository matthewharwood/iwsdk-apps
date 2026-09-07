import { ContentRelease, DeckRevision, ENGINE_VERSION, semanticHash } from "@iwsdk-apps/contracts";
import metadata from "./ordinary-activated-decks.json";
import shard1 from "./ordinary-activated-decks-definitions-1.json";
import shard2 from "./ordinary-activated-decks-definitions-2.json";
import shard3 from "./ordinary-activated-decks-definitions-3.json";
export const activationFixtureMetadata = metadata;
export const activationDefinitionShards = [shard1, shard2, shard3];
export async function activationFixtureSource() {
  const definitions = { ...shard1, ...shard2, ...shard3 };
  const body = {
    schema: "commander-content/1",
    id: "authenticated-ordinary-activated-deck-fixture/1",
    sourceBundle: metadata.sourceBundle,
    rulesHash: metadata.rulesHash,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions,
    tokenTemplates: structuredClone(metadata.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "ordinary-activated-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
export const activationPriorDecks = () => metadata.decks.map((deck) => DeckRevision.parse(deck));
