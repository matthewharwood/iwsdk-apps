import {
  ENTRY_OBSERVER_PERMANENTS,
  reviewedEntryObserverDefinition,
} from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  type ContentRelease,
  DeckRevision,
  type EntryObserverProgram,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { verifySourceRelease } from "./prepared";

const ordered = (a: CardDefinition, b: CardDefinition) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const affordable = (a: CardDefinition, b: CardDefinition) =>
  a.manaValue - b.manaValue || ordered(a, b);
const compatible = (card: CardDefinition, commander: CardDefinition) =>
  card.colorIdentity.every((color) => commander.colorIdentity.includes(color));
const basicNames = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
  C: "Wastes",
};

function named(source: ContentRelease, name: string): CardDefinition {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing entry-observer fixture definition: ${name}`);
  return card;
}
function validate(deck: DeckRevision, source: ContentRelease): void {
  const commander = source.definitions[deck.commander];
  if (
    !commander?.commanderEligible ||
    deck.entries.reduce((sum, row) => sum + row.count, 0) !== 100 ||
    deck.entries.find((row) => row.definition === deck.commander)?.count !== 1 ||
    new Set(deck.entries.map((row) => row.definition)).size !== deck.entries.length
  )
    throw new Error(`Invalid observer fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = source.definitions[entry.definition];
    if (!card || !compatible(card, commander))
      throw new Error(`Missing or incompatible observer fixture card: ${entry.definition}`);
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Observer fixture copy limit: ${card.name}`);
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
    throw new Error("Duplicate frozen observer fixture identity");
  return result;
}
function observerProgram(card: CardDefinition): EntryObserverProgram {
  const program = card.triggerPrograms?.[0];
  if (program?.schema !== "commander-entry-observer/1")
    throw new Error(`Missing observer program: ${card.name}`);
  return program;
}
function matchingCharacteristics(
  card: { types: string[]; subtypes: string[] },
  program: EntryObserverProgram,
) {
  const filter = program.trigger.subject.filter;
  return (
    filter.types.every((type) => card.types.includes(type)) &&
    (!("subtype" in filter) || card.subtypes.includes(filter.subtype))
  );
}
function matchingCard(subject: CardDefinition, observer: CardDefinition) {
  const program = observerProgram(observer);
  if (subject.id === observer.id && program.trigger.subject.kind === "self-or-filter") return true;
  if (subject.id === observer.id && program.trigger.subject.filter.excludeSource) return false;
  return matchingCharacteristics(subject, program);
}
function newlyReachable(
  cards: CardDefinition[],
  observers: CardDefinition[],
  commanders: CardDefinition[],
) {
  const newIds = new Set(observers.map((card) => card.id));
  const priorCommanders = commanders.filter((card) => !newIds.has(card.id));
  return cards.filter(
    (card) =>
      !newIds.has(card.id) &&
      commanders.some((commander) => compatible(card, commander)) &&
      !priorCommanders.some((commander) => compatible(card, commander)),
  );
}
function selectedCards(
  source: ContentRelease,
  commander: CardDefinition,
  observers: CardDefinition[],
  unlocked: CardDefinition[],
) {
  const available = Object.values(source.definitions)
    .filter((card) => card.id !== commander.id && compatible(card, commander))
    .sort(affordable);
  const selected: CardDefinition[] = [];
  const ids = new Set([commander.id]);
  const names = new Set([commander.name]);
  const add = (card: CardDefinition) => {
    if (selected.length < 60 && !ids.has(card.id) && !names.has(card.name)) {
      selected.push(card);
      ids.add(card.id);
      names.add(card.name);
    }
  };
  for (const card of observers.filter((card) => compatible(card, commander))) add(card);
  for (const card of unlocked.filter((card) => compatible(card, commander))) add(card);
  for (const card of available
    .filter((card) => card.spellProgram?.effects.some((effect) => effect.kind === "create-token"))
    .slice(0, 6))
    add(card);
  for (const kind of ["return-to-hand", "destroy", "counter"] as const) {
    const card = available.find((row) =>
      row.spellProgram?.effects.some((effect) => effect.kind === kind),
    );
    if (card) add(card);
  }
  // Multiple ordinary entrants keep the observer's complete filter reachable through legal casts.
  for (const observer of observers.filter((card) => compatible(card, commander))) {
    for (const card of available
      .filter((card) => !card.types.includes("Land") && matchingCard(card, observer))
      .slice(0, 4))
      add(card);
  }
  for (const type of ["Enchantment", "Artifact"])
    for (const card of available
      .filter((card) => card.types.includes(type))
      .slice(0, type === "Artifact" ? 6 : 4))
      add(card);
  for (const card of available.filter(
    (card) =>
      card.types.includes("Creature") &&
      (card.power ?? 0) > 0 &&
      !card.keywords.includes("defender"),
  ))
    add(card);
  if (selected.length !== 60)
    throw new Error(`Insufficient source-backed observer fixture cards: ${commander.name}`);
  for (const card of [...observers, ...unlocked].filter((card) => compatible(card, commander)))
    if (!ids.has(card.id))
      throw new Error(`Required observer fixture card was omitted: ${card.name}`);
  return selected;
}
async function supplement(
  source: ContentRelease,
  commander: CardDefinition,
  observers: CardDefinition[],
  unlocked: CardDefinition[],
): Promise<DeckRevision> {
  const cards = selectedCards(source, commander, observers, unlocked);
  const basics = commander.colorIdentity.map((color) => {
    const basic = named(source, basicNames[color]);
    if (!basic.supertypes.includes("Basic") || !basic.types.includes("Land"))
      throw new Error(`Missing ordinary basic land: ${color}`);
    return basic;
  });
  if (basics.length === 0) throw new Error(`Missing observer fixture colors: ${commander.name}`);
  const entries = [
    { definition: commander.id, count: 1 },
    ...cards.map((card) => ({ definition: card.id, count: 1 })),
    ...basics.map((card, index) => ({
      definition: card.id,
      count: Math.floor(39 / basics.length) + (index < 39 % basics.length ? 1 : 0),
    })),
  ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
  const body = {
    id: `development:entry-observers:${commander.oracleId}:${source.hash.slice(0, 16)}`,
    commander: commander.id,
    entries,
  };
  const deck = DeckRevision.parse({ ...body, hash: await semanticHash(body) });
  validate(deck, source);
  return deck;
}
function potentialWitnesses(source: ContentRelease, deck: DeckRevision, observer: CardDefinition) {
  const cards = deck.entries
    .map((row) => source.definitions[row.definition])
    .filter((card): card is CardDefinition => card !== undefined);
  const cardIds = cards
    .filter((card) => matchingCard(card, observer))
    .map((card) => card.id)
    .sort();
  const tokenProducers = cards.flatMap((card) =>
    (card.spellProgram?.effects ?? []).flatMap((effect) => {
      if (effect.kind !== "create-token") return [];
      const template = source.tokenTemplates?.[effect.templateId];
      return template &&
        matchingCharacteristics(template.characteristics, observerProgram(observer))
        ? [{ definition: card.id, templateId: effect.templateId, count: effect.count }]
        : [];
    }),
  );
  if (cardIds.length === 0 && tokenProducers.length === 0)
    throw new Error(`Observer fixture has no potential subject: ${observer.name}`);
  return { deckHash: deck.hash, cardIds, tokenProducers };
}

/** Append three legal profiles. Potential entry witnesses describe composition, never executed events. */
export async function makeEntryObserverDecks(
  sourceInput: ContentRelease,
  frozenInputs: readonly DeckRevision[],
) {
  const source = await verifySourceRelease(sourceInput);
  const frozen = await frozenRevisions(frozenInputs, source);
  const observers = ENTRY_OBSERVER_PERMANENTS.map((row) => {
    const card = source.definitions[`oracle:${row.identity}`];
    if (!card || !reviewedEntryObserverDefinition(card))
      throw new Error(`Missing authenticated entry-observer permanent: ${row.name}`);
    return card;
  }).sort(ordered);
  const cards = Object.values(source.definitions).sort(ordered);
  const commanders = cards.filter((card) => card.commanderEligible);
  const unlocked = newlyReachable(cards, observers, commanders);
  const supplements: DeckRevision[] = [];
  for (const name of ["Jasmine Boreal", "Tatyova, Benthic Druid", "Yargle and Multani"]) {
    const commander = named(source, name);
    if (!commander.commanderEligible)
      throw new Error(`Ineligible observer fixture commander: ${name}`);
    supplements.push(await supplement(source, commander, observers, unlocked));
  }
  const decks = [...frozen, ...supplements];
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length)
    throw new Error("Observer fixture identity collides with an existing revision");
  const coverage = observers.map((card) => {
    const included = supplements.filter((deck) =>
      deck.entries.some((entry) => entry.definition === card.id),
    );
    const compatibleCommanderIds = commanders
      .filter((commander) => compatible(card, commander))
      .map((commander) => commander.id);
    if (included.length === 0)
      throw new Error(`Observer omitted despite available legal commander: ${card.name}`);
    return {
      definition: card.id,
      name: card.name,
      colorIdentity: card.colorIdentity,
      compatibleCommanderIds,
      supplementalDeckHashes: included.map((deck) => deck.hash),
      potentialWitnesses: included.map((deck) => potentialWitnesses(source, deck, card)),
    };
  });
  const report = {
    schema: "entry-observer-decks/1",
    sourceReleaseHash: source.hash,
    sourceBundle: source.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    candidateBindings: observers.length,
    coveredBindings: coverage.length,
    coveredDefinitionIds: coverage.map((row) => row.definition),
    commanderInventory: commanders.map((card) => ({
      definition: card.id,
      name: card.name,
      colorIdentity: card.colorIdentity,
    })),
    coverage,
    excluded: [],
    newlyCommanderReachableDefinitionIds: unlocked.map((card) => card.id),
    executedGames: 0,
    scope:
      "Legal fixture composition and potential entry witnesses only. Commander availability is exhaustive within the supplied authenticated release; membership is not a triggered event, source execution or game certificate.",
  };
  return { decks, report: { ...report, hash: await semanticHash(report) } };
}
