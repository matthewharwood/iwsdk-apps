import { CREATURE_RETURN_SPELLS, CREATURE_RETURN_VERSION } from "@iwsdk-apps/card-programs";
import { type ContentRelease, DeckRevision, semanticHash } from "@iwsdk-apps/contracts";
import { verifySourceRelease } from "./prepared";

function validate(deck: DeckRevision, release: ContentRelease): void {
  const commander = release.definitions[deck.commander];
  if (
    !commander?.commanderEligible ||
    deck.entries.reduce((sum, entry) => sum + entry.count, 0) !== 100 ||
    deck.entries.find((entry) => entry.definition === deck.commander)?.count !== 1 ||
    new Set(deck.entries.map((entry) => entry.definition)).size !== deck.entries.length
  )
    throw new Error(`Invalid creature-return spell fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = release.definitions[entry.definition];
    if (!card?.colorIdentity.every((color) => commander.colorIdentity.includes(color)))
      throw new Error(
        `Missing or incompatible creature-return spell fixture card: ${entry.definition}`,
      );
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Creature-return spell fixture copy limit: ${card.name}`);
  }
}

/** Preserve existing revisions, then append two legal source-backed blue profiles with all five creature-return spells. */
export async function makeCreatureReturnDecks(
  source: ContentRelease,
  frozenInputs: readonly DeckRevision[],
) {
  const release = await verifySourceRelease(source);
  const frozen: DeckRevision[] = [];
  for (const input of frozenInputs) {
    const deck = DeckRevision.parse(input);
    const { hash, ...body } = deck;
    if ((await semanticHash(body)) !== hash)
      throw new Error(`Frozen deck hash mismatch: ${deck.id}`);
    validate(deck, release);
    frozen.push(deck);
  }
  const returnIds = CREATURE_RETURN_SPELLS.map((row) => `oracle:${row.identity}`).sort();
  for (const id of returnIds)
    if (release.definitions[id]?.implementationRevision !== CREATURE_RETURN_VERSION)
      throw new Error(`Missing authenticated creature-return spell: ${id}`);
  const supplements: DeckRevision[] = [];
  for (const name of ["Tobias Andrion", "Sivitri Scarzam"]) {
    const base = frozen.findLast((deck) => release.definitions[deck.commander]?.name === name);
    if (!base) throw new Error(`Missing frozen blue fixture commander: ${name}`);
    const replacements = base.entries
      .filter(
        (entry) =>
          entry.definition !== base.commander &&
          release.definitions[entry.definition]?.types.includes("Creature") &&
          entry.count === 1,
      )
      .map((entry) => entry.definition)
      .sort()
      .slice(0, returnIds.length);
    if (
      replacements.length !== returnIds.length ||
      base.entries.some((entry) => returnIds.includes(entry.definition))
    )
      throw new Error(
        `Creature-return spell fixture needs five distinct creature replacements: ${base.id}`,
      );
    const entries = [
      ...base.entries.filter((entry) => !replacements.includes(entry.definition)),
      ...returnIds.map((definition) => ({ definition, count: 1 })),
    ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
    const body = {
      id: `development:creature-returns:${release.definitions[base.commander]?.oracleId}:${release.hash.slice(0, 16)}`,
      commander: base.commander,
      entries,
    };
    const deck = DeckRevision.parse({ ...body, hash: await semanticHash(body) });
    validate(deck, release);
    const basics = deck.entries
      .filter((entry) => release.definitions[entry.definition]?.supertypes.includes("Basic"))
      .reduce((sum, entry) => sum + entry.count, 0);
    if (basics !== 39)
      throw new Error(
        `Creature-return spell fixture requires the existing 39 basic composition: ${base.id}`,
      );
    supplements.push(deck);
  }
  const report = {
    schema: "creature-return-decks/1",
    sourceReleaseHash: release.hash,
    sourceBundle: release.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    boundCreatureReturns: returnIds.length,
    coveredCreatureReturns: returnIds.length,
    coveredDefinitionIds: returnIds,
    excluded: [],
    executedGames: 0,
    scope:
      "Legal fixture composition and source membership only; no card or game execution certificate.",
  };
  return {
    decks: [...frozen, ...supplements],
    report: { ...report, hash: await semanticHash(report) },
  };
}
