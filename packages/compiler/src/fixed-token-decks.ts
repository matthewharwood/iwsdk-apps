import { FIXED_TOKEN_SPELLS, FIXED_TOKEN_VERSION } from "@iwsdk-apps/card-programs";
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
    throw new Error(`Invalid fixed-token spell fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = release.definitions[entry.definition];
    if (!card?.colorIdentity.every((color) => commander.colorIdentity.includes(color)))
      throw new Error(
        `Missing or incompatible fixed-token spell fixture card: ${entry.definition}`,
      );
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Fixed-token spell fixture copy limit: ${card.name}`);
  }
}

/** Preserve earlier revisions and append legal profiles; report producers lacking a compatible commander. */
export async function makeFixedTokenDecks(
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
  const allTokenIds = FIXED_TOKEN_SPELLS.map((row) => `oracle:${row.identity}`).sort();
  for (const id of allTokenIds)
    if (release.definitions[id]?.implementationRevision !== FIXED_TOKEN_VERSION)
      throw new Error(`Missing authenticated fixed-token spell: ${id}`);
  const supplements: DeckRevision[] = [];
  for (const name of [
    "Jasmine Boreal",
    "The Lady of the Mountain",
    "Lady Orca",
    "Tobias Andrion",
    "Sivitri Scarzam",
  ]) {
    const base = frozen.findLast((deck) => release.definitions[deck.commander]?.name === name);
    if (!base) throw new Error(`Missing frozen token fixture commander: ${name}`);
    const commander = release.definitions[base.commander];
    if (!commander) throw new Error(`Missing fixture commander definition: ${base.commander}`);
    const tokenIds = allTokenIds.filter((id) =>
      release.definitions[id]?.colorIdentity.every((color) =>
        commander.colorIdentity.includes(color),
      ),
    );
    if (tokenIds.length === 0) throw new Error(`No compatible token producers: ${name}`);
    const replacements = base.entries
      .filter(
        (entry) =>
          entry.definition !== base.commander &&
          release.definitions[entry.definition]?.types.includes("Creature") &&
          entry.count === 1,
      )
      .map((entry) => entry.definition)
      .sort()
      .slice(0, tokenIds.length);
    if (
      replacements.length !== tokenIds.length ||
      base.entries.some((entry) => tokenIds.includes(entry.definition))
    )
      throw new Error(
        `Fixed-token spell fixture needs enough distinct creature replacements: ${base.id}`,
      );
    const entries = [
      ...base.entries.filter((entry) => !replacements.includes(entry.definition)),
      ...tokenIds.map((definition) => ({ definition, count: 1 })),
    ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
    const body = {
      id: `development:fixed-tokens:${release.definitions[base.commander]?.oracleId}:${release.hash.slice(0, 16)}`,
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
        `Fixed-token spell fixture requires the existing 39 basic composition: ${base.id}`,
      );
    supplements.push(deck);
  }
  const covered = [
    ...new Set(
      supplements.flatMap((deck) =>
        deck.entries
          .filter((row) => allTokenIds.includes(row.definition))
          .map((row) => row.definition),
      ),
    ),
  ].sort();
  const commanders = Object.values(release.definitions).filter((card) => card.commanderEligible);
  const excluded = allTokenIds
    .filter((id) => !covered.includes(id))
    .map((id) => {
      const card = release.definitions[id];
      if (
        !card ||
        commanders.some((commander) =>
          card.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
        )
      )
        throw new Error(`Token fixture omission despite an available legal commander: ${id}`);
      return {
        definition: id,
        name: card.name,
        reason: "no-compatible-implemented-commander",
        colorIdentity: card.colorIdentity,
        reviewedCommanderDefinitions: commanders.length,
        executed: false,
      };
    });
  const report = {
    schema: "fixed-token-decks/1",
    sourceReleaseHash: release.hash,
    sourceBundle: release.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    boundTokenProducers: allTokenIds.length,
    coveredTokenProducers: covered.length,
    auxiliaryTokenTemplates: Object.keys(release.tokenTemplates ?? {}).length,
    coveredDefinitionIds: covered,
    excluded,
    executedGames: 0,
    scope:
      "Legal fixture composition and source membership only; no card or game execution certificate.",
  };
  return {
    decks: [...frozen, ...supplements],
    report: { ...report, hash: await semanticHash(report) },
  };
}
