import {
  type ExecutionRegistry,
  GameEvent,
  type Response,
  type RulesState,
  TriggeredAbility,
  triggerEffects,
} from "@iwsdk-apps/contracts";
import {
  definition,
  draw,
  emit,
  hit,
  object,
  player,
  RulesError,
  request,
  requireActivePlayer,
  requireRule,
  tryMove,
} from "./common";

import { checkInterveningIf } from "./conditional-triggers";
import { captureEntryObservers } from "./entry-observers";

/** Complete the entry batch before inspecting post-event self-entry abilities. */
export function enterBattlefield(
  state: RulesState,
  registry: ExecutionRegistry,
  entries: readonly { objectId: string; controller: string }[],
  cause: string,
): string[] {
  requireRule(
    new Set(entries.map((entry) => entry.objectId)).size === entries.length,
    "A physical object cannot enter twice in one batch",
  );
  for (const entry of entries) {
    requireRule(
      object(state, entry.objectId).zone !== "battlefield",
      "Entry requires a zone change",
    );
    requireRule(
      !player(state, entry.controller).lost,
      "A departed player cannot control a newcomer",
    );
  }
  const entered = entries.flatMap((entry) => {
    const result = tryMove(state, entry.objectId, "battlefield", cause, entry.controller);
    return result.kind === "moved" ? [result.after] : [];
  });
  if (entered.length)
    recordBattlefieldEntryBatch(
      state,
      registry,
      entered.map((entry) => entry.id),
      cause,
    );
  return entered.map((entry) => entry.id);
}

/** All entrants already exist before the single entry event is matched. No priority here. */
export function recordBattlefieldEntryBatch(
  state: RulesState,
  registry: ExecutionRegistry,
  enteredIds: readonly string[],
  cause: string,
): void {
  requireRule(
    enteredIds.length > 0 && new Set(enteredIds).size === enteredIds.length,
    "Entry batch must contain unique objects",
  );
  const entered = enteredIds.map((id) => object(state, id));
  requireRule(
    entered.every((entry) => entry.zone === "battlefield" && !player(state, entry.controller).lost),
    "Invalid battlefield entry batch",
  );
  const eventIndex = state.eventSequence;
  emit(
    state,
    "BattlefieldEntryBatch",
    { objects: entered.map((entry) => entry.id) },
    "public",
    cause,
  );
  for (const [occurrenceOrdinal, source] of entered.entries()) {
    if (source.token) continue; // These fixed token templates have no triggered programs.
    const card = definition(registry, source.definition);
    for (const program of card.triggerPrograms ?? []) {
      if (program.schema === "commander-entry-observer/1") continue;
      if (
        program.schema === "commander-conditional-self-entry/1" &&
        !checkInterveningIf(state, registry, source, program, "capture")
      )
        continue;
      const id = `${state.manifest.id}:trigger:${eventIndex}:${occurrenceOrdinal}:${program.id}`;
      if (state.abilities[id])
        throw new RulesError("Invariant", "Trigger occurrence captured twice");
      state.abilities[id] = TriggeredAbility.parse({
        id,
        source: structuredClone(source),
        sourceVersion: card.sourceVersion,
        controller: source.controller,
        program: structuredClone(program),
        eventIndex,
        occurrenceOrdinal,
      });
      state.pendingTriggers.push(id);
      emit(
        state,
        "TriggerCaptured",
        GameEvent.shape.data.parse({
          trigger: id,
          source: source.id,
          controller: source.controller,
          definition: card.id,
          ability: program.id,
          eventIndex,
          occurrenceOrdinal,
        }),
      );
      hit(state, "rule:603.2");
      hit(state, "rule:603.6a");
      hit(state, `card:${card.id}:trigger:${program.id}:capture`);
    }
  }
  captureEntryObservers(state, registry, entered, eventIndex);
}

function ownedCohort(state: RulesState, actor: string): string[] {
  return (
    state.triggerPlacement?.cohort.filter((id) => state.abilities[id]?.controller === actor) ?? []
  );
}
function putOnStack(state: RulesState, ids: readonly string[]): void {
  const placement = state.triggerPlacement;
  if (!placement) throw new RulesError("Invariant", "Missing trigger placement cohort");
  for (const id of ids) {
    const ability = state.abilities[id];
    if (!ability) throw new RulesError("Invariant", "Missing captured trigger");
    state.stack.push({ kind: "triggered-ability", triggerId: id });
    emit(state, "TriggeredAbilityPutOnStack", {
      trigger: id,
      controller: ability.controller,
      source: ability.source.id,
    });
  }
  placement.cohort = placement.cohort.filter((id) => !ids.includes(id));
  state.consecutivePasses = 0;
  hit(state, "rule:603.3b");
}
function finishPlacement(state: RulesState): boolean {
  const placement = state.triggerPlacement;
  if (!placement) return true;
  while (placement.remainingPlayers.length) {
    const actor = placement.remainingPlayers[0];
    if (!actor) throw new RulesError("Invariant", "Missing APNAP controller");
    const ids = ownedCohort(state, actor);
    if (ids.length > 1) {
      request(state, "trigger-order", actor, {
        triggers: ids,
        count: ids.length,
        context: "Order your triggered abilities from bottom to top; the last resolves first.",
      });
      return false;
    }
    putOnStack(state, ids);
    placement.remainingPlayers.shift();
  }
  if (placement.cohort.length)
    throw new RulesError("Invariant", "Unplaced trigger has no APNAP controller");
  // The second CR603.3b pass is distinct. This ABI admits no trigger-on-trigger constructors.
  placement.phase = "triggered-by-trigger";
  state.triggerPlacement = null;
  return true;
}

