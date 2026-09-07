import {
  reviewedStrictProctorDefinition,
  STRICT_PROCTOR_PERMANENTS,
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
const commonSupport = [
  "Soul Warden",
  "Queen's Commission",
  "Ajani's Welcome",
  "Priest of Ancient Lore",
  "Memnite",
] as const;
const profiles = [
  {
    commander: "Tobias Andrion",
    support: [
      ...commonSupport,
      "Scholar of Stars",
      "Donatello, Turtle Techie",
      "Fateful Discovery",
      "Repulse",
      "Counterspell",
      "Darksteel Sentinel",
    ],
  },
  {
    commander: "Jasmine Boreal",
    support: [...commonSupport, "Jaddi Offshoot", "Essence Warden", "Elvish Visionary"],
  },
] as const;
function supportFor(commander: CardDefinition) {
  const profile = profiles.find((row) => row.commander === commander.name);
  if (!profile) throw new Error(`Missing Proctor fixture profile: ${commander.name}`);
  return profile.support;
}

function named(source: ContentRelease, name: string): CardDefinition {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing proctor fixture definition: ${name}`);
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
    throw new Error(`Invalid proctor fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = source.definitions[entry.definition];
    if (!card || !compatible(card, commander))
      throw new Error(`Missing or incompatible proctor fixture card: ${entry.definition}`);
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Proctor fixture copy limit: ${card.name}`);
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
    throw new Error("Duplicate frozen proctor fixture identity");
  return result;
}
function selectedCards(
  source: ContentRelease,
  commander: CardDefinition,
  proctor: CardDefinition[],
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
  for (const card of proctor) add(card);
  const support = supportFor(commander).map((name) => named(source, name));
  for (const card of support) {
    if (!compatible(card, commander))
      throw new Error(`Incompatible condition witness: ${card.name}`);
    add(card);
  }
  // These are potential entry subjects and providers; a deck list does not assert any trigger or payment execution.
  for (const card of available.filter((card) => card.triggerPrograms !== undefined).slice(0, 24))
    add(card);
  for (const card of available
    .filter((card) => card.spellProgram?.effects.some((effect) => effect.kind === "create-token"))
    .slice(0, 8))
    add(card);
  for (const card of available
    .filter((card) => card.types.includes("Artifact") && card.types.includes("Creature"))
    .slice(0, 6))
    add(card);
  for (const card of available.filter(
    (card) =>
      card.types.includes("Creature") &&
      (card.power ?? 0) > 0 &&
      !card.keywords.includes("defender"),
  ))
    add(card);
  if (selected.length !== 60)
    throw new Error(`Insufficient source-backed proctor fixture cards: ${commander.name}`);
  for (const card of [...proctor, ...support])
    if (!ids.has(card.id)) throw new Error(`Required proctor fixture card omitted: ${card.name}`);
  return selected;
}
async function supplement(
  source: ContentRelease,
  commander: CardDefinition,
  proctor: CardDefinition[],
): Promise<DeckRevision> {
  const cards = selectedCards(source, commander, proctor);
  const basics = commander.colorIdentity.map((color) => {
    const basic = named(source, basicNames[color]);
    if (!basic.supertypes.includes("Basic") || !basic.types.includes("Land"))
      throw new Error(`Missing ordinary basic land: ${color}`);
    return basic;
  });
  if (basics.length === 0) throw new Error(`Missing proctor fixture colors: ${commander.name}`);
  const entries = [
    { definition: commander.id, count: 1 },
    ...cards.map((card) => ({ definition: card.id, count: 1 })),
    ...basics.map((card, index) => ({
      definition: card.id,
      count: Math.floor(39 / basics.length) + (index < 39 % basics.length ? 1 : 0),
    })),
  ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
  const body = {
    id: `development:strict-proctor:${commander.oracleId}:${source.hash.slice(0, 16)}`,
    commander: commander.id,
    entries,
  };
  const deck = DeckRevision.parse({ ...body, hash: await semanticHash(body) });
  validate(deck, source);
  return deck;
}
function potentialWitnesses(source: ContentRelease, deck: DeckRevision) {
  const cards = deck.entries
    .map((row) => source.definitions[row.definition])
    .filter((card): card is CardDefinition => card !== undefined);
  const commander = source.definitions[deck.commander];
  if (!commander) throw new Error("Missing Proctor fixture commander");
  return {
    deckHash: deck.hash,
    requiredDefinitionIds: supportFor(commander).map((name) => named(source, name).id),
    ordinaryTriggerDefinitionIds: cards
      .filter((card) =>
        card.triggerPrograms?.some(
          (program) => program.schema !== "commander-entry-caused-trigger/1",
        ),
      )
      .sort(ordered)
      .map((card) => card.id),
    tokenProducerDefinitionIds: cards
      .filter((card) => card.spellProgram?.effects.some((effect) => effect.kind === "create-token"))
      .sort(ordered)
      .map((card) => card.id),
    manaSourceDefinitionIds: cards
      .filter((card) => card.manaAbilities.length > 0)
      .sort(ordered)
      .map((card) => card.id),
    scope:
      "Composition supplies possible self-entry, observer and token-entry causes, mana for owned payment, and interaction witnesses. No trigger capture, APNAP order, payment, decline or completed game is asserted.",
  };
}

/** Preserve existing revisions and append two legal profiles containing the complete Strict Proctor body. */
export async function makeStrictProctorDecks(
  sourceInput: ContentRelease,
  frozenInputs: readonly DeckRevision[],
) {
  const source = await verifySourceRelease(sourceInput);
  const frozen = await frozenRevisions(frozenInputs, source);
  const proctor = STRICT_PROCTOR_PERMANENTS.map((row) => {
    const card = source.definitions[`oracle:${row.identity}`];
    if (!card || !reviewedStrictProctorDefinition(card))
      throw new Error(`Missing authenticated proctor permanent: ${row.name}`);
    return card;
  }).sort(ordered);
  const commanders = Object.values(source.definitions)
    .filter((card) => card.commanderEligible)
    .sort(ordered);
  const supplements: DeckRevision[] = [];
  for (const { commander: name } of profiles) {
    const commander = named(source, name);
    if (!commander.commanderEligible) throw new Error(`Ineligible proctor commander: ${name}`);
    if (!proctor.every((card) => compatible(card, commander)))
      throw new Error(`Proctor sources exceed commander color identity: ${name}`);
    supplements.push(await supplement(source, commander, proctor));
  }
  const decks = [...frozen, ...supplements];
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length)
    throw new Error("Proctor fixture identity collides with an existing revision");
  const coverage = proctor.map((card) => {
    const included = supplements.filter((deck) =>
      deck.entries.some((entry) => entry.definition === card.id),
    );
    if (included.length !== supplements.length)
      throw new Error(`Proctor source omitted from required profiles: ${card.name}`);
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
    schema: "strict-proctor-decks/1",
    sourceReleaseHash: source.hash,
    sourceBundle: source.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    candidateBindings: proctor.length,
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
      "Legal fixture composition only. Commander availability is exhaustive within the supplied authenticated release. Potential entry and interaction witnesses do not certify trigger capture, APNAP ordering, mana or payment execution, source scenarios or completed games.",
  };
  return { decks, report: { ...report, hash: await semanticHash(report) } };
}
