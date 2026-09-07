import type { DamageHost, PendingDamageFrame, RulesState } from "@iwsdk-apps/contracts";
import { emit, hit, object, player } from "./common";
import { checkedDamageNumber } from "./damage-domain";

function add(values: Map<string, number>, key: string, amount: number): void {
  values.set(key, checkedDamageNumber((values.get(key) ?? 0) + amount));
}
/** Compute and check the entire result before publishing any part of simultaneous damage. */
export function commitDamageResults(
  state: RulesState,
  host: DamageHost,
  occurrences: PendingDamageFrame["occurrences"],
): void {
  const positive = occurrences.filter((entry) => entry.amount > 0);
  const life = new Map<string, number>();
  const marked = new Map<string, number>();
  const commander = new Map<string, Map<string, number>>();
  for (const { original, amount } of positive) {
    const { source, recipient } = original;
    if (recipient.kind === "player") {
      add(life, recipient.id, -amount);
      if (host.kind === "combat-step" && source.object.commander) {
        const totals = commander.get(recipient.id) ?? new Map<string, number>();
        add(totals, source.object.lineage, amount);
        commander.set(recipient.id, totals);
      }
    } else add(marked, recipient.id, amount);
    if (source.lifelink) add(life, source.object.controller, amount);
  }
  for (const [id, delta] of life) checkedDamageNumber(player(state, id).life + delta);
  for (const [id, delta] of marked) checkedDamageNumber(object(state, id).damage + delta);
  for (const [id, totals] of commander)
    for (const [lineage, delta] of totals)
      checkedDamageNumber((player(state, id).commanderDamage[lineage] ?? 0) + delta);
  for (const [id, delta] of life) player(state, id).life += delta;
  for (const [id, delta] of marked) object(state, id).damage += delta;
  for (const [id, totals] of commander)
    for (const [lineage, delta] of totals) {
      const seat = player(state, id);
      seat.commanderDamage[lineage] = (seat.commanderDamage[lineage] ?? 0) + delta;
      hit(state, "rule:903.10a");
    }
  recordDamageFacts(state, host, positive);
  if (host.kind === "combat-step") {
    state.combat.allocations = [];
    if (positive.length > 0) {
      emit(state, "CombatDamageDealt", {
        firstStrike: host.step === "first-strike-damage",
        assignments: positive.map(({ original, amount }) => ({
          source: original.source.object.id,
          target: original.recipient.id,
          amount,
          controller: original.source.object.controller,
          lineage: original.source.object.lineage,
          commander: original.source.object.commander,
          playerTarget: original.recipient.kind === "player" ? original.recipient.id : null,
          deathtouch: original.source.deathtouch,
          lifelink: original.source.lifelink,
        })),
      });
      hit(state, "rule:510.2");
    }
  }
}

function recordDamageFacts(
  state: RulesState,
  host: DamageHost,
  positive: PendingDamageFrame["occurrences"],
): void {
  for (const { original, amount } of positive) {
    const { source, recipient } = original;
    if (recipient.kind === "creature" && source.deathtouch)
      object(state, recipient.id).deathtouchDamage = true;
    if (host.kind === "combat-step") {
      if (source.deathtouch) hit(state, "rule:702.2");
      if (source.lifelink) hit(state, "rule:702.15");
    }
    if (host.kind === "spell-instruction") {
      if (source.lifelink) {
        emit(state, "LifeGained", {
          player: source.object.controller,
          amount,
          source: source.object.id,
        });
        hit(state, "rule:119.3");
        hit(state, "rule:120.3f");
      }
      hit(state, recipient.kind === "player" ? "rule:120.3a" : "rule:120.3e");
      emit(state, "NoncombatDamageDealt", {
        source: source.object.id,
        target: recipient.id,
        amount,
      });
    }
  }
}
