import type {
  ExecutionRegistry,
  RulesState,
  SpellEffect,
  SpellProgram,
} from "@iwsdk-apps/contracts";
import { characteristics } from "./characteristics";
import { card, draw, emit, hit, move, object, permanentBase, player, RulesError } from "./common";
import { createCreatureModifier } from "./continuous";
import { orderedObjects } from "./object-order";
import { beginReturnResolution } from "./return-resolution";
import { counterSpell, isStackSpellDomain, stackSpellTargets } from "./stack-spells";
import { createTokens } from "./tokens";

/** Complete domains for the supported exact single-target recipes. */
export function legalSpellTargets(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  program: SpellProgram,
  source: string | null = null,
): { cards: string[]; players: string[] } {
  if (isStackSpellDomain(program.target)) {
    if (source === null)
      throw new RulesError("Invariant", "Stack target lookup requires its source incarnation");
    return { cards: stackSpellTargets(state, release, program.target, source), players: [] };
  }
  if (program.target === "player")
    return {
      cards: [],
      players: state.players.filter((seat) => !seat.lost).map((seat) => seat.id),
    };
  if (program.target === "creature") {
    const cards = orderedObjects(state)
      .filter((entry) => {
        if (entry.zone !== "battlefield") return false;
        const current = permanentBase(state, release, entry.id);
        return (
          current.types.includes("Creature") &&
          !characteristics(state, release, entry.id).keywords.includes("shroud") &&
          !(
            entry.controller !== actor &&
            characteristics(state, release, entry.id).keywords.includes("hexproof")
          )
        );
      })
      .map((entry) => entry.id);
    return { cards, players: [] };
  }
  return { cards: [], players: [] };
}

export function isLegalSpellTarget(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  program: SpellProgram,
  target: string | null,
  source: string | null = null,
): boolean {
  if (program.target === null) return target === null;
  if (target === null) return false;
  const legal = legalSpellTargets(state, release, actor, program, source);
  return legal.cards.includes(target) || legal.players.includes(target);
}

function gainLife(state: RulesState, recipient: string, amount: number, source: string): void {
  player(state, recipient).life += amount;
  emit(state, "LifeGained", { player: recipient, amount, source });
  hit(state, "rule:119.3");
}
function spellDamage(
  state: RulesState,
  release: ExecutionRegistry,
  source: string,
  target: string,
  amount: number,
): void {
  const spell = object(state, source);
  const recipient = state.players.find((seat) => seat.id === target);
  if (recipient) {
    recipient.life -= amount;
    hit(state, "rule:120.3a");
  } else {
    const creature = object(state, target);
    creature.damage += amount;
    if (characteristics(state, release, source).keywords.includes("deathtouch"))
      creature.deathtouchDamage = true;
    hit(state, "rule:120.3e");
  }
  // Damage results occur before a checkpoint; noncombat damage never increments commander damage.
  if (characteristics(state, release, source).keywords.includes("lifelink")) {
    gainLife(state, spell.controller, amount, source);
    hit(state, "rule:120.3f");
  }
  emit(state, "NoncombatDamageDealt", { source, target, amount });
}
function applyRemoval(
  state: RulesState,
  release: ExecutionRegistry,
  source: string,
  target: string | null,
  effect: Extract<SpellEffect, { kind: "destroy" | "exile" }>,
): void {
  if (target === null) throw new RulesError("Invariant", "Removal program has no chosen target");
  const creature = object(state, target);
  const definition = permanentBase(state, release, target);
  if (
    effect.kind === "destroy" &&
    characteristics(state, release, target).keywords.includes("indestructible")
  ) {
    emit(state, "DestructionDidNotOccur", { source, target, reason: "indestructible" });
    hit(state, "rule:702.12b");
    return;
  }
  const destination = effect.kind === "destroy" ? "graveyard" : "exile";
  const moved = move(state, target, destination, `${effect.kind} spell effect`);
  emit(state, effect.kind === "destroy" ? "CreatureDestroyed" : "CreatureExiled", {
    source,
    before: target,
    after: moved.id,
    owner: creature.owner,
    definition: definition.id,
  });
  hit(state, effect.kind === "destroy" ? "rule:701.8a" : "rule:701.13a");
  if (effect.kind === "destroy") {
    hit(state, "rule:700.4");
    hit(state, `${creature.token ? "token" : "card"}:${definition.id}:dies`);
  }
  return;
}

function applyEffect(
  state: RulesState,
  release: ExecutionRegistry,
  source: string,
  target: string | null,
  effect: Exclude<SpellEffect, { kind: "create-token" }>,
  programIndex: number,
): void {
  if (effect.kind === "return-to-hand")
    throw new RulesError("Invariant", "Return instructions require resumable resolution");
  if (effect.kind === "counter") {
    if (target === null) throw new RulesError("Invariant", "Counter program has no target");
    counterSpell(state, release, source, target);
    return;
  }
  if (effect.kind === "modify-creature") {
    if (target === null) throw new RulesError("Invariant", "Modifier program has no target");
    createCreatureModifier(state, release, source, target, programIndex, effect);
    return;
  }
  if (effect.kind === "destroy" || effect.kind === "exile") {
    applyRemoval(state, release, source, target, effect);
    return;
  }
  if (effect.kind === "damage") {
    if (target === null) throw new RulesError("Invariant", "Damage program has no chosen target");
    spellDamage(state, release, source, target, effect.amount);
    return;
  }
  const recipient = effect.recipient === "controller" ? object(state, source).controller : target;
  if (recipient === null) throw new RulesError("Invariant", "Player effect has no recipient");
  if (effect.kind === "draw") draw(state, recipient, effect.amount);
  else gainLife(state, recipient, effect.amount, source);
}

/** No priority/SBA interruption occurs between instructions of one resolving spell (CR 704.4). */
export function resolveSpellProgram(
  state: RulesState,
  release: ExecutionRegistry,
  source: string,
): boolean {
  const spell = object(state, source);
  const current = card(state, release, source);
  const program = current.spellProgram;
  if (!program) throw new RulesError("UnsupportedMechanic", `No spell program: ${current.name}`);
  if (!spell.spellState)
    throw new RulesError("Invariant", "A cast spell has no saved target state");
  const target = spell.spellState.target;
  if (!isLegalSpellTarget(state, release, spell.controller, program, target, source)) {
    const grave = move(state, source, "graveyard", "all spell targets became illegal");
    emit(state, "SpellDidNotResolve", {
      source,
      target,
      graveyardObject: grave.id,
      reason: "all-targets-illegal",
    });
    hit(state, "rule:608.2b");
    hit(state, `card:${current.id}:illegal-target`);
    return true;
  }
  if (program.effects[0]?.kind === "return-to-hand") {
    if (target === null) throw new RulesError("Invariant", "Return program has no chosen target");
    return beginReturnResolution(state, release, spell, program, target);
  }
  for (const [index, effect] of program.effects.entries()) {
    if (effect.kind === "create-token") createTokens(state, release, source, effect, index);
    else applyEffect(state, release, source, target, effect, index);
  }
  const grave = move(state, source, "graveyard", "instant or sorcery resolution completed");
  emit(state, "SpellResolved", {
    source,
    definition: current.id,
    target,
    graveyardObject: grave.id,
  });
  hit(state, "rule:608.2c");
  hit(state, "rule:608.2n");
  hit(state, `card:${current.id}:resolve`);
  return true;
}
