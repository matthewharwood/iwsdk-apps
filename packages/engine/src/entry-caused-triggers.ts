import {
  type BattlefieldEntryCause,
  EntryCausedTriggerAbility,
  type ExecutionRegistry,
  GameEvent,
  type GameObject,
  OrdinaryTriggeredAbility,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { definition, emit, hit, player, RulesError } from "./common";
import { observerOccurrenceId } from "./entry-observer-context";
import { orderedObjects } from "./object-order";

export function entryCausedOccurrenceId(
  state: RulesState,
  source: GameObject,
  eventIndex: number,
  occurrenceOrdinal: number,
): string {
  return observerOccurrenceId(state, source, eventIndex, 0, occurrenceOrdinal).replace(
    "entry-observer:",
    "entry-caused:",
  );
}
/** Only actual ordinary occurrences from this committed entry are supplied; never ancestry. */
export function captureEntryCausedTriggers(
  state: RulesState,
  registry: ExecutionRegistry,
  cause: BattlefieldEntryCause,
  ordinaryIds: readonly string[],
): void {
  const ordinary = ordinaryIds.map((id) => OrdinaryTriggeredAbility.parse(state.abilities[id]));
  for (const source of orderedObjects(state)) {
    if (source.zone !== "battlefield" || source.token || player(state, source.controller).lost)
      continue;
    const card = definition(registry, source.definition);
    const program = card.triggerPrograms?.[0];
    if (program?.schema !== "commander-entry-caused-trigger/1") continue;
    for (const [occurrenceOrdinal, captured] of ordinary.entries()) {
      const id = entryCausedOccurrenceId(state, source, cause.eventIndex, occurrenceOrdinal);
      if (state.abilities[id])
        throw new RulesError("Invariant", "Entry-caused occurrence captured twice");
      const ability = EntryCausedTriggerAbility.parse({
        id,
        source: structuredClone(source),
        sourceVersion: card.sourceVersion,
        controller: source.controller,
        program: structuredClone(program),
        eventIndex: cause.eventIndex,
        occurrenceOrdinal,
        immediateCause: { kind: "ability-triggered", triggeringAbilityId: captured.id },
        referencedTrigger: {
          captured: structuredClone(captured),
          immediateCause: structuredClone(cause),
        },
      });
      state.abilities[id] = ability;
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
          eventIndex: cause.eventIndex,
          occurrenceOrdinal,
          immediateCause: ability.immediateCause,
          referencedTrigger: ability.referencedTrigger,
          sourceSnapshot: ability.source,
          placementClass: "triggered-by-trigger",
        }),
      );
      hit(state, "rule:603.2");
      hit(state, "rule:603.2c");
      hit(state, "rule:603.3b");
      hit(state, `card:${card.id}:trigger:${program.id}:capture`);
    }
  }
}
