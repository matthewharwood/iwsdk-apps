import type {
  ConditionalSelfEntryProgram,
  ExecutionRegistry,
  GameObject,
  RulesState,
} from "@iwsdk-apps/contracts";
import type { Selector } from "@iwsdk-apps/rule-selection";
import { emit, hit } from "./common";
import { selectObjectCandidates } from "./selection";

const controlledArtifact: Selector = {
  op: "and",
  terms: [
    { op: "string-eq", field: "zone", value: "battlefield" },
    { op: "string-eq", field: "controller", value: { binding: "actor" } },
    { op: "set-has", field: "types", value: "Artifact" },
  ],
};
/** CR603.4/608.2a: re-query current permanents; the entry snapshot binds "you", not a witness. */
export function checkInterveningIf(
  state: RulesState,
  registry: ExecutionRegistry,
  source: GameObject,
  program: ConditionalSelfEntryProgram,
  phase: "capture" | "resolution",
): boolean {
  const matched =
    selectObjectCandidates(state, registry, controlledArtifact, {
      actor: source.controller,
    }).ids.length > 0;
  emit(state, "TriggerConditionEvaluated", {
    phase,
    matched,
    source: source.id,
    controller: source.controller,
    definition: source.definition,
    ability: program.id,
    condition: program.interveningIf,
  });
  hit(state, "rule:603.4");
  if (phase === "resolution") hit(state, "rule:608.2a");
  hit(state, `card:${source.definition}:trigger:${program.id}:condition-${phase}-${matched}`);
  return matched;
}
