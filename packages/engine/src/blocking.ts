import type { ExecutionRegistry, RulesState } from "@iwsdk-apps/contracts";
import { characteristics } from "./characteristics";
import { permanentBase } from "./common";

const walks = [
  ["plainswalk", "Plains"],
  ["islandwalk", "Island"],
  ["swampwalk", "Swamp"],
  ["mountainwalk", "Mountain"],
  ["forestwalk", "Forest"],
] as const;

/** Pair restrictions at declaration time. Requirements and multi-block rules are separate. */
export function blockingRestriction(
  state: RulesState,
  registry: ExecutionRegistry,
  attackerId: string,
  blockerId: string,
  defender: string,
): string | null {
  const attacker = characteristics(state, registry, attackerId);
  const blocker = characteristics(state, registry, blockerId);
  const attackBase = permanentBase(state, registry, attackerId);
  const blockBase = permanentBase(state, registry, blockerId);
  const attackRestrictions = attackBase.blockingRestrictions ?? [];
  const blockRestrictions = blockBase.blockingRestrictions ?? [];
  if (blockRestrictions?.includes("cannot-block")) return "This creature cannot block.";
  if (attackRestrictions?.includes("cannot-be-blocked")) return "This attacker cannot be blocked.";
  if (blockRestrictions?.includes("blocks-only-flying") && !attacker.keywords.includes("flying"))
    return "This creature can block only creatures with flying.";
  if (
    attacker.keywords.includes("flying") &&
    !blocker.keywords.includes("flying") &&
    !blocker.keywords.includes("reach")
  )
    return "A flying attacker requires a blocker with flying or reach.";
  if (attacker.keywords.includes("shadow") !== blocker.keywords.includes("shadow"))
    return "Shadow creatures can block and be blocked only by creatures with shadow.";
  if (attacker.keywords.includes("horsemanship") && !blocker.keywords.includes("horsemanship"))
    return "Horsemanship requires a blocker with horsemanship.";
  if (
    attacker.keywords.includes("fear") &&
    !blockBase.types.includes("Artifact") &&
    !blockBase.colors.includes("B")
  )
    return "Fear requires an artifact creature or a black creature.";
  if (
    attacker.keywords.includes("intimidate") &&
    !blockBase.types.includes("Artifact") &&
    !attackBase.colors.some((color) => color !== "C" && blockBase.colors.includes(color))
  )
    return "Intimidate requires an artifact creature or a creature sharing a color.";
  if (
    attacker.keywords.includes("skulk") &&
    blocker.power !== null &&
    attacker.power !== null &&
    blocker.power > attacker.power
  )
    return "Skulk prevents blocking by a creature with greater current power.";
  for (const [keyword, subtype] of walks) {
    if (!attacker.keywords.includes(keyword)) continue;
    const matchingLand = Object.values(state.objects).some((entry) => {
      if (entry.zone !== "battlefield" || entry.controller !== defender) return false;
      const base = permanentBase(state, registry, entry.id);
      return base.types.includes("Land") && base.subtypes.includes(subtype);
    });
    if (matchingLand)
      return `Landwalk prevents blocking while the defending player controls a ${subtype}.`;
  }
  return null;
}
