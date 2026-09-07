import type {
  ExecutionRegistry,
  GameObject,
  RulesState,
  StaticCreatureBonus,
} from "@iwsdk-apps/contracts";
import { objectBase } from "./object-definitions";

/**
 * Closed layer-prefix facts: no admitted processor changes control, type, supertype,
 * subtype, or intrinsic abilities in earlier layers. Adding one requires extending
 * this lens first; derived P/T must never be an input to this prefix.
 */
export type PreLayer7cObject = {
  id: string;
  zone: GameObject["zone"];
  controller: string;
  types: readonly string[];
  subtypes: readonly string[];
  supertypes: readonly string[];
  staticPrograms: readonly StaticCreatureBonus[];
};
export function preLayer7cObject(
  registry: ExecutionRegistry,
  object: GameObject,
): PreLayer7cObject {
  const base = objectBase(registry, object);
  return {
    id: object.id,
    zone: object.zone,
    controller: object.controller,
    types: base.types,
    subtypes: base.subtypes,
    supertypes: base.supertypes,
    staticPrograms: object.token
      ? []
      : (registry.definitions[object.definition]?.staticPrograms ?? []),
  };
}
function applies(
  source: PreLayer7cObject,
  target: PreLayer7cObject,
  program: StaticCreatureBonus,
): boolean {
  if (
    source.zone !== "battlefield" ||
    target.zone !== "battlefield" ||
    source.controller !== target.controller ||
    !target.types.includes("Creature") ||
    (program.excludeSource && source.id === target.id)
  )
    return false;
  switch (program.predicate.kind) {
    case "all":
      return true;
    case "legendary":
      return target.supertypes.includes("Legendary");
    case "subtype":
      return target.subtypes.includes(program.predicate.subtype);
  }
}
/** Live sources only (604.7): never LKI, fixed recipient snapshots, or durable caches. */
export function staticPowerToughnessBonus(
  state: RulesState,
  registry: ExecutionRegistry,
  targetObject: GameObject,
): { power: number; toughness: number } {
  const target = preLayer7cObject(registry, targetObject);
  const total = { power: 0, toughness: 0 };
  if (target.zone !== "battlefield" || !target.types.includes("Creature")) return total;
  for (const object of Object.values(state.objects)) {
    // The closed source language never puts static abilities on token templates.
    if (
      object.zone !== "battlefield" ||
      object.token ||
      !registry.definitions[object.definition]?.staticPrograms
    )
      continue;
    const source = preLayer7cObject(registry, object);
    for (const program of source.staticPrograms) {
      if (!applies(source, target, program)) continue;
      total.power += program.powerDelta;
      total.toughness += program.toughnessDelta;
    }
  }
  // Constant additions commute. Enumeration order is not a claimed rules timestamp.
  return total;
}
