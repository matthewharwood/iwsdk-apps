import { ATTACHMENT_PERMANENTS, reviewedAttachmentDefinition } from "@iwsdk-apps/card-programs";
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
    code: "hivelord-enchant-and-equip",
    commander: "Sliver Hivelord",
    support: ["Murder", "Repulse", "Counterspell", "Giant Growth", "Raise the Alarm", "Memnite"],
  },
  {
    code: "tobias-aura-response",
    commander: "Tobias Andrion",
    support: [
      "Repulse",
      "Counterspell",
      "Raise the Alarm",
      "Queen's Commission",
      "Memnite",
      "Darksteel Sentinel",
    ],
  },
  {
    code: "lady-orca-hostile-auras",
    commander: "Lady Orca",
    support: [
      "Sorin's Thirst",
      "Murder",
      "Flame Slash",
      "Memnite",
      "Darksteel Sentinel",
      "Final Reward",
    ],
  },
  {
    code: "jasmine-recipient-combat",
    commander: "Jasmine Boreal",
    support: [
      "Giant Growth",
      "Raise the Alarm",
      "Queen's Commission",
      "Memnite",
      "Darksteel Sentinel",
      "Elvish Visionary",
    ],
  },
  {
    code: "hivelord-equipment-lifetime",
    commander: "Sliver Hivelord",
    support: ["Murder", "Repulse", "Counterspell", "Giant Growth", "Call to the Feast", "Memnite"],
  },
  {
    code: "tobias-flash-and-shroud",
    commander: "Tobias Andrion",
    support: [
      "Repulse",
      "Counterspell",
      "Raise the Alarm",
      "Queen's Commission",
      "Memnite",
      "Darksteel Sentinel",
    ],
  },
] as const;
function named(source: ContentRelease, name: string): CardDefinition {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing attachment fixture source: ${name}`);
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
    throw new Error(`Invalid attachment fixture composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const card = source.definitions[entry.definition];
    if (!card || !compatible(card, commander))
      throw new Error(`Missing or incompatible attachment fixture card: ${entry.definition}`);
    const count = (names.get(card.name) ?? 0) + entry.count;
    names.set(card.name, count);
    if (card.deckLimit !== null && count > card.deckLimit)
      throw new Error(`Attachment fixture copy limit: ${card.name}`);
  }
}
async function frozenRevisions(inputs: readonly DeckRevision[], source: ContentRelease) {
  const result: DeckRevision[] = [];
  for (const input of inputs) {
    const deck = DeckRevision.parse(input),
      { hash, ...body } = deck;
    if ((await semanticHash(body)) !== hash)
      throw new Error(`Frozen attachment fixture hash mismatch: ${deck.id}`);
    validate(deck, source);
    result.push(deck);
  }
  if (!result.length || new Set(result.map((deck) => deck.id)).size !== result.length)
    throw new Error("Missing or duplicate frozen attachment fixture identity");
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
        compatible(card, commander) && card.implementationRevision !== "attachment-permanent/1",
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
    throw new Error(`Insufficient legal attachment fixture fillers: ${commander.name}`);
  for (const card of [...assigned, ...support])
    if (!ids.has(card.id))
      throw new Error(`Required attachment fixture card omitted: ${card.name}`);
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
    throw new Error("Missing ordinary attachment fixture basic lands");
  const entries = [
    { definition: commander.id, count: 1 },
    ...cards.map((card) => ({ definition: card.id, count: 1 })),
    ...basics.map((card, index) => ({
      definition: card.id,
      count: Math.floor(39 / basics.length) + (index < 39 % basics.length ? 1 : 0),
    })),
  ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
  const body = {
    id: `development:attachment:${code}:${source.hash.slice(0, 16)}`,
    commander: commander.id,
    entries,
  };
  const deck = DeckRevision.parse({ ...body, hash: await semanticHash(body) });
  validate(deck, source);
  return deck;
}
/** Preserve prior revisions; partition all exact attachments across six playable legal profiles. */
function assignments(cards: CardDefinition[], commanders: CardDefinition[]) {
  const result: CardDefinition[][] = commanders.map(() => []);
  const eligible = (card: CardDefinition) =>
    commanders.flatMap((commander, index) => (compatible(card, commander) ? [index] : []));
  const constrained = [...cards].sort(
    (a, b) => eligible(a).length - eligible(b).length || ordered(a, b),
  );
  for (const card of constrained) {
    const choices = eligible(card).filter((index) => (result[index]?.length ?? 30) < 30);
    choices.sort((a, b) => {
      const left = result[a] ?? [],
        right = result[b] ?? [];
      return (
        left.length - right.length ||
        left.filter((row) => row.attachmentProgram?.schema === card.attachmentProgram?.schema)
          .length -
          right.filter((row) => row.attachmentProgram?.schema === card.attachmentProgram?.schema)
            .length ||
        a - b
      );
    });
    const destination = choices[0];
    if (destination === undefined)
      throw new Error(`No legal attachment fixture slot: ${card.name}`);
    result[destination]?.push(card);
  }
  return result;
}
export async function makeAttachmentDecks(
  sourceInput: ContentRelease,
  frozenInputs: readonly DeckRevision[],
) {
  const source = await verifySourceRelease(sourceInput),
    frozen = await frozenRevisions(frozenInputs, source);
  const cards = ATTACHMENT_PERMANENTS.map((row) => {
    const card = source.definitions[`oracle:${row.identity}`];
    if (!card || !reviewedAttachmentDefinition(card))
      throw new Error(`Missing authenticated attachment source: ${row.name}`);
    return card;
  }).sort(ordered);
  const commanders = Object.values(source.definitions)
    .filter((card) => card.commanderEligible)
    .sort(ordered);
  const chosen = profiles.map((profile) => named(source, profile.commander));
  if (chosen.some((card) => !card.commanderEligible))
    throw new Error("Ineligible attachment fixture commander");
  const assigned = assignments(cards, chosen);
  const supplements: DeckRevision[] = [];
  for (const [index, profile] of profiles.entries()) {
    const commander = chosen[index];
    if (!commander) throw new Error("Missing grant fixture commander");
    supplements.push(
      await supplement(source, commander, assigned[index] ?? [], profile.support, profile.code),
    );
  }
  const decks = [...frozen, ...supplements];
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length)
    throw new Error("Attachment fixture identity collision");
  const coverage = cards.map((card) => {
    const included = supplements.filter((deck) =>
      deck.entries.some((row) => row.definition === card.id),
    );
    const compatibleCommanders = commanders.filter((commander) => compatible(card, commander));
    if (!included.length && compatibleCommanders.length)
      throw new Error(
        `Attachment source omitted despite a compatible admitted commander: ${card.name}`,
      );
    return {
      definition: card.id,
      name: card.name,
      sourceVersion: card.sourceVersion,
      colorIdentity: card.colorIdentity,
      compatibleCommanderIds: compatibleCommanders.map((row) => row.id),
      supplementalDeckHashes: included.map((row) => row.hash),
      keywords: card.keywords,
      attachmentProgram: card.attachmentProgram,
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
    schema: "attachment-decks/1",
    sourceReleaseHash: source.hash,
    sourceBundle: source.sourceBundle,
    priorDeckHashes: frozen.map((deck) => deck.hash),
    supplementalDeckHashes: supplements.map((deck) => deck.hash),
    sourceDefinitionCount: Object.keys(source.definitions).length,
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
            "attachment-permanent/1",
        )
        .map((entry) => entry.definition),
      supportDefinitionIds: (profiles[index]?.support ?? []).map((name) => named(source, name).id),
    })),
    executedGames: 0,
    scope:
      "Legal fixture composition only. All151 complete attachment definitions are partitioned across six source-backed100-card singleton profiles with39 basics, at most30 new attachments and actual creatures/token/removal/response support. Prior revisions are preserved exactly. Deck availability does not establish attachment resolution, equip, combat, persistence or completed-game execution.",
  };
  return { decks, report: { ...report, hash: await semanticHash(report) } };
}
