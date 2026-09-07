import type { DerivedCharacteristics, ExecutionRegistry, RulesState } from "@iwsdk-apps/contracts";

import { objectBase } from "./object-definitions";

/** Admitted layer 6 keyword additions and layer 7c additive modifiers; no generic layer claim. */
export function characteristics(
  state: RulesState,
  registry: ExecutionRegistry,
  objectId: string,
): DerivedCharacteristics {
  const object = state.objects[objectId];
  const definition = object && objectBase(registry, object);
  if (!object || !definition) throw new Error(`Unavailable characteristics: ${objectId}`);
  const counters = (object.counters["+1/+1"] ?? 0) - (object.counters["-1/-1"] ?? 0);
  let power = definition.power === null ? null : definition.power + counters;
  let toughness = definition.toughness === null ? null : definition.toughness + counters;
  const keywords = new Set(definition.keywords);
  for (const effect of state.continuousEffects) {
    // The affected incarnation is fixed at resolution; control changes do not retarget it.
    if (effect.affectedObject !== objectId) continue;
    for (const keyword of effect.modifier.keywords) keywords.add(keyword);
    if (power !== null) power += effect.modifier.powerDelta;
    if (toughness !== null) toughness += effect.modifier.toughnessDelta;
  }
  return { power, toughness, keywords: [...keywords] };
}
