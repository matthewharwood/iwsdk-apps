import {
  type Cost,
  type Decision,
  type ExecutionRegistry,
  MANA_COLORS,
  type Mana,
  type Response,
  type RulesState,
} from "@iwsdk-apps/contracts";
import {
  card,
  definition,
  emit,
  hit,
  move,
  object,
  player,
  RulesError,
  removeFromLists,
  request,
  requireRule,
} from "./common";
import { isLegalSpellTarget, legalSpellTargets, resolveSpellProgram } from "./effects";
import { availableMana, priorityCandidates, selectedObjects } from "./selection";

export function manaSources(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
): Decision["manaSources"] {
  return selectedObjects(state, release, availableMana, {
    actor,
    lastTurn: player(state, actor).lastTurnStarted,
  }).map((entry) => ({
    object: entry.id,
    colors: definition(release, entry.definition).manaAbilities,
  }));
}
export function isMainWindow(state: RulesState, actor: string): boolean {
  return (
    state.activePlayer === actor &&
    ["main1", "main2"].includes(state.step) &&
    state.stack.length === 0
  );
}
export function castCost(state: RulesState, release: ExecutionRegistry, id: string): Cost {
  const target = object(state, id);
  const cost = card(state, release, id).manaCost;
  if (!cost) throw new RulesError("IllegalCommand", "A missing mana cost cannot be paid.");
  const tax =
    target.commander && target.zone === "command"
      ? 2 * (player(state, target.owner).commanderCasts[target.lineage] ?? 0)
      : 0;
  return { ...cost, generic: cost.generic + tax };
}
export function priorityCards(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
): string[] {
  return selectedObjects(
    state,
    release,
    priorityCandidates(isMainWindow(state, actor), player(state, actor).landsPlayed === 0),
    { actor },
  )
    .filter((entry) => {
      const current = definition(release, entry.definition);
      if (!current.spellProgram?.target) return true;
      const targets = legalSpellTargets(state, release, actor, current.spellProgram, entry.id);
      return targets.cards.length + targets.players.length > 0;
    })
    .map((entry) => entry.id);
}
export function playLand(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: Response,
): void {
  requireRule(response.kind === "land", "Expected a land play");
  const target = object(state, response.card);
  requireRule(
    target.zone === "hand" && target.owner === actor,
    "You may play a land from your hand.",
  );
  requireRule(card(state, release, target.id).types.includes("Land"), "The object is not a land.");
  requireRule(
    isMainWindow(state, actor) && player(state, actor).landsPlayed === 0,
    "No available land play in this window.",
  );
  const entered = enterBattlefield(
    state,
    release,
    [{ objectId: target.id, controller: actor }],
    "play land",
  )[0];
  if (!entered) throw new RulesError("Invariant", "Played land did not enter");
  player(state, actor).landsPlayed++;
  state.consecutivePasses = 0;
  emit(state, "LandPlayed", { player: actor, object: entered });
  hit(state, "rule:305.1");
  hit(state, `card:${target.definition}:land`);
}
export function activateMana(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: Response,
): void {
  requireRule(response.kind === "mana", "Expected a mana activation");
  const source = manaSources(state, release, actor).find(
    (entry) => entry.object === response.source.object,
  );
  requireRule(
    source?.colors.includes(response.source.color),
    "That mana ability is not available.",
  );
  object(state, response.source.object).tapped = true;
  player(state, actor).mana[response.source.color]++;
  state.consecutivePasses = 0;
  emit(state, "ManaAbilityResolved", {
    player: actor,
    source: response.source.object,
    color: response.source.color,
  });
  hit(state, "rule:605.3b");
}
export function beginCast(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: Response,
): void {
  requireRule(response.kind === "cast", "Expected a spell declaration");
  requireRule(
    priorityCards(state, release, actor).includes(response.card),
    "That spell cannot be cast in this window.",
  );
  requireRule(
    !card(state, release, response.card).types.includes("Land"),
    "A land is played, not cast.",
  );
  const current = card(state, release, response.card);
  const program = current.spellProgram;
  if (
    !current.types.includes("Creature") &&
    !isStaticBonusPermanent(current) &&
    !isEntryObserverPermanent(current) &&
    (!(current.types.includes("Instant") || current.types.includes("Sorcery")) || !program)
  )
    throw new RulesError(
      "UnsupportedMechanic",
      `Spell program is not implemented: ${current.name}`,
    );
  const targets = program
    ? legalSpellTargets(state, release, actor, program, response.card)
    : { cards: [], players: [] };
  requireRule(
    !program?.target || targets.cards.length + targets.players.length > 0,
    "This spell requires a legal target.",
  );
  const cost = castCost(state, release, response.card);
  const origin = structuredClone(object(state, response.card));
  const handIndex = origin.zone === "hand" ? player(state, actor).hand.indexOf(origin.id) : null;
  const spell = move(state, origin.id, "stack", "announce spell");
  state.frames.push({
    kind: "casting",
    actor,
    card: spell.id,
    cost,
    origin,
    handIndex,
    target: null,
  });
  if (program) spell.spellState = { target: null };
  emit(state, "SpellAnnounced", { player: actor, object: spell.id, definition: spell.definition });
  if (program?.target) {
    request(state, "target", actor, {
      ...targets,
      count: 1,
      context: `Choose one ${program.target} for ${current.name}, or reverse the announcement.`,
    });
    return;
  }
  requestPayment(state, release, actor);
}
function requestPayment(state: RulesState, release: ExecutionRegistry, actor: string): void {
  const frame = state.frames.at(-1);
  if (frame?.kind !== "casting") throw new RulesError("Invariant", "No casting frame to pay");
  request(state, "payment", actor, {
    cost: frame.cost,
    cards: [frame.card],
    manaSources: manaSources(state, release, actor),
    context: "Pay the declared cost or reverse the announcement.",
  });
}
export function answerTarget(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: Response,
): boolean {
  const frame = state.frames.at(-1);
  requireRule(frame?.kind === "casting" && frame.actor === actor, "No owned casting workflow");
  if (response.kind === "cancel-cast") {
    reverseCast(state, actor);
    return true;
  }
  requireRule(response.kind === "target", "Expected one spell target or cancellation");
  const program = card(state, release, frame.card).spellProgram;
  requireRule(
    program?.target !== null && program !== undefined,
    "This spell does not require a target",
  );
  requireRule(
    isLegalSpellTarget(state, release, actor, program, response.target, frame.card),
    "The chosen target is not legal for this spell.",
  );
  frame.target = response.target;
  object(state, frame.card).spellState = { target: response.target };
  emit(state, "SpellTargetChosen", { source: frame.card, target: response.target, player: actor });
  hit(state, "rule:601.2c");
  requestPayment(state, release, actor);
  return false;
}
function reverseCast(state: RulesState, actor: string): void {
  const frame = state.frames.at(-1);
  requireRule(frame?.kind === "casting" && frame.actor === actor, "No owned casting workflow");
  removeFromLists(state, frame.card);
  delete state.objects[frame.card];
  state.objects[frame.origin.id] = frame.origin;
  if (frame.handIndex !== null)
    player(state, actor).hand.splice(frame.handIndex, 0, frame.origin.id);
  state.frames.pop();
  emit(state, "CastingReversed", { player: actor, object: frame.origin.id });
  hit(state, "rule:733.1");
}
export function validSpend(pool: Mana, spend: Mana, cost: Cost): boolean {
  return (
    MANA_COLORS.every((color) => spend[color] <= pool[color] && spend[color] >= cost[color]) &&
    MANA_COLORS.reduce((sum, color) => sum + spend[color] - cost[color], 0) === cost.generic
  );
}
export function payForCast(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: Response,
): void {
  const frame = state.frames.at(-1);
  requireRule(frame?.kind === "casting" && frame.actor === actor, "No staged casting workflow");
  if (response.kind === "cancel-cast") {
    reverseCast(state, actor);
    return;
  }
  requireRule(response.kind === "payment", "Expected payment or cancellation");
  const program = card(state, release, frame.card).spellProgram;
  requireRule(
    !program || isLegalSpellTarget(state, release, actor, program, frame.target, frame.card),
    "A required legal target has not been chosen.",
  );
  requireRule(
    new Set(response.sources.map((source) => source.object)).size === response.sources.length,
    "A mana source cannot be tapped twice.",
  );
  const available = manaSources(state, release, actor);
  const pool = { ...player(state, actor).mana };
  for (const source of response.sources) {
    requireRule(
      available.find((entry) => entry.object === source.object)?.colors.includes(source.color),
      "Invalid mana source or output color",
    );
    pool[source.color]++;
  }
  requireRule(
    validSpend(pool, response.spend, frame.cost),
    "Mana payment does not satisfy the exact cost.",
  );
  const before = frame.origin;
  for (const source of response.sources) {
    object(state, source.object).tapped = true;
    emit(state, "ManaAbilityResolved", {
      player: actor,
      source: source.object,
      color: source.color,
    });
  }
  for (const color of MANA_COLORS)
    player(state, actor).mana[color] = pool[color] - response.spend[color];
  if (before.commander && before.zone === "command") {
    const owner = player(state, actor);
    owner.commanderCasts[before.lineage] = (owner.commanderCasts[before.lineage] ?? 0) + 1;
    hit(state, "rule:903.8");
  }
  const spell = object(state, frame.card);
  state.frames.pop();
  state.consecutivePasses = 0;
  emit(state, "SpellCast", {
    player: actor,
    object: spell.id,
    definition: spell.definition,
    paid: response.spend,
  });
  hit(state, "rule:601.2");
  hit(state, `card:${spell.definition}:cast`);
}
export function resolveTop(state: RulesState, release: ExecutionRegistry): boolean {
  const top = state.stack.at(-1);
  if (!top) throw new RulesError("Invariant", "No stack object to resolve");
  if (top.kind === "triggered-ability") {
    resolveTriggeredAbility(state, release);
    return true;
  }
  const id = top.objectId;
  const current = card(state, release, id);
  if (
    (current.types.includes("Instant") || current.types.includes("Sorcery")) &&
    current.spellProgram
  ) {
    return resolveSpellProgram(state, release, id);
  }
  if (
    !current.types.includes("Creature") &&
    !isStaticBonusPermanent(current) &&
    !isEntryObserverPermanent(current)
  )
    throw new RulesError(
      "UnsupportedMechanic",
      `Spell program is not implemented: ${current.name}`,
    );
  const controller = object(state, id).controller;
  const enteredId = enterBattlefield(
    state,
    release,
    [{ objectId: id, controller }],
    "resolve permanent spell",
  )[0];
  if (!enteredId) throw new RulesError("Invariant", "Permanent spell failed to enter");
  const entered = object(state, enteredId);
  emit(state, "PermanentSpellResolved", { object: entered.id, definition: entered.definition });
  hit(state, "rule:608.3");
  hit(state, `card:${entered.definition}:resolve`);
  return true;
}

import { isEntryObserverPermanent, isStaticBonusPermanent } from "./permanent-programs";
import { enterBattlefield, resolveTriggeredAbility } from "./triggers";
