import { reviewedStaticBonusDefinition, STATIC_BONUS_PERMANENTS } from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  type ContentRelease,
  DeckRevision,
  type StaticCreatureBonus,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { verifySourceRelease } from "./prepared";

const ordered = (a: CardDefinition, b: CardDefinition) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const compatible = (card: CardDefinition, commander: CardDefinition) =>
  card.colorIdentity.every((color) => commander.colorIdentity.includes(color));
const affordable = (a: CardDefinition, b: CardDefinition) =>
  a.manaValue - b.manaValue || ordered(a, b);

function validate(deck: DeckRevision, source: ContentRelease): void {
  const commander = source.definitions[deck.commander];
  if (
    !commander?.commanderEligible ||
    deck.entries.reduce((sum, entry) => sum + entry.count, 0) !== 100 ||
    deck.entries.find((entry) => entry.definition === deck.commander)?.count !== 1 ||
    new Set(deck.entries.map((entry) => entry.definition)).size !== deck.entries.length
  )
    throw new Error(`Invalid static fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = source.definitions[entry.definition];
    if (!card || !compatible(card, commander))
      throw new Error(`Missing or incompatible static fixture card: ${entry.definition}`);
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Static fixture copy limit: ${card.name}`);
  }
}

async function frozenRevisions(inputs: readonly DeckRevision[], source: ContentRelease) {
  const result: DeckRevision[] = [];
  for (const input of inputs) {
    const deck = DeckRevision.parse(input);
    const { hash, ...body } = deck;
    if ((await semanticHash(body)) !== hash)
      throw new Error(`Frozen deck hash mismatch: ${deck.id}`);
    validate(deck, source);
    result.push(deck);
  }
  if (result.length === 0) throw new Error("At least one frozen Commander fixture is required");
  if (new Set(result.map((deck) => deck.id)).size !== result.length)
    throw new Error("Duplicate frozen static fixture identity");
  return result;
}