/** Called only after state-based actions and commander destinations have stabilized. */
export function placeWaitingTriggers(state: RulesState): { waiting: boolean; changed: boolean } {
  if (state.triggerPlacement) return { waiting: !finishPlacement(state), changed: true };
  if (!state.pendingTriggers.length) return { waiting: false, changed: false };
  const start = state.players.findIndex((seat) => seat.id === requireActivePlayer(state));
  const remainingPlayers = [...state.players.slice(start), ...state.players.slice(0, start)]
    .filter((seat) => !seat.lost)
    .map((seat) => seat.id);
  state.triggerPlacement = { phase: "ordinary", cohort: state.pendingTriggers, remainingPlayers };
  state.pendingTriggers = [];
  return { waiting: !finishPlacement(state), changed: true };
}

export function answerTriggerOrder(state: RulesState, actor: string, response: Response): boolean {
  requireRule(response.kind === "trigger-order", "Expected a trigger ordering choice");
  const placement = state.triggerPlacement;
  requireRule(
    placement?.phase === "ordinary" && placement.remainingPlayers[0] === actor,
    "This player does not own the pending trigger-order choice",
  );
  const ids = ownedCohort(state, actor);
  requireRule(
    response.triggers.length === ids.length &&
      new Set(response.triggers).size === ids.length &&
      response.triggers.every((id) => ids.includes(id)),
    "Supply an exact permutation of your pending triggers",
  );
  putOnStack(state, response.triggers);
  placement.remainingPlayers.shift();
  return finishPlacement(state);
}

export function resolveTriggeredAbility(state: RulesState, registry: ExecutionRegistry): void {
  const top = state.stack.at(-1);
  if (top?.kind !== "triggered-ability")
    throw new RulesError("Invariant", "No triggered ability to resolve");
  const ability = state.abilities[top.triggerId];
  if (!ability || player(state, ability.controller).lost)
    throw new RulesError("Invariant", "A resolving ability lacks a living captured controller");
  if (
    ability.program.schema === "commander-conditional-self-entry/1" &&
    !checkInterveningIf(state, registry, ability.source, ability.program, "resolution")
  ) {
    state.stack.pop();
    delete state.abilities[ability.id];
    emit(state, "TriggeredAbilityRemoved", {
      trigger: ability.id,
      source: ability.source.id,
      controller: ability.controller,
      definition: ability.source.definition,
      ability: ability.program.id,
      reason: "intervening-if-false",
    });
    return;
  }
  for (const effect of triggerEffects(ability.program)) {
    if (effect.kind === "draw") draw(state, ability.controller, effect.amount);
    else {
      player(state, ability.controller).life += effect.amount;
      emit(state, "LifeGained", {
        player: ability.controller,
        amount: effect.amount,
        source: ability.source.id,
        ability: ability.id,
      });
      hit(state, "rule:119.3");
    }
  }
  hit(state, "rule:608.2c");
  state.stack.pop();
  delete state.abilities[ability.id];
  emit(state, "TriggeredAbilityResolved", {
    trigger: ability.id,
    source: ability.source.id,
    controller: ability.controller,
    definition: ability.source.definition,
    ability: ability.program.id,
  });
  hit(state, "rule:608.2n");
  hit(state, `card:${ability.source.definition}:trigger:${ability.program.id}:resolve`);
}

export function removeDepartedTriggers(state: RulesState, lost: ReadonlySet<string>): void {
  const removed = new Set(
    Object.values(state.abilities)
      .filter((ability) => lost.has(ability.controller))
      .map((ability) => ability.id),
  );
  state.stack = state.stack.filter(
    (entry) => entry.kind !== "triggered-ability" || !removed.has(entry.triggerId),
  );
  state.pendingTriggers = state.pendingTriggers.filter((id) => !removed.has(id));
  if (state.triggerPlacement) {
    state.triggerPlacement.cohort = state.triggerPlacement.cohort.filter((id) => !removed.has(id));
    state.triggerPlacement.remainingPlayers = state.triggerPlacement.remainingPlayers.filter(
      (id) => !lost.has(id),
    );
  }
  for (const id of removed) delete state.abilities[id];
  if (removed.size) emit(state, "DepartingPlayersTriggersRemoved", { triggers: [...removed] });
}
