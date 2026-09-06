import type { ExecutionRegistry, Response, RulesState, Step } from "@iwsdk-apps/contracts";
import { castCost, manaSources, priorityCards, resolveTop } from "./casting";
import { checkpoint } from "./checkpoints";
import {
  applyCombatDamage,
  hasFirstStrikeStep,
  startAttackDeclaration,
  startBlockDeclarations,
  startCombatDamage,
} from "./combat";
import {
  battlefield,
  clearMana,
  draw,
  emit,
  emptyCombat,
  hit,
  move,
  nextLiving,
  player,
  request,
  requireActivePlayer,
  requireRule,
} from "./common";
import { expireTurnEffects } from "./continuous";

export function givePriority(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string = state.priorityPlayer ?? requireActivePlayer(state),
): void {
  if (state.outcome.kind !== "ongoing") return;
  state.priorityPlayer = player(state, actor).lost ? nextLiving(state, actor) : actor;
  const result = checkpoint(state, release);
  if (result.waiting || state.outcome.kind !== "ongoing") return;
  if (player(state, state.priorityPlayer).lost)
    state.priorityPlayer = nextLiving(state, state.priorityPlayer);
  const cards = priorityCards(state, release, state.priorityPlayer);
  request(state, "priority", state.priorityPlayer, {
    cards,
    cardCosts: Object.fromEntries(
      cards
        .filter(
          (id) => !release.definitions[state.objects[id]?.definition ?? ""]?.types.includes("Land"),
        )
        .map((id) => [id, castCost(state, release, id)]),
    ),
    manaSources: manaSources(state, release, state.priorityPlayer),
    context: `${state.step}: act or pass priority`,
  });
}
function step(state: RulesState, next: Step): void {
  clearMana(state);
  state.step = next;
  state.consecutivePasses = 0;
  emit(state, "StepStarted", { turn: state.turn, activePlayer: state.activePlayer, step: next });
}
export function startTurn(state: RulesState, release: ExecutionRegistry, initial = false): void {
  if (!initial) state.activePlayer = nextLiving(state, requireActivePlayer(state));
  state.turn++;
  const active = player(state, requireActivePlayer(state));
  active.landsPlayed = 0;
  active.lastTurnStarted = state.turn;
  state.combat = emptyCombat();
  state.cleanupPriority = false;
  for (const entry of battlefield(state)) if (entry.controller === active.id) entry.tapped = false;
  emit(state, "UntapPerformed", { player: active.id, turn: state.turn });
  hit(state, "rule:502");
  step(state, "upkeep");
  givePriority(state, release, requireActivePlayer(state));
}
function drawStep(state: RulesState, release: ExecutionRegistry): void {
  if (state.turn === 1 && state.manifest.mode === "two-seat") {
    hit(state, "rule:103.8a");
    step(state, "main1");
  } else {
    step(state, "draw");
    if (!player(state, requireActivePlayer(state)).lost) draw(state, requireActivePlayer(state), 1);
    hit(state, "rule:504.1");
  }
  givePriority(state, release, requireActivePlayer(state));
}
function beginDamage(state: RulesState, release: ExecutionRegistry, first: boolean): void {
  step(state, first ? "first-strike-damage" : "combat-damage");
  if (!startCombatDamage(state, release, first)) {
    applyCombatDamage(state, release);
    givePriority(state, release, requireActivePlayer(state));
  }
}
export function finishCleanup(state: RulesState, release: ExecutionRegistry): void {
  for (const entry of battlefield(state)) {
    entry.damage = 0;
    entry.deathtouchDamage = false;
  }
  expireTurnEffects(state);
  clearMana(state);
  emit(state, "CleanupPerformed", { turn: state.turn });
  hit(state, "rule:514.2");
  const checked = checkpoint(state, release);
  if (state.outcome.kind !== "ongoing") return;
  if (checked.waiting || checked.changed) {
    state.cleanupPriority = true;
    state.priorityPlayer = state.activePlayer;
    if (!checked.waiting) givePriority(state, release, requireActivePlayer(state));
  } else startTurn(state, release);
}
function beginCleanup(state: RulesState, release: ExecutionRegistry): void {
  step(state, "cleanup");
  state.cleanupPriority = false;
  const active = player(state, requireActivePlayer(state));
  const count = Math.max(0, active.hand.length - 7);
  if (!active.lost && count)
    request(state, "discard", active.id, {
      count,
      cards: [...active.hand],
      context: "Discard to your maximum hand size.",
    });
  else finishCleanup(state, release);
}
export function answerDiscard(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: Response,
): void {
  requireRule(response.kind === "discard", "Expected cleanup discard");
  const seat = player(state, actor);
  requireRule(
    actor === state.activePlayer && response.cards.length === Math.max(0, seat.hand.length - 7),
    "Incorrect cleanup discard count",
  );
  requireRule(
    new Set(response.cards).size === response.cards.length &&
      response.cards.every((id) => seat.hand.includes(id)),
    "Discard choices must be distinct cards in your hand.",
  );
  for (const id of response.cards) move(state, id, "graveyard", "cleanup discard");
  hit(state, "rule:514.1");
  finishCleanup(state, release);
}
export function advanceStep(state: RulesState, release: ExecutionRegistry): void {
  switch (state.step) {
    case "upkeep":
      drawStep(state, release);
      return;
    case "draw":
      step(state, "main1");
      break;
    case "main1":
      step(state, "begin-combat");
      break;
    case "begin-combat":
      step(state, "attackers");
      if (player(state, requireActivePlayer(state)).lost)
        givePriority(state, release, requireActivePlayer(state));
      else startAttackDeclaration(state, release);
      return;
    case "attackers":
      if (state.combat.attacks.length === 0) {
        step(state, "end-combat");
        break;
      }
      step(state, "blockers");
      if (startBlockDeclarations(state, release)) return;
      break;
    case "blockers":
      beginDamage(state, release, hasFirstStrikeStep(state, release));
      return;
    case "first-strike-damage":
      beginDamage(state, release, false);
      return;
    case "combat-damage":
      step(state, "end-combat");
      break;
    case "end-combat":
      state.combat = emptyCombat();
      step(state, "main2");
      break;
    case "main2":
      step(state, "end");
      break;
    case "end":
    case "cleanup":
      beginCleanup(state, release);
      return;
    case "setup":
      throw new Error("Setup cannot advance by passing priority.");
  }
  givePriority(state, release, requireActivePlayer(state));
}
export function passPriority(state: RulesState, release: ExecutionRegistry, actor: string): void {
  state.consecutivePasses++;
  emit(state, "PriorityPassed", { player: actor });
  hit(state, "rule:117.4");
  if (state.consecutivePasses < state.players.filter((seat) => !seat.lost).length) {
    givePriority(state, release, nextLiving(state, actor));
    return;
  }
  state.consecutivePasses = 0;
  if (state.stack.length) {
    resolveTop(state, release);
    givePriority(state, release, requireActivePlayer(state));
  } else advanceStep(state, release);
}
