import {
  DAMAGE_REPLACEMENT_PERMANENTS,
  reviewedDamageReplacementDefinition,
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
const profiles = [
  {
    commander: "Lady Orca",
    support: [
      "Sorin's Thirst",
      "Flame Slash",
      "Murder",
      "Final Reward",
      "Memnite",
      "Darksteel Sentinel",
    ],
  },
  {
    commander: "Tobias Andrion",
    support: [
      "Repulse",
      "Counterspell",
      "Queen's Commission",
      "Soul Warden",
      "Priest of Ancient Lore",
      "Memnite",
      "Darksteel Sentinel",
    ],
  },
] as const;
function supportFor(commander: CardDefinition) {
  const profile = profiles.find((row) => row.commander === commander.name);
  if (!profile) throw new Error(`Missing damage replacement fixture profile: ${commander.name}`);
  return profile.support;
}

function named(source: ContentRelease, name: string): CardDefinition {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing damage fixture definition: ${name}`);
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
    throw new Error(`Invalid damage fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = source.definitions[entry.definition];
    if (!card || !compatible(card, commander))
      throw new Error(`Missing or incompatible damage fixture card: ${entry.definition}`);
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`damage replacement fixture copy limit: ${card.name}`);
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
    throw new Error("Duplicate frozen damage fixture identity");
  return result;
}
function selectedCards(
  source: ContentRelease,
  commander: CardDefinition,
  damage: CardDefinition[],
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
  for (const card of damage) add(card);
  const support = supportFor(commander).map((name) => named(source, name));
  for (const card of support) {
    if (!compatible(card, commander))
      throw new Error(`Incompatible condition witness: ${card.name}`);
    add(card);
  }
  // Composition exposes positive-damage, trample, deathtouch and lifelink witnesses; no execution is asserted.
  for (const card of available.filter((card) =>
    card.spellProgram?.effects.some((effect) => effect.kind === "damage"),
  ))
    add(card);
  for (const keyword of ["trample", "deathtouch", "lifelink", "first-strike"] as const)
    for (const card of available
      .filter((card) => card.types.includes("Creature") && card.keywords.includes(keyword))
      .slice(0, 4))
      add(card);
  for (const card of available
    .filter((card) =>
      card.spellProgram?.effects.some((effect) => effect.kind === "modify-creature"),
    )
    .slice(0, 4))
    add(card);
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
    throw new Error(`Insufficient source-backed damage fixture cards: ${commander.name}`);
  for (const card of [...damage, ...support])
    if (!ids.has(card.id)) throw new Error(`Required damage fixture card omitted: ${card.name}`);
  return selected;
}
async function supplement(
  source: ContentRelease,
  commander: CardDefinition,
  damage: CardDefinition[],
): Promise<DeckRevision> {
  const cards = selectedCards(source, commander, damage);
  const basics = commander.colorIdentity.map((color) => {
    const basic = named(source, basicNames[color]);
    if (!basic.supertypes.includes("Basic") || !basic.types.includes("Land"))
      throw new Error(`Missing ordinary basic land: ${color}`);
    return basic;
  });
  if (basics.length === 0) throw new Error(`Missing damage fixture colors: ${commander.name}`);
  const entries = [
    { definition: commander.id, count: 1 },
    ...cards.map((card) => ({ definition: card.id, count: 1 })),
    ...basics.map((card, index) => ({
      definition: card.id,
      count: Math.floor(39 / basics.length) + (index < 39 % basics.length ? 1 : 0),
    })),
  ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
  const body = {
    id: `development:damage-replacement:${commander.oracleId}:${source.hash.slice(0, 16)}`,
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
  if (!commander) throw new Error("Missing damage fixture commander");
  return {
    deckHash: deck.hash,
    requiredDefinitionIds: supportFor(commander).map((name) => named(source, name).id),
    sourceProgramDefinitionIds: cards
      .filter((card) => card.damagePrograms !== undefined)
      .sort(ordered)
      .map((card) => card.id),
    damageSpellDefinitionIds: cards
      .filter((card) => card.spellProgram?.effects.some((effect) => effect.kind === "damage"))
      .sort(ordered)
      .map((card) => card.id),
    combatTraitWitnesses: cards
      .filter((card) =>
        card.keywords.some((keyword) =>
          ["trample", "deathtouch", "lifelink", "first-strike"].includes(keyword),
        ),
      )
      .sort(ordered)
      .map((card) => ({ definition: card.id, keywords: card.keywords })),
    scope:
      "These legal compositions supply potential damage, replacement, prevention, cannot-prevent and interaction witnesses. No cast, ordering, rewritten event, prevention, persistence or completed game is asserted.",
  };
}

/** Preserve existing revisions and append two legal profiles covering the five complete damage bodies. */
export async function makeDamageReplacementDecks(
  sourceInput: ContentRelease,
  frozenInputs: readonly DeckRevision[],
) {
  const source = await verifySourceRelease(sourceInput);
  const frozen = await frozenRevisions(frozenInputs, source);
  const damage = DAMAGE_REPLACEMENT_PERMANENTS.map((row) => {
    const card = source.definitions[`oracle:${row.identity}`];
    if (!card || !reviewedDamageReplacementDefinition(card))
      throw new Error(`Missing authenticated damage permanent: ${row.name}`);
    return card;
  }).sort(ordered);
  const commanders = Object.values(source.definitions)
    .filter((card) => card.commanderEligible)
    .sort(ordered);
  const supplements: DeckRevision[] = [];
  for (const { commander: name } of profiles) {
    const commander = named(source, name);
    if (!commander.commanderEligible) throw new Error(`Ineligible damage commander: ${name}`);
    const eligible = damage.filter((card) => compatible(card, commander));
    supplements.push(await supplement(source, commander, eligible));
  }
  const decks = [...frozen, ...supplements];
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length)
    throw new Error("damage replacement fixture identity collides with an existing revision");
  const coverage = damage.map((card) => {
    const included = supplements.filter((deck) =>
      deck.entries.some((entry) => entry.definition === card.id),
    );
    if (included.length === 0)
      throw new Error(`Damage source omitted from all compatible profiles: ${card.name}`);
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
    schema: "damage-replacement-decks/1",
    sourceReleaseHash: source.hash,
    sourceBundle: source.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    candidateBindings: damage.length,
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
      "Legal fixture composition only. Commander availability is exhaustive within the supplied authenticated release. New source bodies are split across compatible red/white seats; no red-white commander or color exception is invented. Damage assignment, effect ordering, prevention/cannot-prevent, durable choices and completed games require separate execution evidence.",
  };
  return { decks, report: { ...report, hash: await semanticHash(report) } };
}
