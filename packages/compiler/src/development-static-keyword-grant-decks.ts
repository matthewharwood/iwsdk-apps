import {
  reviewedStaticKeywordGrantDefinition,
  STATIC_KEYWORD_GRANTS,
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
    code: "hivelord-grant-universe",
    commander: "Sliver Hivelord",
    selection: "all-grants",
    support: ["Murder", "Repulse", "Giant Growth", "Darksteel Sentinel", "Memnite", "Divination"],
  },
  {
    code: "hivelord-prior-color-gaps",
    commander: "Sliver Hivelord",
    selection: "prior-gaps",
    support: [
      "Murder",
      "Repulse",
      "Giant Growth",
      "Darksteel Sentinel",
      "Memnite",
      "Divination",
      "Raise the Alarm",
      "Sorin's Thirst",
      "Queen's Commission",
      "Flame Slash",
    ],
  },
  {
    code: "tobias-artifact-evasion",
    commander: "Tobias Andrion",
    selection: "compatible-grants",
    support: ["Memnite", "Darksteel Sentinel", "Repulse", "Counterspell", "Raise the Alarm"],
  },
  {
    code: "lady-orca-strike-lifelink",
    commander: "Lady Orca",
    selection: "compatible-grants",
    support: ["Memnite", "Darksteel Sentinel", "Sorin's Thirst", "Murder", "Flame Slash"],
  },
  {
    code: "jasmine-vigilance-trample",
    commander: "Jasmine Boreal",
    selection: "compatible-grants",
    support: [
      "Memnite",
      "Darksteel Sentinel",
      "Giant Growth",
      "Queen's Commission",
      "Raise the Alarm",
    ],
  },
] as const;
function named(source: ContentRelease, name: string): CardDefinition {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing static-keyword-grant fixture source: ${name}`);
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
    throw new Error(`Invalid static-keyword-grant fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = source.definitions[entry.definition];
    if (!card || !compatible(card, commander))
      throw new Error(
        `Missing or incompatible static-keyword-grant fixture card: ${entry.definition}`,
      );
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Static keyword grant fixture copy limit: ${card.name}`);
  }
}
async function frozenRevisions(inputs: readonly DeckRevision[], source: ContentRelease) {
  const result: DeckRevision[] = [];
  for (const input of inputs) {
    const deck = DeckRevision.parse(input),
      { hash, ...body } = deck;
    if ((await semanticHash(body)) !== hash)
      throw new Error(`Frozen static-keyword-grant fixture hash mismatch: ${deck.id}`);
    validate(deck, source);
    result.push(deck);
  }
  if (!result.length || new Set(result.map((deck) => deck.id)).size !== result.length)
    throw new Error("Missing or duplicate frozen static-keyword-grant fixture identity");
  return result;
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
        compatible(card, commander) &&
        card.implementationRevision !== "static-keyword-grant-permanent/1",
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
    throw new Error(`Insufficient legal static-keyword-grant fixture fillers: ${commander.name}`);
  for (const card of [...assigned, ...support])
    if (!ids.has(card.id))
      throw new Error(`Required static-keyword-grant fixture card omitted: ${card.name}`);
  return selected;
}
async function supplement(
  source: ContentRelease,
  commander: CardDefinition,
  assigned: CardDefinition[],
  support: readonly string[],
  code: string,
) {
  const cards = selectedCards(source, commander, assigned, support);
  const basics = commander.colorIdentity.map((color) => named(source, basicNames[color]));
  if (
    !basics.length ||
    basics.some((card) => !card.supertypes.includes("Basic") || !card.types.includes("Land"))
  )
    throw new Error("Missing ordinary static-keyword-grant fixture basic lands");
  const entries = [
    { definition: commander.id, count: 1 },
    ...cards.map((card) => ({ definition: card.id, count: 1 })),
    ...basics.map((card, index) => ({
      definition: card.id,
      count: Math.floor(39 / basics.length) + (index < 39 % basics.length ? 1 : 0),
    })),
  ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
  const body = {
    id: `development:static-keyword-grant:${code}:${source.hash.slice(0, 16)}`,
    commander: commander.id,
    entries,
  };
  const deck = DeckRevision.parse({ ...body, hash: await semanticHash(body) });
  validate(deck, source);
  return deck;
}
/** Preserve prior deck revisions exactly; append five legal source and interaction profiles. */
export async function makeStaticKeywordGrantDecks(
  sourceInput: ContentRelease,
  frozenInputs: readonly DeckRevision[],
) {
  const source = await verifySourceRelease(sourceInput),
    frozen = await frozenRevisions(frozenInputs, source);
  const cards = STATIC_KEYWORD_GRANTS.map((row) => {
    const card = source.definitions[`oracle:${row.identity}`];
    if (!card || !reviewedStaticKeywordGrantDefinition(card))
      throw new Error(`Missing authenticated static-keyword-grant source: ${row.name}`);
    return card;
  }).sort(ordered);
  const commanders = Object.values(source.definitions)
    .filter((card) => card.commanderEligible)
    .sort(ordered);
  const chosen = profiles.map((profile) => named(source, profile.commander));
  if (chosen.some((card) => !card.commanderEligible))
    throw new Error("Ineligible static-keyword-grant fixture commander");
  const priorCommanders = commanders.filter(
    (card) => card.implementationRevision !== "static-keyword-grant-permanent/1",
  );
  if (!priorCommanders.length) throw new Error("Missing prior commander inventory");
  const priorColorGaps = Object.values(source.definitions)
    .filter(
      (card) =>
        card.implementationRevision !== "static-keyword-grant-permanent/1" &&
        !priorCommanders.some((commander) => compatible(card, commander)),
    )
    .sort(ordered);
  const supplements: DeckRevision[] = [];
  for (const [index, profile] of profiles.entries()) {
    const commander = chosen[index];
    if (!commander) throw new Error("Missing grant fixture commander");
    const compatibleGrants = cards.filter((card) => compatible(card, commander));
    const assigned =
      profile.selection === "prior-gaps"
        ? [
            ...priorColorGaps,
            ...compatibleGrants
              .filter((card) => card.id !== commander.id)
              .sort(affordable)
              .slice(0, 14),
          ]
        : compatibleGrants;
    supplements.push(await supplement(source, commander, assigned, profile.support, profile.code));
  }
  const decks = [...frozen, ...supplements];
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length)
    throw new Error("Static keyword grant fixture identity collision");
  const coverage = cards.map((card) => {
    const included = supplements.filter((deck) =>
      deck.entries.some((row) => row.definition === card.id),
    );
    const compatibleCommanders = commanders.filter((commander) => compatible(card, commander));
    if (!included.length && compatibleCommanders.length)
      throw new Error(
        `Static keyword grant source omitted despite a compatible admitted commander: ${card.name}`,
      );
    return {
      definition: card.id,
      name: card.name,
      sourceVersion: card.sourceVersion,
      colorIdentity: card.colorIdentity,
      compatibleCommanderIds: compatibleCommanders.map((row) => row.id),
      supplementalDeckHashes: included.map((row) => row.hash),
      keywords: card.keywords,
      staticKeywordPrograms: card.staticKeywordPrograms,
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
    schema: "static-keyword-grant-decks/1",
    sourceReleaseHash: source.hash,
    sourceBundle: source.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    sourceDefinitionCount: Object.keys(source.definitions).length,
    priorCommanderCount: priorCommanders.length,
    newlyCoveredPriorColorGaps: priorColorGaps.map((card) => ({
      definition: card.id,
      name: card.name,
      sourceVersion: card.sourceVersion,
      colorIdentity: card.colorIdentity,
      supplementalDeckHashes: supplements
        .filter((deck) => deck.entries.some((entry) => entry.definition === card.id))
        .map((deck) => deck.hash),
    })),
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
      profile: profiles[index]?.code,
      deckHash: deck.hash,
      commander: deck.commander,
      sourceProgramDefinitionIds: deck.entries
        .filter(
          (entry) =>
            source.definitions[entry.definition]?.implementationRevision ===
            "static-keyword-grant-permanent/1",
        )
        .map((entry) => entry.definition),
      supportDefinitionIds: (profiles[index]?.support ?? []).map((name) => named(source, name).id),
    })),
    executedGames: 0,
    scope:
      "Legal fixture composition only. One full five-color commander profile includes all55 complete source grant programs; a separate profile includes every prior bound identity whose full color identity lacked a prior commander in the supplied authenticated source. All source bytes, 100-card singleton rules and 39 basics remain explicit. Layer6, combat, target, activation and lifetime interactions require separate execution. No game completion or source-card execution follows from deck availability.",
  };
  return { decks, report: { ...report, hash: await semanticHash(report) } };
}
