import type { ExecutionRegistry, RulesState } from "@iwsdk-apps/contracts";
import type { Selector } from "@iwsdk-apps/rule-selection";
import { selectedObjects } from "./selection";

const creatureTarget: Selector = {
  op: "and",
  terms: [
    { op: "string-eq", field: "zone", value: "battlefield" },
    { op: "set-has", field: "types", value: "Creature" },
    { op: "not", term: { op: "set-has", field: "keywords", value: "shroud" } },
    {
      op: "or",
      terms: [
        { op: "string-eq", field: "controller", value: { binding: "actor" } },
        { op: "not", term: { op: "set-has", field: "keywords", value: "hexproof" } },
      ],
    },
  ],
};
/** Targeting is identical for a spell and ordinary ability controlled by the supplied actor. */
export function legalCreatureTargets(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
): string[] {
  return selectedObjects(state, registry, creatureTarget, { actor }).map((entry) => entry.id);
}
