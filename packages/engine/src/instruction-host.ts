import type {
  ActivatedAbility,
  ExecutionRegistry,
  GameObject,
  RulesState,
} from "@iwsdk-apps/contracts";
import { card, draw, emit, hit, object, player } from "./common";
import { checkedDamageNumber } from "./damage-domain";

/** Fixed instructions require identity/controller, not fabricated current-or-LKI characteristic values. */
export type InstructionHost =
  | { kind: "spell"; source: GameObject; sourceVersion: string; controller: string }
  | { kind: "activated-ability"; ability: ActivatedAbility };
export function spellInstructionHost(
  state: RulesState,
  registry: ExecutionRegistry,
  source: string,
): InstructionHost {
  return {
    kind: "spell",
    source: structuredClone(object(state, source)),
    sourceVersion: card(state, registry, source).sourceVersion,
    controller: object(state, source).controller,
  };
}
export function instructionSource(host: InstructionHost): {
  source: GameObject;
  sourceVersion: string;
  controller: string;
} {
  return host.kind === "spell" ? host : host.ability;
}
/** Shared controller operations never require the source permanent to remain in play. */
export function applyPlayerInstruction(
  state: RulesState,
  host: InstructionHost,
  recipient: string,
  effect: { kind: "draw" | "gain-life"; amount: number },
): void {
  if (effect.kind === "draw") {
    draw(state, recipient, effect.amount);
    return;
  }
  player(state, recipient).life = checkedDamageNumber(
    player(state, recipient).life + effect.amount,
  );
  emit(state, "LifeGained", {
    player: recipient,
    amount: effect.amount,
    source: instructionSource(host).source.id,
  });
  hit(state, "rule:119.3");
}
