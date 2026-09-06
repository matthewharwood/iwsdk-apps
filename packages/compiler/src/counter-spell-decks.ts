import { COUNTER_SPELL_VERSION, COUNTER_SPELLS } from "@iwsdk-apps/card-programs";
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
    throw new Error(`Invalid counterspell fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = release.definitions[entry.definition];
    if (!card?.colorIdentity.every((color) => commander.colorIdentity.includes(color)))
      throw new Error(`Missing or incompatible counterspell fixture card: ${entry.definition}`);
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Counterspell fixture copy limit: ${card.name}`);
  }
}

/** Preserve existing revisions, then append two legal source-backed blue profiles with all seven counters. */
export async function makeCounterSpellDecks(
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
  const counterIds = COUNTER_SPELLS.map((row) => `oracle:${row.identity}`).sort();
  for (const id of counterIds)
    if (release.definitions[id]?.implementationRevision !== COUNTER_SPELL_VERSION)
      throw new Error(`Missing authenticated counterspell: ${id}`);
  const supplements: DeckRevision[] = [];
  for (const name of ["Tobias Andrion", "Sivitri Scarzam"]) {
    const base = frozen.find((deck) => release.definitions[deck.commander]?.name === name);
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
      .slice(0, counterIds.length);
    if (
      replacements.length !== counterIds.length ||
      base.entries.some((entry) => counterIds.includes(entry.definition))
    )
      throw new Error(
        `Counterspell fixture needs seven distinct creature replacements: ${base.id}`,
      );
    const entries = [
      ...base.entries.filter((entry) => !replacements.includes(entry.definition)),
      ...counterIds.map((definition) => ({ definition, count: 1 })),
    ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
    const body = {
      id: `development:counter-spells:${release.definitions[base.commander]?.oracleId}:${release.hash.slice(0, 16)}`,
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
        `Counterspell fixture requires the existing 39 basic composition: ${base.id}`,
      );
    supplements.push(deck);
  }
  const report = {
    schema: "counter-spell-decks/1",
    sourceReleaseHash: release.hash,
    sourceBundle: release.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    boundCounterspells: counterIds.length,
    coveredCounterspells: counterIds.length,
    coveredDefinitionIds: counterIds,
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