function named(source: ContentRelease, name: string): CardDefinition {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing static fixture definition: ${name}`);
  return card;
}

function predicateMatches(card: CardDefinition, predicate: StaticCreatureBonus["predicate"]) {
  if (predicate.kind === "legendary") return card.supertypes.includes("Legendary");
  if (predicate.kind === "subtype") return card.subtypes.includes(predicate.subtype);
  return true;
}

function supportSpells(cards: CardDefinition[], commander: CardDefinition): CardDefinition[] {
  const result = cards
    .filter((card) => card.spellProgram?.effects.some((effect) => effect.kind === "create-token"))
    .sort(affordable)
    .slice(0, 6);
  for (const kind of ["return-to-hand", "destroy", "modify-creature", "counter"] as const) {
    const card = cards
      .filter((row) => row.spellProgram?.effects.some((effect) => effect.kind === kind))
      .sort(affordable)[0];
    if (card) result.push(card);
  }
  if (commander.name === "Arvad the Cursed") {
    const feast = cards.find((card) => card.name === "Call to the Feast");
    if (!feast) throw new Error("Arvad's fixture requires authenticated Call to the Feast");
    result.push(feast);
  }
  return [...new Map(result.map((card) => [card.id, card])).values()];
}

function selectedCards(
  source: ContentRelease,
  commander: CardDefinition,
  statics: CardDefinition[],
): CardDefinition[] {
  const available = Object.values(source.definitions)
    .filter((card) => card.id !== commander.id && compatible(card, commander))
    .sort(affordable);
  const selected = [...statics.filter((card) => card.id !== commander.id)];
  const ids = new Set([commander.id, ...selected.map((card) => card.id)]);
  const names = new Set([commander.name, ...selected.map((card) => card.name)]);
  const add = (card: CardDefinition) => {
    if (selected.length < 60 && !ids.has(card.id) && !names.has(card.name)) {
      selected.push(card);
      ids.add(card.id);
      names.add(card.name);
    }
  };
  for (const card of supportSpells(available, commander)) add(card);
  const creatures = available.filter((card) => card.types.includes("Creature"));
  // Include ordinary source-backed recipients for each available tribal/legendary
  // predicate. Membership is fixture design, not proof that a bonus was executed.
  for (const provider of statics) {
    const predicate = provider.staticPrograms?.[0].predicate;
    if (!predicate || predicate.kind === "all") continue;
    for (const recipient of creatures
      .filter((card) => !ids.has(card.id) && predicateMatches(card, predicate))
      .slice(0, 2))
      add(recipient);
  }
  for (const card of creatures.filter(
    (card) => (card.power ?? 0) > 0 && !card.keywords.includes("defender"),
  ))
    add(card);
  if (selected.length !== 60)
    throw new Error(`Insufficient source-backed static fixture cards: ${commander.name}`);
  return selected;
}

async function supplement(
  source: ContentRelease,
  commander: CardDefinition,
  statics: CardDefinition[],
): Promise<DeckRevision> {
  const cards = selectedCards(source, commander, statics);
  const basicNames = {
    W: "Plains",
    U: "Island",
    B: "Swamp",
    R: "Mountain",
    G: "Forest",
    C: "Wastes",
  };
  const basics = commander.colorIdentity.map((color) => {
    const basic = named(source, basicNames[color]);
    if (!basic.supertypes.includes("Basic") || !basic.types.includes("Land"))
      throw new Error(`Missing ordinary basic land: ${color}`);
    return basic;
  });
  if (basics.length === 0) throw new Error(`Missing static fixture colors: ${commander.name}`);
  const entries = [
    { definition: commander.id, count: 1 },
    ...cards.map((card) => ({ definition: card.id, count: 1 })),
    ...basics.map((card, index) => ({
      definition: card.id,
      count: Math.floor(39 / basics.length) + (index < 39 % basics.length ? 1 : 0),
    })),
  ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
  const body = {
    id: `development:static-bonuses:${commander.oracleId}:${source.hash.slice(0, 16)}`,
    commander: commander.id,
    entries,
  };
  const deck = DeckRevision.parse({ ...body, hash: await semanticHash(body) });
  validate(deck, source);
  return deck;
}

/** Preserve prior revisions and append legal source-bound profiles, with explicit commander gaps. */
export async function makeStaticBonusDecks(
  sourceInput: ContentRelease,
  frozenInputs: readonly DeckRevision[],
) {
  const source = await verifySourceRelease(sourceInput);
  const frozen = await frozenRevisions(frozenInputs, source);
  const statics = STATIC_BONUS_PERMANENTS.map((row) => {
    const card = source.definitions[`oracle:${row.identity}`];
    if (!card || !reviewedStaticBonusDefinition(card))
      throw new Error(`Missing authenticated static-bonus permanent: ${row.name}`);
    return card;
  }).sort(ordered);
  const commanders = Object.values(source.definitions)
    .filter((card) => card.commanderEligible)
    .sort(ordered);
  const supplements: DeckRevision[] = [];
  for (const name of [
    "Jasmine Boreal",
    "The Lady of the Mountain",
    "Lady Orca",
    "Tobias Andrion",
    "Sivitri Scarzam",
    "Arvad the Cursed",
  ]) {
    const commander = named(source, name);
    if (!commander.commanderEligible)
      throw new Error(`Ineligible static fixture commander: ${name}`);
    supplements.push(
      await supplement(
        source,
        commander,
        statics.filter((card) => compatible(card, commander)),
      ),
    );
  }
  const all = [...frozen, ...supplements];
  if (new Set(all.map((deck) => deck.id)).size !== all.length)
    throw new Error("Static fixture identity collides with an existing revision");
  const coverage = statics.map((card) => ({
    definition: card.id,
    name: card.name,
    colorIdentity: card.colorIdentity,
    compatibleCommanderIds: commanders
      .filter((commander) => compatible(card, commander))
      .map((commander) => commander.id),
    supplementalDeckHashes: supplements
      .filter((deck) => deck.entries.some((entry) => entry.definition === card.id))
      .map((deck) => deck.hash),
  }));
  const excluded = coverage
    .filter((row) => row.supplementalDeckHashes.length === 0)
    .map((row) => {
      if (row.compatibleCommanderIds.length > 0)
        throw new Error(
          `Static fixture omission despite an available legal commander: ${row.name}`,
        );
      return {
        definition: row.definition,
        name: row.name,
        colorIdentity: row.colorIdentity,
        reason: "no-compatible-implemented-commander-in-release",
        reviewedCommanderDefinitions: commanders.length,
        executed: false,
      };
    });
  const coveredDefinitionIds = coverage
    .filter((row) => row.supplementalDeckHashes.length > 0)
    .map((row) => row.definition);
  const arvad = supplements.find(
    (deck) => source.definitions[deck.commander]?.name === "Arvad the Cursed",
  );
  for (const name of ["Call to the Feast", "Legion Lieutenant"])
    if (!arvad?.entries.some((entry) => source.definitions[entry.definition]?.name === name))
      throw new Error(`Arvad's fixture must contain ${name}`);
  const report = {
    schema: "static-bonus-decks/1",
    sourceReleaseHash: source.hash,
    sourceBundle: source.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    candidateBindings: statics.length,
    coveredBindings: coveredDefinitionIds.length,
    coveredDefinitionIds,
    commanderInventory: commanders.map((card) => ({
      definition: card.id,
      name: card.name,
      colorIdentity: card.colorIdentity,
    })),
    coverage,
    excluded,
    newlyReachableTokenProducer: named(source, "Call to the Feast").id,
    executedGames: 0,
    scope:
      "Legal fixture composition and source membership only. Commander availability is exhaustive within the supplied authenticated release; fixture membership is not card or game execution evidence.",
  };
  return { decks: all, report: { ...report, hash: await semanticHash(report) } };
}
