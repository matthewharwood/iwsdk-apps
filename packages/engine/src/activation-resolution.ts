import type {
  ActivatedAbility,
  CreatureModifier,
  ExecutionRegistry,
  RulesState,
} from "@iwsdk-apps/contracts";
import { isLegalActivationTarget } from "./activation";
import { emit, hit, object, permanentBase, RulesError } from "./common";
import { createHostCreatureModifier } from "./continuous";
import { applyPlayerInstruction, type InstructionHost } from "./instruction-host";

function finish(state: RulesState, ability: ActivatedAbility, resolved: boolean): void {
  const top = state.stack.pop();
  if (top?.kind !== "activated-ability" || top.abilityId !== ability.id)
    throw new RulesError("Invariant", "Resolving activation left the top of the stack");
  if (state.activatedAbilities) delete state.activatedAbilities[ability.id];
  emit(state, resolved ? "ActivatedAbilityResolved" : "ActivatedAbilityDidNotResolve", {
    ability: ability.id,
    source: ability.source.id,
    definition: ability.source.definition,
    controller: ability.controller,
    program: ability.program.id,
    target: ability.target,
    ...(resolved ? {} : { reason: "all-targets-illegal" }),
  });
  hit(state, resolved ? "rule:608.2n" : "rule:608.2b");
  hit(
    state,
    `card:${ability.source.definition}:ability:${ability.program.id}:${resolved ? "resolve" : "illegal-target"}`,
  );
}
export function resolveActivatedAbility(state: RulesState, registry: ExecutionRegistry): boolean {
  const top = state.stack.at(-1);
  if (top?.kind !== "activated-ability")
    throw new RulesError("Invariant", "No activated ability to resolve");
  const ability = state.activatedAbilities?.[top.abilityId];
  if (!ability?.payment || state.frames.length)
    throw new RulesError("Invariant", "Only a completed activation may resolve");
  if (
    !isLegalActivationTarget(state, registry, ability.controller, ability.program, ability.target)
  ) {
    finish(state, ability, false);
    return true;
  }
  const host: InstructionHost = { kind: "activated-ability", ability },
    effect = ability.program.effects[0];
  if (effect.kind === "draw" || effect.kind === "gain-life") {
    applyPlayerInstruction(state, host, ability.controller, effect);
  } else if (effect.kind === "tap") {
    if (ability.target === null)
      throw new RulesError("Invariant", "Tap instruction lost its target");
    const target = object(state, ability.target);
    if (!target.tapped) {
      target.tapped = true;
      emit(state, "PermanentTappedByAbility", {
        ability: ability.id,
        source: ability.source.id,
        target: target.id,
      });
    }
    hit(state, "rule:701.26a");
  } else {
    const target = effect.recipient === "source" ? ability.source.id : ability.target;
    if (target === null) throw new RulesError("Invariant", "Modifier instruction lost its target");
    // A self reference is not a target and never follows a new zone incarnation.
    if (
      state.objects[target]?.zone === "battlefield" &&
      permanentBase(state, registry, target).types.includes("Creature")
    ) {
      const modifier: CreatureModifier = {
        kind: effect.kind,
        powerDelta: effect.powerDelta,
        toughnessDelta: effect.toughnessDelta,
        keywords: [...effect.keywords],
        duration: effect.duration,
      };
      createHostCreatureModifier(state, host, target, 0, modifier);
    }
    hit(state, "rule:400.7");
    hit(state, "rule:115.10a");
  }
  finish(state, ability, true);
  return true;
}
