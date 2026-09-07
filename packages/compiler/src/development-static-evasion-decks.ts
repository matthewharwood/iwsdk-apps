import {
  reviewedStaticEvasionDefinition,
  STATIC_EVASION_PERMANENTS,
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
    commander: "Tobias Andrion",
    support: ["Memnite", "Darksteel Sentinel", "Repulse", "Counterspell"],
  },
  {
    commander: "Lady Orca",
    support: ["Memnite", "Darksteel Sentinel", "Sorin's Thirst", "Murder"],
  },
  { commander: "Riven Turnbull", support: ["Memnite", "Darksteel Sentinel", "Repulse", "Murder"] },
  {
    commander: "Tatyova, Benthic Druid",
    support: ["Memnite", "Darksteel Sentinel", "Giant Growth", "Repulse"],
  },
  {
    commander: "Lady Zhurong, Warrior Queen",
    support: ["Memnite", "Darksteel Sentinel", "Giant Growth", "Grizzly Bears"],
  },
  {
    commander: "Lu Meng, Wu General",
    support: ["Memnite", "Darksteel Sentinel", "Repulse", "Counterspell"],
  },
] as const;
function named(source: ContentRelease, name: string): CardDefinition {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing evasion fixture source: ${name}`);
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
    throw new Error(`Invalid evasion fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = source.definitions[entry.definition];
    if (!card || !compatible(card, commander))
      throw new Error(`Missing or incompatible evasion fixture card: ${entry.definition}`);
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Evasion fixture copy limit: ${card.name}`);
  }
}
async function frozenRevisions(inputs: readonly DeckRevision[], source: ContentRelease) {
  const result: DeckRevision[] = [];
  for (const input of inputs) {
    const deck = DeckRevision.parse(input),
      { hash, ...body } = deck;
    if ((await semanticHash(body)) !== hash)
      throw new Error(`Frozen evasion fixture hash mismatch: ${deck.id}`);
    validate(deck, source);
    result.push(deck);
  }
  if (!result.length || new Set(result.map((deck) => deck.id)).size !== result.length)
    throw new Error("Missing or duplicate frozen evasion fixture identity");
  return result;
}
function assign(cards: CardDefinition[], commanders: CardDefinition[]) {
  const groups = commanders.map(() => [] as CardDefinition[]);
  // First allocate the least flexible multicolor cards. Commander cards are already present in their own profile.
  for (const card of [...cards].sort(
    (a, b) => b.colorIdentity.length - a.colorIdentity.length || ordered(a, b),
  )) {
    if (commanders.some((commander) => commander.id === card.id)) continue;
    const eligible = commanders
      .map((commander, index) => ({ commander, index }))
      .filter((row) => compatible(card, row.commander))
      .sort(
        (a, b) =>
          (groups[a.index]?.length ?? 0) - (groups[b.index]?.length ?? 0) || a.index - b.index,
      );
    const destination = eligible[0];
    if (destination) groups[destination.index]?.push(card);
  }
  return groups;
}
function selectedCards(
  source: ContentRelease,
  commander: CardDefinition,
  assigned: CardDefinition[],
  supportNames: readonly string[],
) {
  const selected: CardDefinition[] = [],
    ids = new Set([commander.id]),
    names = new Set([commander.name]);
  const add = (card: CardDefinition) => {
    if (
      selected.length < 60 &&
      !ids.has(card.id) &&
      !names.has(card.name) &&
      compatible(card, commander) &&
      !card.types.includes("Land")
    ) {
      selected.push(card);
      ids.add(card.id);
      names.add(card.name);
    }
  };
  const support = supportNames.map((name) => named(source, name));
  for (const card of [...assigned, ...support]) add(card);
  const available = Object.values(source.definitions)
    .filter(
      (card) =>
        compatible(card, commander) && card.implementationRevision !== "static-evasion-permanent/1",
    )
    .sort(affordable);
  // Actual source-backed creatures expose combat/target/lifetime interactions; this is composition, not execution evidence.
  for (const keyword of [
    "trample",
    "lifelink",
    "deathtouch",
    "haste",
    "shroud",
    "hexproof",
  ] as const)
    for (const card of available
      .filter((row) => row.types.includes("Creature") && row.keywords.includes(keyword))
      .slice(0, 2))
      add(card);
  for (const card of available.filter(
    (row) =>
      row.types.includes("Creature") && (row.power ?? 0) > 0 && !row.keywords.includes("defender"),
  ))
    add(card);
  if (selected.length !== 60)
    throw new Error(`Insufficient legal evasion fixture fillers: ${commander.name}`);
  for (const card of [...assigned, ...support])
    if (!ids.has(card.id)) throw new Error(`Required evasion fixture card omitted: ${card.name}`);
  return selected;
}
async function supplement(
  source: ContentRelease,
  commander: CardDefinition,
  assigned: CardDefinition[],
  support: readonly string[],
) {
  const cards = selectedCards(source, commander, assigned, support);
  const basics = commander.colorIdentity.map((color) => named(source, basicNames[color]));
  if (
    !basics.length ||
    basics.some((card) => !card.supertypes.includes("Basic") || !card.types.includes("Land"))
  )
    throw new Error("Missing ordinary evasion fixture basic lands");
  const entries = [
    { definition: commander.id, count: 1 },
    ...cards.map((card) => ({ definition: card.id, count: 1 })),
    ...basics.map((card, index) => ({
      definition: card.id,
      count: Math.floor(39 / basics.length) + (index < 39 % basics.length ? 1 : 0),
    })),
  ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
  const body = {
    id: `development:static-evasion:${commander.oracleId}:${source.hash.slice(0, 16)}`,
    commander: commander.id,
    entries,
  };
  const deck = DeckRevision.parse({ ...body, hash: await semanticHash(body) });
  validate(deck, source);
  return deck;
}
/** Preserve prior deck revisions exactly; append six legal profiles without inventing missing commander colors. */
export async function makeStaticEvasionDecks(
  sourceInput: ContentRelease,
  frozenInputs: readonly DeckRevision[],
) {
  const source = await verifySourceRelease(sourceInput),
    frozen = await frozenRevisions(frozenInputs, source);
  const cards = STATIC_EVASION_PERMANENTS.map((row) => {
    const card = source.definitions[`oracle:${row.identity}`];
    if (!card || !reviewedStaticEvasionDefinition(card))
      throw new Error(`Missing authenticated evasion source: ${row.name}`);
    return card;
  }).sort(ordered);
  const commanders = Object.values(source.definitions)
    .filter((card) => card.commanderEligible)
    .sort(ordered);
  const chosen = profiles.map((profile) => named(source, profile.commander));
  if (chosen.some((card) => !card.commanderEligible))
    throw new Error("Ineligible evasion fixture commander");
  const groups = assign(cards, chosen),
    supplements: DeckRevision[] = [];
  for (const [index, profile] of profiles.entries()) {
    const commander = chosen[index],
      assigned = groups[index];
    if (!commander || !assigned) throw new Error("Missing evasion fixture assignment");
    supplements.push(await supplement(source, commander, assigned, profile.support));
  }
  const decks = [...frozen, ...supplements];
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length)
    throw new Error("Evasion fixture identity collision");
  const coverage = cards.map((card) => {
    const included = supplements.filter((deck) =>
      deck.entries.some((row) => row.definition === card.id),
    );
    const compatibleCommanders = commanders.filter((commander) => compatible(card, commander));
    if (!included.length && compatibleCommanders.length)
      throw new Error(
        `Evasion source omitted despite a compatible admitted commander: ${card.name}`,
      );
    return {
      definition: card.id,
      name: card.name,
      sourceVersion: card.sourceVersion,
      colorIdentity: card.colorIdentity,
      compatibleCommanderIds: compatibleCommanders.map((row) => row.id),
      supplementalDeckHashes: included.map((row) => row.hash),
      keywords: card.keywords,
      blockingRestrictions: card.blockingRestrictions ?? [],
    };
  });
  const excluded = coverage
    .filter((row) => !row.supplementalDeckHashes.length)
    .map((row) => ({
      ...row,
      reason: "No admitted commander contains this card's complete color identity",
    }));
  const covered = coverage.filter((row) => row.supplementalDeckHashes.length > 0);
  const report = {
    schema: "static-evasion-decks/1",
    sourceReleaseHash: source.hash,
    sourceBundle: source.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    candidateBindings: cards.length,
    coveredBindings: covered.length,
    coveredDefinitionIds: covered.map((row) => row.definition),
    commanderInventory: commanders.map((card) => ({
      definition: card.id,
      name: card.name,
      colorIdentity: card.colorIdentity,
    })),
    coverage,
    excluded,
    profiles: supplements.map((deck, index) => ({
      deckHash: deck.hash,
      commander: deck.commander,
      sourceProgramDefinitionIds: deck.entries
        .filter(
          (entry) =>
            source.definitions[entry.definition]?.implementationRevision ===
            "static-evasion-permanent/1",
        )
        .map((entry) => entry.definition),
      supportDefinitionIds: (profiles[index]?.support ?? []).map((name) => named(source, name).id),
    })),
    executedGames: 0,
    scope:
      "Legal fixture composition only. All admitted commanders are checked against every complete source color identity. Attacker/blocker restrictions, artifact and color exceptions, defending land types, signed-power comparisons and accepted-block lifetime interactions require separate execution. Uncovered color identities receive no legality waiver or execution claim.",
  };
  return { decks, report: { ...report, hash: await semanticHash(report) } };
}
