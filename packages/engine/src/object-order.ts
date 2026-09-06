import type { GameObject, RulesState } from "@iwsdk-apps/contracts";

/** Object dictionaries have no rules-defined insertion order. Explicit zone/seat arrays do. */
export function orderedObjects(state: RulesState): GameObject[] {
  return Object.values(state.objects).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
