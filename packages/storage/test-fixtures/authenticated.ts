import {
  CardDefinition,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import snapshot from "./authenticated-cards.json";

// Exact source tuples from the independently authenticated 1090-definition release.
// Fixture headers identify the subset; production source admission still checks every
// definition against its closed registry. Never synthesize or modify a card here.
export function fixtureCard(name: keyof typeof snapshot.definitions): CardDefinition {
  return CardDefinition.parse(snapshot.definitions[name]);
}
export async function fixtureRelease(names: (keyof typeof snapshot.definitions)[]) {
  const payload = {
    schema: "commander-content/1" as const,
    id: "authenticated-storage-fixtures/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: Object.fromEntries(
      names.map((name) => {
        const card = fixtureCard(name);
        return [card.id, card];
      }),
    ),
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-storage-fixtures/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...payload, hash: await semanticHash(payload) } satisfies ContentRelease;
}
export async function fixtureDeck(
  id: string,
  commander: keyof typeof snapshot.definitions,
  cards: [keyof typeof snapshot.definitions, number][],
): Promise<DeckRevision> {
  const payload = {
    id,
    commander: fixtureCard(commander).id,
    entries: cards.map(([name, count]) => ({ definition: fixtureCard(name).id, count })),
  };
  return { ...payload, hash: await semanticHash(payload) };
}
