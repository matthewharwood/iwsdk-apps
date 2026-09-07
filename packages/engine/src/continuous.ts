import type { CreatureModifier, ExecutionRegistry, RulesState } from "@iwsdk-apps/contracts";
import { emit, hit } from "./common";
import { type InstructionHost, instructionSource, spellInstructionHost } from "./instruction-host";

/** Resolution creates a durable effect independent of the spell's later zone or owner departure. */
export function createCreatureModifier(
  state: RulesState,
  registry: ExecutionRegistry,
  sourceId: string,
  target: string,
  programIndex: number,
  modifier: CreatureModifier,
): void {
  createHostCreatureModifier(
    state,
    spellInstructionHost(state, registry, sourceId),
    target,
    programIndex,
    modifier,
  );
}
export function createHostCreatureModifier(
  state: RulesState,
  host: InstructionHost,
  target: string,
  programIndex: number,
  modifier: CreatureModifier,
): void {
  const { source, sourceVersion, controller } = instructionSource(host);
  const eventIndex = state.eventSequence;
  const id = `${state.manifest.id}:continuous:${eventIndex}:${programIndex}`;
  state.continuousEffects.push({
    id,
    source: structuredClone(source),
    sourceVersion,
    controller,
    programIndex,
    eventIndex,
    affectedObject: target,
    expiresAfterTurn: state.turn,
    modifier: structuredClone(modifier),
    ...(host.kind === "activated-ability" ? { activation: structuredClone(host.ability) } : {}),
  });
  emit(state, "ContinuousEffectCreated", { effect: id, source: source.id, target, programIndex });
  hit(state, "rule:611.2a");
  hit(state, "rule:611.2c");
  if (modifier.keywords.length) hit(state, "rule:613.1f");
  if (modifier.powerDelta || modifier.toughnessDelta) hit(state, "rule:613.4c");
}

/** Called in the same cleanup action that removes marked damage, before the next SBA check. */
export function expireTurnEffects(state: RulesState): void {
  const ended = state.continuousEffects.filter((effect) => effect.expiresAfterTurn <= state.turn);
  state.continuousEffects = state.continuousEffects.filter(
    (effect) => effect.expiresAfterTurn > state.turn,
  );
  if (ended.length)
    emit(state, "ContinuousEffectsExpired", { effects: ended.map((effect) => effect.id) });
}
