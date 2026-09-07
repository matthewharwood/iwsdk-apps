import {
  CONDITIONAL_SELF_ENTRY_PERMANENTS,
  reviewedConditionalSelfEntryDefinition,
} from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  type ContentRelease,
  DeckRevision,
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
const supportNames = ["Memnite", "Darksteel Sentinel", "Repulse", "Counterspell"] as const;

function named(source: ContentRelease, name: string): CardDefinition {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing conditional fixture definition: ${name}`);
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
    throw new Error(`Invalid conditional fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = source.definitions[entry.definition];
    if (!card || !compatible(card, commander))
      throw new Error(`Missing or incompatible conditional fixture card: ${entry.definition}`);
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Conditional fixture copy limit: ${card.name}`);
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
    throw new Error("Duplicate frozen conditional fixture identity");
  return result;
}
function selectedCards(
  source: ContentRelease,
  commander: CardDefinition,
  conditional: CardDefinition[],
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
  for (const card of conditional) add(card);
  const support = supportNames.map((name) => named(source, name));
  for (const card of support) {
    if (!compatible(card, commander))
      throw new Error(`Incompatible condition witness: ${card.name}`);
    add(card);
  }
  // Distinct cheap artifacts supply entry and resolution witnesses; their actual order stays a game decision.
  for (const card of available
    .filter((card) => card.types.includes("Artifact") && card.types.includes("Creature"))
    .slice(0, 16))
    add(card);
  for (const card of available.filter((card) => card.spellProgram !== undefined).slice(0, 8))
    add(card);
  for (const card of available.filter(
    (card) =>
      card.types.includes("Creature") &&
      (card.power ?? 0) > 0 &&
      !card.keywords.includes("defender"),
  ))
    add(card);
  if (selected.length !== 60)
    throw new Error(`Insufficient source-backed conditional fixture cards: ${commander.name}`);
  for (const card of [...conditional, ...support])
    if (!ids.has(card.id))
      throw new Error(`Required conditional fixture card omitted: ${card.name}`);
  return selected;
}
async function supplement(
  source: ContentRelease,
  commander: CardDefinition,
  conditional: CardDefinition[],
): Promise<DeckRevision> {
  const cards = selectedCards(source, commander, conditional);
  const basics = commander.colorIdentity.map((color) => {
    const basic = named(source, basicNames[color]);
    if (!basic.supertypes.includes("Basic") || !basic.types.includes("Land"))
      throw new Error(`Missing ordinary basic land: ${color}`);
    return basic;
  });
  if (basics.length === 0) throw new Error(`Missing conditional fixture colors: ${commander.name}`);
  const entries = [
    { definition: commander.id, count: 1 },
    ...cards.map((card) => ({ definition: card.id, count: 1 })),
    ...basics.map((card, index) => ({
      definition: card.id,
      count: Math.floor(39 / basics.length) + (index < 39 % basics.length ? 1 : 0),
    })),
  ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
  const body = {
    id: `development:conditional-self-entry:${commander.oracleId}:${source.hash.slice(0, 16)}`,
    commander: commander.id,
    entries,
  };
  const deck = DeckRevision.parse({ ...body, hash: await semanticHash(body) });
  validate(deck, source);
  return deck;
}
function potentialWitnesses(source: ContentRelease, deck: DeckRevision) {
  const cards = deck.entries.map((row) => source.definitions[row.definition]);
  const artifacts = cards
    .filter((card): card is CardDefinition => card?.types.includes("Artifact") === true)
    .sort(ordered);
  if (artifacts.length < 2)
    throw new Error("Conditional fixture requires distinct artifact witnesses");
  return {
    deckHash: deck.hash,
    artifactDefinitionIds: artifacts.map((card) => card.id),
    zeroCostArtifact: named(source, "Memnite").id,
    differentFlashArtifact: named(source, "Darksteel Sentinel").id,
    returnAndDrawSpell: named(source, "Repulse").id,
    counterSpell: named(source, "Counterspell").id,
    scope:
      "Composition supplies potential artifacts at either condition check, a different flash artifact, source or witness return, and a counterspell. No specific draw, priority sequence, condition outcome or completed game is asserted.",
  };
}

/** Preserve existing revisions and append two legal profiles for the two exact conditional bodies. */
export async function makeConditionalSelfEntryDecks(
  sourceInput: ContentRelease,
  frozenInputs: readonly DeckRevision[],
) {
  const source = await verifySourceRelease(sourceInput);
  const frozen = await frozenRevisions(frozenInputs, source);
  const conditional = CONDITIONAL_SELF_ENTRY_PERMANENTS.map((row) => {
    const card = source.definitions[`oracle:${row.identity}`];
    if (!card || !reviewedConditionalSelfEntryDefinition(card))
      throw new Error(`Missing authenticated conditional permanent: ${row.name}`);
    return card;
  }).sort(ordered);
  const commanders = Object.values(source.definitions)
    .filter((card) => card.commanderEligible)
    .sort(ordered);
  const supplements: DeckRevision[] = [];
  for (const name of ["Donatello, Turtle Techie", "Tobias Andrion"]) {
    const commander = named(source, name);
    if (!commander.commanderEligible) throw new Error(`Ineligible conditional commander: ${name}`);
    if (!conditional.every((card) => compatible(card, commander)))
      throw new Error(`Conditional sources exceed commander color identity: ${name}`);
    supplements.push(await supplement(source, commander, conditional));
  }
  const decks = [...frozen, ...supplements];
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length)
    throw new Error("Conditional fixture identity collides with an existing revision");
  const coverage = conditional.map((card) => {
    const included = supplements.filter((deck) =>
      deck.entries.some((entry) => entry.definition === card.id),
    );
    if (included.length !== supplements.length)
      throw new Error(`Conditional source omitted from required profiles: ${card.name}`);
    return {
      definition: card.id,
      name: card.name,
      sourceVersion: card.sourceVersion,
      colorIdentity: card.colorIdentity,
      compatibleCommanderIds: commanders
        .filter((commander) => compatible(card, commander))
        .map((row) => row.id),
      supplementalDeckHashes: included.map((deck) => deck.hash),
      potentialWitnesses: included.map((deck) => potentialWitnesses(source, deck)),
    };
  });
  const report = {
    schema: "conditional-self-entry-decks/1",
    sourceReleaseHash: source.hash,
    sourceBundle: source.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    candidateBindings: conditional.length,
    coveredBindings: coverage.length,
    coveredDefinitionIds: coverage.map((row) => row.definition),
    commanderInventory: commanders.map((card) => ({
      definition: card.id,
      name: card.name,
      colorIdentity: card.colorIdentity,
    })),
    coverage,
    excluded: [],
    executedGames: 0,
    scope:
      "Legal fixture composition only. Commander availability is exhaustive within the supplied authenticated release. Potential artifact and interaction witnesses do not certify condition execution, source scenarios or completed games.",
  };
  return { decks, report: { ...report, hash: await semanticHash(report) } };
}
