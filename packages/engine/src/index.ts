import {
  type ExecutionRegistry,
  GameCommand,
  type PlayerObservation,
  type Response,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { activateMana, answerTarget, beginCast, payForCast, playLand } from "./casting";
import { characteristics } from "./characteristics";
import { answerCommanderZone } from "./checkpoints";
import { answerAttack, answerBlock, answerDamage, applyCombatDamage } from "./combat";
import { assertRegistryPin, definition, emit, RulesError, requireActivePlayer } from "./common";
import { assertInvariants } from "./invariants";
import { orderedObjects } from "./object-order";
import { assertResolutionContinuation } from "./resolution-context";
import { answerCommanderReplacement } from "./return-resolution";
import { bottom, chooseStartingPlayer, mulligan } from "./setup";
import { assertTriggerContexts } from "./trigger-context";
import { answerTriggerPayment, assertTriggerPayment } from "./trigger-payment";
import { answerTriggerOrder } from "./triggers";
import { answerDiscard, givePriority, passPriority, startTurn } from "./turns";

export { RulesError } from "./common";
export { assertInvariants } from "./invariants";
export { admitDeck, createMatch } from "./setup";
export type Transition =
  | { status: "accepted"; state: RulesState }
  | { status: "rejected" | "unsupported" | "fault"; code: string; message: string };

function priorityAction(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: Response,
): void {
  switch (response.kind) {
    case "pass":
      passPriority(state, release, actor);
      return;
    case "land":
      playLand(state, release, actor, response);
      break;
    case "mana":
      activateMana(state, release, actor, response);
      break;
    case "cast":
      beginCast(state, release, actor, response);
      return;
    default:
      throw new RulesError("IllegalCommand", "This response is not an available priority action.");
  }
  givePriority(state, release, actor);
}
function answer(
  state: RulesState,
  release: ExecutionRegistry,
  kind: NonNullable<RulesState["decision"]>["kind"],
  actor: string,
  response: Response,
): void {
  switch (kind) {
    case "trigger-payment":
      if (answerTriggerPayment(state, release, actor, response)) givePriority(state, release);
      return;
    case "trigger-order":
      if (answerTriggerOrder(state, actor, response)) givePriority(state, release);
      return;
    case "starting-player":
      chooseStartingPlayer(state, actor, response);
      return;
    case "mulligan":
      if (mulligan(state, actor, response)) startTurn(state, release, true);
      return;
    case "bottom":
      if (bottom(state, actor, response)) startTurn(state, release, true);
      return;
    case "priority":
      priorityAction(state, release, actor, response);
      return;
    case "payment":
      payForCast(state, release, actor, response);
      givePriority(state, release, actor);
      return;
    case "target":
      if (answerTarget(state, release, actor, response)) givePriority(state, release, actor);
      return;
    case "commander-replacement":
      if (answerCommanderReplacement(state, actor, response))
        givePriority(state, release, requireActivePlayer(state));
      return;
    case "commander-zone":
      if (answerCommanderZone(state, actor, response)) givePriority(state, release);
      return;
    case "discard":
      answerDiscard(state, release, actor, response);
      return;
    case "attack":
      if (response.kind !== "attack")
        throw new RulesError("IllegalCommand", "Expected attack declaration");
      answerAttack(state, release, actor, response);
      givePriority(state, release, requireActivePlayer(state));
      return;
    case "block":
      if (response.kind !== "block")
        throw new RulesError("IllegalCommand", "Expected block declaration");
      if (answerBlock(state, release, actor, response))
        givePriority(state, release, requireActivePlayer(state));
      return;
    case "damage":
      if (response.kind !== "damage")
        throw new RulesError("IllegalCommand", "Expected damage allocation");
      if (answerDamage(state, release, actor, response)) {
        applyCombatDamage(state, release);
        givePriority(state, release, requireActivePlayer(state));
      }
      return;
  }
}
export function transition(
  committed: RulesState,
  input: unknown,
  release: ExecutionRegistry,
): Transition {
  const parsed = GameCommand.safeParse(input);
  if (!parsed.success)
    return {
      status: "rejected",
      code: "InvalidCommand",
      message: "Command does not match the versioned protocol.",
    };
  const command = parsed.data;
  const pending = committed.decision;
  if (command.matchId !== committed.manifest.id)
    return { status: "rejected", code: "WrongMatch", message: "Wrong match." };
  if (command.revision !== committed.revision)
    return {
      status: "rejected",
      code: "StaleRevision",
      message: "The match advanced; request the current decision.",
    };
  if (!pending || committed.outcome.kind !== "ongoing")
    return { status: "rejected", code: "NoDecision", message: "No gameplay decision is pending." };
  if (command.decisionId !== pending.id || command.actor !== pending.actor)
    return {
      status: "rejected",
      code: "WrongDecisionOwner",
      message: "The response does not own this decision.",
    };
  try {
    assertRegistryPin(committed.manifest, release);
    assertResolutionContinuation(committed, release);
    assertTriggerContexts(committed, release);
    assertTriggerPayment(committed, release);
    const state = structuredClone(committed);
    state.revision++;
    state.events = [];
    emit(
      state,
      "DecisionAnswered",
      { actor: command.actor, kind: pending.kind },
      [command.actor],
      command.commandId,
    );
    answer(state, release, pending.kind, command.actor, command.response);
    assertInvariants(state, release);
    return { status: "accepted", state };
  } catch (error) {
    if (error instanceof RulesError)
      return {
        status:
          error.code === "UnsupportedMechanic"
            ? "unsupported"
            : error.code === "IllegalCommand"
              ? "rejected"
              : "fault",
        code: error.code,
        message: error.message,
      };
    return {
      status: "fault",
      code: "EngineException",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

import { lookupTokenTemplate } from "./object-definitions";

export function observe(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
): PlayerObservation {
  assertRegistryPin(state.manifest, release);
  if (!state.players.some((seat) => seat.id === actor))
    throw new RulesError("IllegalCommand", "Unknown observation seat");
  return {
    matchId: state.manifest.id,
    player: actor,
    revision: state.revision,
    turn: state.turn,
    step: state.step,
    startingPlayerChooser: state.startingPlayerChooser,
    startingPlayer: state.startingPlayer,
    activePlayer: state.activePlayer,
    outcome: structuredClone(state.outcome),
    players: state.players.map((seat) => ({
      id: seat.id,
      life: seat.life,
      lost: seat.lost,
      handCount: seat.hand.length,
      libraryCount: seat.library.length,
      mulligans: seat.mulligans,
      keptHand: seat.keptHand,
      mulliganDeclaration: state.setupChoices[seat.id] ?? null,
      mana: { ...seat.mana },
      commanderDamage: { ...seat.commanderDamage },
    })),
    objects: orderedObjects(state)
      .filter(
        (entry) => entry.zone !== "library" && (entry.zone !== "hand" || entry.owner === actor),
      )
      .map((entry) => ({
        ...structuredClone(entry),
        ...(entry.token
          ? {
              card: null,
              tokenTemplate: structuredClone(lookupTokenTemplate(release, entry.definition)),
            }
          : { card: structuredClone(definition(release, entry.definition)), tokenTemplate: null }),
        characteristics: characteristics(state, release, entry.id),
      })),
    decision: state.decision?.actor === actor ? structuredClone(state.decision) : null,
    combat: structuredClone(state.combat),
    stack: structuredClone(state.stack),
    abilities: Object.values(state.abilities)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((ability) => ({
        ...structuredClone(ability),
        sourceCard: structuredClone(definition(release, ability.source.definition)),
      })),
  };
}
