import {
  type DeckRevision,
  type ExecutionRegistry,
  emptyMana,
  MatchManifest,
  type Response,
  type RulesState,
  SpellProgram,
} from "@iwsdk-apps/contracts";
import {
  assertRegistryPin,
  definition,
  draw,
  emit,
  emptyCombat,
  hit,
  move,
  player,
  RulesError,
  randomBelow,
  request,
  requireActivePlayer,
  requireRule,
  shuffleLibrary,
} from "./common";

import {
  isAttachmentPermanent,
  isDamageProgramPermanent,
  isEntryObserverPermanent,
  isOrdinaryActivatedPermanent,
  isReviewedTriggeredPermanent,
  isStaticBonusPermanent,
  isStaticKeywordGrantPermanent,
} from "./permanent-programs";

export function admitDeck(
  deck: DeckRevision,
  release: Pick<ExecutionRegistry, "definitions">,
): void {
  const commander = definition(release, deck.commander);
  requireRule(
    commander.commanderEligible,
    "The chosen card is not eligible as commander in this profile.",
  );
  requireRule(
    deck.entries.reduce((sum, entry) => sum + entry.count, 0) === 100,
    "A Commander deck must contain exactly 100 cards including the commander.",
  );
  requireRule(
    new Set(deck.entries.map((entry) => entry.definition)).size === deck.entries.length,
    "Duplicate deck entry rows",
  );
  requireRule(
    deck.entries.find((entry) => entry.definition === deck.commander)?.count === 1,
    "The commander must appear exactly once.",
  );
  const nameCounts = new Map<string, number>();
  for (const entry of deck.entries) {
    const current = definition(release, entry.definition);
    if (current.triggerPrograms && !isReviewedTriggeredPermanent(current))
      throw new RulesError(
        "UnsupportedMechanic",
        "Only reviewed mandatory self-entry creatures and entry-observer permanents are admitted",
      );
    requireRule(
      current.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
      `Card outside commander color identity: ${current.name}`,
    );
    const count = (nameCounts.get(current.name) ?? 0) + entry.count;
    nameCounts.set(current.name, count);
    requireRule(
      current.deckLimit === null || count <= current.deckLimit,
      `Deck copy limit exceeded: ${current.name}`,
    );
    const attachmentPermanent = isAttachmentPermanent(current);
    if (current.attachmentProgram && !attachmentPermanent)
      throw new RulesError("UnsupportedMechanic", "Unsupported attachment permanent program");
    const activatedPermanent = isOrdinaryActivatedPermanent(current);
    if (current.activatedPrograms && !activatedPermanent)
      throw new RulesError(
        "UnsupportedMechanic",
        `Activated permanent program is not implemented: ${current.name}.`,
      );
    const damagePermanent = isDamageProgramPermanent(current);
    if (current.damagePrograms && !damagePermanent)
      throw new RulesError(
        "UnsupportedMechanic",
        `Damage permanent program is not implemented: ${current.name}.`,
      );
    const keywordPermanent = isStaticKeywordGrantPermanent(current);
    if (current.staticKeywordPrograms && !keywordPermanent)
      throw new RulesError(
        "UnsupportedMechanic",
        `Static keyword grant is not implemented: ${current.name}.`,
      );
    const staticPermanent = isStaticBonusPermanent(current);
    if (current.staticPrograms && !staticPermanent)
      throw new RulesError(
        "UnsupportedMechanic",
        `Static permanent program is not implemented: ${current.name}.`,
      );
    const programmedSpell =
      current.types.length === 1 &&
      (current.types.includes("Instant") || current.types.includes("Sorcery")) &&
      SpellProgram.safeParse(current.spellProgram).success;
    if (current.spellProgram && !programmedSpell)
      throw new RulesError(
        "UnsupportedMechanic",
        `Spell programs require an implemented instant or sorcery: ${current.name}.`,
      );
    if (
      !current.types.includes("Land") &&
      !current.types.includes("Creature") &&
      !programmedSpell &&
      !staticPermanent &&
      !keywordPermanent &&
      !damagePermanent &&
      !activatedPermanent &&
      !attachmentPermanent &&
      !isEntryObserverPermanent(current)
    )
      throw new RulesError(
        "UnsupportedMechanic",
        `This development executor does not yet implement ${current.name}.`,
      );
  }
}

