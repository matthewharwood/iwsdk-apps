import {
  KEYWORD_REMINDER_RECIPE_VERSION,
  reviewedKeywordReminderDefinition,
} from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  type ContentRelease,
  DeckRevision,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { verifySourceRelease } from "./prepared";

const ordered = (a: CardDefinition, b: CardDefinition) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const compatible = (card: CardDefinition, commander: CardDefinition) =>
  card.colorIdentity.every((color) => commander.colorIdentity.includes(color));

/** Composition validation, not semantic implementation or completed-game evidence. */
function validateComposition(deck: DeckRevision, release: ContentRelease): void {
  const commander = release.definitions[deck.commander];
  if (
    !commander?.commanderEligible ||
    deck.entries.reduce((sum, row) => sum + row.count, 0) !== 100 ||
    deck.entries.find((row) => row.definition === deck.commander)?.count !== 1 ||
    new Set(deck.entries.map((row) => row.definition)).size !== deck.entries.length
  )
    throw Error(`Invalid Commander composition: ${deck.id}`);
  const names = new Map<string, number>();
  for (const entry of deck.entries) {
    const definition = release.definitions[entry.definition];
    if (!definition || !compatible(definition, commander))
      throw Error(`Missing or incompatible deck definition: ${entry.definition}`);
    const count = (names.get(definition.name) ?? 0) + entry.count;
    names.set(definition.name, count);
    if (definition.deckLimit !== null && count > definition.deckLimit)
      throw Error(`Copy limit exceeded: ${definition.name}`);
  }
}

function supplementalCards(
  release: ContentRelease,
  commander: CardDefinition,
  annotations: CardDefinition[],
): CardDefinition[] {
  const definitions = Object.values(release.definitions);
  const spells = definitions
    .filter((card) => card.spellProgram && compatible(card, commander))
    .sort(ordered)
    .slice(0, 6);
  const excluded = new Set([
    commander.id,
    ...annotations.map((card) => card.id),
    ...spells.map((card) => card.id),
  ]);
  const creatures = definitions
    .filter(
      (card) =>
        !excluded.has(card.id) &&
        card.implementationRevision !== KEYWORD_REMINDER_RECIPE_VERSION &&
        card.types.includes("Creature") &&
        !card.triggerPrograms &&
        (card.power ?? 0) > 0 &&
        !card.keywords.includes("defender") &&
        compatible(card, commander),
    )
    .sort((a, b) => a.manaValue - b.manaValue || ordered(a, b));
  const result = [
    ...annotations,
    ...spells,
    ...creatures.slice(0, 60 - annotations.length - spells.length),
  ];
  if (result.length !== 60) throw Error(`Insufficient source-backed filler for ${commander.name}`);
  return result;
}

async function makeSupplement(
  release: ContentRelease,
  commander: CardDefinition,
  annotations: CardDefinition[],
  ordinal: number,
): Promise<DeckRevision> {
  const selected = supplementalCards(release, commander, annotations);
  const lands = commander.colorIdentity.map((color) =>
    Object.values(release.definitions).find(
      (card) =>
        card.types.includes("Land") &&
        card.supertypes.includes("Basic") &&
        card.manaAbilities.length === 1 &&
        card.manaAbilities[0] === color,
    ),
  );
  if (lands.length === 0 || lands.some((land) => !land))
    throw Error(`Missing ordinary basic lands: ${commander.name}`);
  const entries = [
    { definition: commander.id, count: 1 },
    ...selected.map((card) => ({ definition: card.id, count: 1 })),
    ...lands.map((land, index) => ({
      definition: (land as CardDefinition).id,
      count: Math.floor(39 / lands.length) + (index < 39 % lands.length ? 1 : 0),
    })),
  ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
  const body = {
    id: `development:keyword-reminders:${commander.oracleId}:${ordinal}:${release.hash.slice(0, 16)}`,
    commander: commander.id,
    entries,
  };
  const deck = DeckRevision.parse({ ...body, hash: await semanticHash(body) });
  validateComposition(deck, release);
  return deck;
}

/** Preserve supplied frozen revisions exactly, then append explicit reminder fixtures. No unavailable color identity is silently dropped. */
export async function makeKeywordReminderDecks(
  releaseInput: ContentRelease,
  frozenDeckInputs: readonly DeckRevision[],
) {
  const release = await verifySourceRelease(releaseInput);
  const priorDecks: DeckRevision[] = [];
  for (const input of frozenDeckInputs) {
    const deck = DeckRevision.parse(input);
    const { hash, ...body } = deck;
    if ((await semanticHash(body)) !== hash) throw Error(`Frozen deck hash mismatch: ${deck.id}`);
    validateComposition(deck, release);
    priorDecks.push(structuredClone(deck));
  }
  if (priorDecks.length === 0) throw Error("At least one frozen Commander fixture is required");
  const commanders = [...new Set(priorDecks.map((deck) => deck.commander))].map(
    (id) => release.definitions[id] as CardDefinition,
  );
  const annotations = Object.values(release.definitions)
    .filter((card) => card.implementationRevision === KEYWORD_REMINDER_RECIPE_VERSION)
    .sort(ordered);
  const assignments = new Map<string, CardDefinition[]>();
  const excluded: { identity: string; name: string; colorIdentity: string[]; reason: string }[] =
    [];
  for (const card of annotations) {
    if (!reviewedKeywordReminderDefinition(card))
      throw Error(`Unreviewed reminder definition: ${card.name}`);
    const commander = commanders.find((candidate) => compatible(card, candidate));
    if (!commander) {
      const exists = Object.values(release.definitions).some(
        (candidate) => candidate.commanderEligible && compatible(card, candidate),
      );
      excluded.push({
        identity: card.id,
        name: card.name,
        colorIdentity: card.colorIdentity,
        reason: exists
          ? "no-compatible-commander-in-supplied-frozen-fixtures"
          : "no-compatible-implemented-commander-in-release",
      });
      continue;
    }
    const rows = assignments.get(commander.id) ?? [];
    rows.push(card);
    assignments.set(commander.id, rows);
  }
  const supplemental: DeckRevision[] = [];
  for (const commander of commanders) {
    const cards = assignments.get(commander.id) ?? [];
    for (let offset = 0; offset < cards.length; offset += 48)
      supplemental.push(
        await makeSupplement(release, commander, cards.slice(offset, offset + 48), offset / 48),
      );
  }
  const covered = [
    ...new Set(supplemental.flatMap((deck) => deck.entries.map((row) => row.definition))),
  ]
    .filter(
      (id) => release.definitions[id]?.implementationRevision === KEYWORD_REMINDER_RECIPE_VERSION,
    )
    .sort();
  if (covered.length + excluded.length !== annotations.length)
    throw Error("Reminder fixture denominator mismatch");
  const report = {
    schema: "keyword-reminder-decks/1",
    releaseHash: release.hash,
    sourceBundle: release.sourceBundle,
    priorDeckHashes: priorDecks.map((deck) => deck.hash),
    supplementalDeckHashes: supplemental.map((deck) => deck.hash),
    candidateBindings: annotations.length,
    coveredBindings: covered.length,
    coveredDefinitionIds: covered,
    excluded,
    executedGames: 0,
    fullCandidateCoverage: false,
  };
  return {
    decks: [...priorDecks, ...supplemental],
    report: { ...report, hash: await semanticHash(report) },
  };
}
