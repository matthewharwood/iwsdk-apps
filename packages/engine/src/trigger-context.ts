import {
  canonicalJson,
  type ExecutionRegistry,
  type RulesState,
  TriggeredAbility,
} from "@iwsdk-apps/contracts";
import { definition, RulesError } from "./common";
import { assertObserverContext } from "./entry-observer-context";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("Invariant", message);
}
/** Validate saved contexts before dispatch too: resolving an ability removes its evidence. */
export function assertTriggerContexts(state: RulesState, registry: ExecutionRegistry): void {
  for (const [id, input] of Object.entries(state.abilities)) {
    const parsed = TriggeredAbility.safeParse(input);
    invariant(parsed.success, "Captured ability is not a strict supported context");
    const ability = parsed.data;
    invariant(
      id === ability.id &&
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
        state.players.some((seat) => seat.id === ability.controller && !seat.lost),
      "Captured trigger controller differs from its entry snapshot or living seat",
    );
    if ("entry" in ability) assertObserverContext(state, registry, ability);
    else
      invariant(
        id ===
          `${state.manifest.id}:trigger:${ability.eventIndex}:${ability.occurrenceOrdinal}:${ability.program.id}`,
        "Captured self-entry identity changed",
      );
  }
}