export function createMatch(input: unknown, release: ExecutionRegistry): RulesState {
  const manifest = MatchManifest.parse(input);
  assertRegistryPin(manifest, release);
  requireRule(
    manifest.seats.length === (manifest.mode === "two-seat" ? 2 : 4),
    "Seat-mode mismatch",
  );
  requireRule(
    new Set(manifest.seats.map((seat) => seat.id)).size === manifest.seats.length,
    "Seat IDs must be unique",
  );
  for (const seat of manifest.seats) admitDeck(seat.deck, release);
  const first = manifest.seats[0];
  if (!first) throw new RulesError("Invariant", "No starting seat");
  const state: RulesState = {
    schema: "commander-state/1",
    manifest,
    revision: 0,
    epoch: 0,
    eventSequence: 0,
    setupChoices: {},
    turn: 0,
    startingPlayerChooser: first.id,
    startingPlayer: null,
    activePlayer: null,
    priorityPlayer: null,
    step: "setup",
    consecutivePasses: 0,
    cleanupPriority: false,
    players: manifest.seats.map((seat) => ({
      id: seat.id,
      life: 40,
      poison: 0,
      lost: false,
      lossReason: null,
      library: [],
      hand: [],
      graveyard: [],
      mana: emptyMana(),
      landsPlayed: 0,
      commanderCasts: {},
      commanderDamage: {},
      drawnFromEmptyLibrary: false,
      mulligans: 0,
      keptHand: false,
      lastTurnStarted: 0,
    })),
    objects: {},
    stack: [],
    abilities: {},
    continuousEffects: [],
    pendingTriggers: [],
    triggerPlacement: null,
    chanceState: manifest.gameSeed,
    chanceOperations: 0,
    combat: emptyCombat(),
    frames: [],
    decision: null,
    events: [],
    outcome: { kind: "ongoing" },
    coverage: {},
  };
  state.startingPlayerChooser =
    manifest.seats[randomBelow(state, manifest.seats.length)]?.id ?? first.id;
  emit(state, "StartingPlayerChooserDetermined", { player: state.startingPlayerChooser });
  request(state, "starting-player", state.startingPlayerChooser, {
    players: state.players.map((seat) => seat.id),
    count: 1,
    context: "Choose the player who will take the first turn, before any hands are dealt.",
  });
  return state;
}

export function chooseStartingPlayer(state: RulesState, actor: string, response: Response): void {
  requireRule(response.kind === "starting-player", "Expected a starting-player selection");
  requireRule(
    state.startingPlayer === null &&
      state.startingPlayerChooser === actor &&
      state.step === "setup",
    "Only the setup chooser may select the starting player.",
  );
  requireRule(
    state.players.some((seat) => seat.id === response.player && !seat.lost),
    "Choose a seat in this match.",
  );
  state.startingPlayer = response.player;
  state.activePlayer = response.player;
  emit(state, "StartingPlayerChosen", { chooser: actor, startingPlayer: response.player });
  hit(state, "rule:103.1");
  for (const seat of state.manifest.seats) {
    let ordinal = 0;
    for (const entry of seat.deck.entries)
      for (let copy = 0; copy < entry.count; copy++) {
        const lineage = `${seat.id}:card:${ordinal++}`;
        const id = `${lineage}@0`;
        const commander = entry.definition === seat.deck.commander;
        state.objects[id] = {
          id,
          lineage,
          generation: 0,
          definition: entry.definition,
          owner: seat.id,
          controller: seat.id,
          zone: commander ? "command" : "library",
          tapped: false,
          controlledSinceTurn: 0,
          damage: 0,
          deathtouchDamage: false,
          counters: {},
          commander,
          commanderMoveOffered: false,
        };
        if (!commander) player(state, seat.id).library.push(id);
        else emit(state, "CommanderPlaced", { player: seat.id, object: id });
      }
  }
  for (const seat of state.manifest.seats) shuffleLibrary(state, seat.id);
  for (const seat of state.manifest.seats) draw(state, seat.id, 7);
  hit(state, "rule:103.2c");
  hit(state, "rule:103.3");
  hit(state, "rule:903.6");
  emit(state, "MatchStarted", {
    mode: state.manifest.mode,
    startingPlayer: state.activePlayer,
    life: 40,
  });
  hit(state, "rule:903.7");
  request(state, "mulligan", requireActivePlayer(state), {
    context: "Keep seven or take a London mulligan.",
  });
}

