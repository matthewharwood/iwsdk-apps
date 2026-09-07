import type { CardDefinition, ExecutionRegistry, RulesState } from "@iwsdk-apps/contracts";
import { isLegalSpellTarget, legalSpellTargets } from "./effects";
import { legalCreatureTargets } from "./targeting";
export function castTargetKind(card: CardDefinition): string | null {
  return card.attachmentProgram?.schema === "commander-aura/1"
    ? "creature"
    : (card.spellProgram?.target ?? null);
}
export function legalCastTargets(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
  card: CardDefinition,
  source: string,
): { cards: string[]; players: string[] } {
  if (card.attachmentProgram?.schema === "commander-aura/1")
    return { cards: legalCreatureTargets(state, registry, actor), players: [] };
  return card.spellProgram
    ? legalSpellTargets(state, registry, actor, card.spellProgram, source)
    : { cards: [], players: [] };
}
export function isLegalCastTarget(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
  card: CardDefinition,
  target: string | null,
  source: string,
): boolean {
  if (card.attachmentProgram?.schema === "commander-aura/1")
    return target !== null && legalCreatureTargets(state, registry, actor).includes(target);
  return card.spellProgram
    ? isLegalSpellTarget(state, registry, actor, card.spellProgram, target, source)
    : target === null;
}
