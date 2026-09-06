import type { ExecutionRegistry, RulesState, SpellProgram } from "@iwsdk-apps/contracts";
import { card, emit, hit, move, object, requireRule } from "./common";

type StackSpellDomain = "spell" | "creature-spell" | "noncreature-spell";
export function isStackSpellDomain(target: SpellProgram["target"]): target is StackSpellDomain {
  return target === "spell" || target === "creature-spell" || target === "noncreature-spell";
}

/** CR112.1/115.5: target a current spell incarnation, never a stack ability or the source itself. */
export function stackSpellTargets(
  state: RulesState,
  release: ExecutionRegistry,
  domain: StackSpellDomain,
  source: string | null,
): string[] {
  return state.stack.flatMap((entry) => {
    if (entry.kind !== "spell" || entry.objectId === source) return [];
    const spell = state.objects[entry.objectId];
    if (!spell || spell.zone !== "stack") return [];
    const creature = card(state, release, spell.id).types.includes("Creature");
    return domain === "spell" ||
      (domain === "creature-spell" && creature) ||
      (domain === "noncreature-spell" && !creature)
      ? [spell.id]
      : [];
  });
}

/** CR701.6: countering removes only this spell, pays no refund, and resolves none of its effects. */
export function counterSpell(
  state: RulesState,
  release: ExecutionRegistry,
  source: string,
  target: string,
): void {
  requireRule(
    stackSpellTargets(state, release, "spell", source).includes(target),
    "The counter effect requires another current spell on the stack.",
  );
  const before = object(state, target);
  const counter = object(state, source);
  const grave = move(state, target, "graveyard", "counter spell effect");
  emit(state, "SpellCountered", {
    source,
    sourceOwner: counter.owner,
    sourceController: counter.controller,
    before: target,
    after: grave.id,
    definition: before.definition,
    owner: before.owner,
    controller: before.controller,
  });
  for (const rule of ["112.1", "115.5", "701.6a", "701.6b"]) hit(state, `rule:${rule}`);
  hit(state, `card:${before.definition}:countered`);
}