function orderedSeats(state: RulesState): string[] {
  const start = state.players.findIndex((seat) => seat.id === requireActivePlayer(state));
  return [...state.players.slice(start), ...state.players.slice(0, start)].map((seat) => seat.id);
}
export function bottomCount(state: RulesState, actor: string): number {
  return Math.max(
    0,
    player(state, actor).mulligans - (state.manifest.mode === "four-seat" ? 1 : 0),
  );
}
/** Collect each round's declarations before any player redraws. */
export function mulligan(state: RulesState, actor: string, response: Response): boolean {
  requireRule(response.kind === "mulligan", "Expected a mulligan declaration");
  requireRule(
    response.keep || bottomCount(state, actor) < 7,
    "A player must keep a zero-card hand.",
  );
  state.setupChoices[actor] = response.keep;
  const pending = orderedSeats(state).find(
    (id) => !player(state, id).keptHand && state.setupChoices[id] === undefined,
  );
  if (pending) {
    request(state, "mulligan", pending);
    return false;
  }
  for (const id of orderedSeats(state)) {
    const current = player(state, id);
    if (current.keptHand) continue;
    if (state.setupChoices[id]) current.keptHand = true;
    else {
      for (const held of [...current.hand]) move(state, held, "library", "mulligan");
      current.mulligans++;
      shuffleLibrary(state, id);
      draw(state, id, 7);
    }
  }
  state.setupChoices = {};
  // CR 103.5: a mulligan includes bottoming after the redraw, before the
  // next declaration round. Keeping is not the trigger for this choice.
  return nextBottom(state);
}
function nextBottom(state: RulesState): boolean {
  const pending = orderedSeats(state).find(
    (id) => player(state, id).hand.length > 7 - bottomCount(state, id),
  );
  if (!pending) {
    state.setupChoices = {};
    const next = orderedSeats(state).find((id) => !player(state, id).keptHand);
    if (!next) return true;
    request(state, "mulligan", next, {
      context: "Keep your remaining hand or take another London mulligan.",
    });
    return false;
  }
  request(state, "bottom", pending, {
    count: bottomCount(state, pending),
    cards: [...player(state, pending).hand],
    context: "Choose cards to put on the bottom, in order.",
  });
  return false;
}
export function bottom(state: RulesState, actor: string, response: Response): boolean {
  requireRule(response.kind === "bottom", "Expected bottom-of-library choices");
  requireRule(
    response.cards.length === bottomCount(state, actor),
    "Incorrect mulligan bottom count",
  );
  requireRule(new Set(response.cards).size === response.cards.length, "Repeated bottom card");
  requireRule(
    response.cards.every((id) => player(state, actor).hand.includes(id)),
    "Bottom choices must be in your hand",
  );
  for (const id of response.cards) move(state, id, "library", "London mulligan bottom");
  hit(state, "rule:103.5");
  return nextBottom(state);
}
