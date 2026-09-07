import {
  canonicalJson,
  type EntryCausedTriggerAbility,
  type ExecutionRegistry,
  type OrdinaryTriggeredAbility,
  type RulesState,
  TriggeredAbility,
} from "@iwsdk-apps/contracts";
import { definition, RulesError } from "./common";
import { entryCausedOccurrenceId } from "./entry-caused-triggers";
import { assertObserverContext, observerOccurrenceId } from "./entry-observer-context";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("Invariant", message);
}
function header(
  state: RulesState,
  registry: ExecutionRegistry,
  ability: TriggeredAbility,
  historical = false,
): void {
  invariant(
    ability.source.zone === "battlefield" &&
      !ability.source.token &&
      ability.source.id === `${ability.source.lineage}@${ability.source.generation}` &&
      ability.eventIndex < state.eventSequence,
    "Captured trigger event or source incarnation mismatch",
  );
  const source = definition(registry, ability.source.definition);
  invariant(
    source.sourceVersion === ability.sourceVersion &&
      source.triggerPrograms?.some(
        (program) => canonicalJson(program) === canonicalJson(ability.program),
      ),
    "Captured trigger program differs from its pinned source",
  );
  invariant(
    ability.controller === ability.source.controller &&
      state.players.some((seat) => seat.id === ability.controller && (historical || !seat.lost)),
    "Captured trigger controller differs from its entry snapshot or living seat",
  );
  // This validates the immutable physical inventory coordinate even when that owner has left.
  observerOccurrenceId(state, ability.source, ability.eventIndex, 0, ability.occurrenceOrdinal);
}
function ordinary(
  state: RulesState,
  registry: ExecutionRegistry,
  ability: OrdinaryTriggeredAbility,
): void {
  if ("entry" in ability) assertObserverContext(state, registry, ability);
  else
    invariant(
      ability.id ===
        `${state.manifest.id}:trigger:${ability.eventIndex}:${ability.occurrenceOrdinal}:${ability.program.id}`,
      "Captured self-entry identity changed",
    );
}
function meta(
  state: RulesState,
  registry: ExecutionRegistry,
  ability: EntryCausedTriggerAbility,
): void {
  const reference = ability.referencedTrigger.captured,
    cause = ability.referencedTrigger.immediateCause;
  header(state, registry, reference, true);
  ordinary(state, registry, reference);
  invariant(
    ability.id ===
      entryCausedOccurrenceId(
        state,
        ability.source,
        ability.eventIndex,
        ability.occurrenceOrdinal,
      ) &&
      ability.immediateCause.triggeringAbilityId === reference.id &&
      reference.eventIndex === ability.eventIndex &&
      cause.eventIndex === reference.eventIndex &&
      new Set(cause.enteredObjectIds).size === cause.enteredObjectIds.length,
    "Entry-caused trigger identity or immediate cause changed",
  );
  const subject = "entry" in reference ? reference.entry.subject : reference.source;
  invariant(
    cause.enteredObjectIds[reference.occurrenceOrdinal] === subject.id,
    "Referenced ability is not caused by this entry occurrence",
  );
  const current = state.abilities[reference.id];
  if (current)
    invariant(
      canonicalJson(current) === canonicalJson(reference),
      "Referenced live occurrence differs from immutable capture",
    );
  const capture = state.events.find(
    (event) => event.type === "TriggerCaptured" && event.data.trigger === ability.id,
  );
  if (capture)
    invariant(
      canonicalJson(capture.data.referencedTrigger) === canonicalJson(ability.referencedTrigger) &&
        canonicalJson(capture.data.immediateCause) === canonicalJson(ability.immediateCause) &&
        canonicalJson(capture.data.sourceSnapshot) === canonicalJson(ability.source),
      "Meta context differs from retained capture event",
    );
  const entry = state.events.find((event) => event.index === cause.eventIndex);
  if (entry)
    invariant(
      entry.type === "BattlefieldEntryBatch" &&
        canonicalJson(entry.data.objects) === canonicalJson(cause.enteredObjectIds),
      "Meta cause differs from retained entry batch",
    );
}
/** Structural evidence is checked before dispatch; archive replay separately authenticates its history. */
export function assertTriggerContexts(state: RulesState, registry: ExecutionRegistry): void {
  for (const [id, input] of Object.entries(state.abilities)) {
    const parsed = TriggeredAbility.safeParse(input);
    invariant(parsed.success, "Captured ability is not a strict supported context");
    const ability = parsed.data;
    invariant(id === ability.id, "Captured trigger map identity changed");
    header(state, registry, ability);
    if ("referencedTrigger" in ability) meta(state, registry, ability);
    else ordinary(state, registry, ability);
  }
}
