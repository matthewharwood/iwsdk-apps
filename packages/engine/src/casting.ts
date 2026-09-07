import type { Cost, ExecutionRegistry, Response, RulesState } from "@iwsdk-apps/contracts";
import { castTargetKind, isLegalCastTarget, legalCastTargets } from "./cast-targets";
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
import { resolveSpellProgram } from "./effects";
import { priorityCandidates, selectedObjects } from "./selection";

export { activateMana, manaSources, validSpend } from "./mana";

import { commitManaPayment, manaSources, planManaPayment } from "./mana";
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
      if (!castTargetKind(current)) return true;
      const targets = legalCastTargets(state, release, actor, current, entry.id);
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
    !isStaticKeywordGrantPermanent(current) &&
    !isDamageProgramPermanent(current) &&
    !isOrdinaryActivatedPermanent(current) &&
    !isAttachmentPermanent(current) &&
    !isEntryObserverPermanent(current) &&
    (!(current.types.includes("Instant") || current.types.includes("Sorcery")) || !program)
  )
    throw new RulesError(
      "UnsupportedMechanic",
      `Spell program is not implemented: ${current.name}`,
    );
  const targetKind = castTargetKind(current);
  const targets = legalCastTargets(state, release, actor, current, response.card);
  requireRule(
    !targetKind || targets.cards.length + targets.players.length > 0,
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
  if (program || targetKind) spell.spellState = { target: null };
  emit(state, "SpellAnnounced", { player: actor, object: spell.id, definition: spell.definition });
  if (targetKind) {
    request(state, "target", actor, {
      ...targets,
      count: 1,
      context: `Choose one ${targetKind} for ${current.name}, or reverse the announcement.`,
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
  const current = card(state, release, frame.card);
  requireRule(castTargetKind(current) !== null, "This spell does not require a target");
  requireRule(
    isLegalCastTarget(state, release, actor, current, response.target, frame.card),
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
  const current = card(state, release, frame.card);
  requireRule(
    isLegalCastTarget(state, release, actor, current, frame.target, frame.card),
    "A required legal target has not been chosen.",
  );
  const payment = planManaPayment(
    state,
    release,
    actor,
    frame.cost,
    response.sources,
    response.spend,
  );
  const before = frame.origin;
  commitManaPayment(state, actor, payment);
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
    return resolveTriggeredAbility(state, release);
  }
  if (top.kind === "activated-ability") return resolveActivatedAbility(state, release);
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
    !isStaticKeywordGrantPermanent(current) &&
    !isDamageProgramPermanent(current) &&
    !isOrdinaryActivatedPermanent(current) &&
    !isAttachmentPermanent(current) &&
    !isEntryObserverPermanent(current)
  )
    throw new RulesError(
      "UnsupportedMechanic",
      `Spell program is not implemented: ${current.name}`,
    );
  const controller = object(state, id).controller;
  const aura = current.attachmentProgram?.schema === "commander-aura/1";
  const auraTarget = object(state, id).spellState?.target ?? null;
  if (aura && !isLegalCastTarget(state, release, controller, current, auraTarget, id)) {
    move(state, id, "graveyard", "Aura target illegal at resolution");
    emit(state, "AuraSpellDidNotResolve", {
      source: id,
      definition: current.id,
      target: auraTarget,
      reason: "all-targets-illegal",
    });
    hit(state, "rule:608.3b");
    return true;
  }
  const enteredId = enterBattlefield(
    state,
    release,
    [{ objectId: id, controller, ...(aura && auraTarget ? { auraTarget } : {}) }],
    "resolve permanent spell",
  )[0];
  if (!enteredId) throw new RulesError("Invariant", "Permanent spell failed to enter");
  const entered = object(state, enteredId);
  emit(state, "PermanentSpellResolved", { object: entered.id, definition: entered.definition });
  hit(state, "rule:608.3");
  hit(state, `card:${entered.definition}:resolve`);
  return true;
}

import { resolveActivatedAbility } from "./activation-resolution";
import {
  isAttachmentPermanent,
  isDamageProgramPermanent,
  isEntryObserverPermanent,
  isOrdinaryActivatedPermanent,
  isStaticBonusPermanent,
  isStaticKeywordGrantPermanent,
} from "./permanent-programs";
import { enterBattlefield, resolveTriggeredAbility } from "./triggers";
