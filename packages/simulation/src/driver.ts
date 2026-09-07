import {
  type Cost,
  type Decision,
  emptyMana,
  MANA_COLORS,
  type Mana,
  type PlayerObservation,
  type Response,
} from "@iwsdk-apps/contracts";
import { activationChoice, priorityActivation } from "./activation-driver";

export const DRIVER_VERSION = "observed-combat/13";
export type Driver = (observation: PlayerObservation, seed: number) => Response | Promise<Response>;
type Payment = Extract<Response, { kind: "payment" }>;
type VisibleObject = PlayerObservation["objects"][number];

/** A bipartite matching assigns distinct sources to colored requirements before generic mana. */
export function findPayment(
  cost: Cost,
  pool: Mana,
  sources: Decision["manaSources"],
): Payment | null {
  const spend = emptyMana();
  const needs: (typeof MANA_COLORS)[number][] = [];
  for (const color of MANA_COLORS) {
    spend[color] = Math.min(pool[color], cost[color]);
    for (let n = spend[color]; n < cost[color]; n++) needs.push(color);
  }
  const assignments = new Map<number, number>();
  function assign(need: number, visited: Set<number>): boolean {
    const color = needs[need];
    if (!color) return false;
    for (const [index, source] of sources.entries()) {
      if (visited.has(index) || !source.colors.includes(color)) continue;
      visited.add(index);
      const previous = assignments.get(index);
      if (previous === undefined || assign(previous, visited)) {
        assignments.set(index, need);
        return true;
      }
    }
    return false;
  }
  for (const [index] of needs.entries()) if (!assign(index, new Set())) return null;
  const selected: Payment["sources"] = [];
  for (const [index, need] of assignments) {
    const source = sources[index];
    const color = needs[need];
    if (!source || !color) throw new Error("Invalid mana assignment");
    selected.push({ object: source.object, color });
    spend[color]++;
  }
  let generic = cost.generic;
  for (const color of MANA_COLORS) {
    const available = Math.max(0, pool[color] - cost[color]);
    const amount = Math.min(generic, available);
    spend[color] += amount;
    generic -= amount;
  }
  for (const [index, source] of sources.entries()) {
    if (!generic) break;
    if (assignments.has(index)) continue;
    const color = source.colors[0];
    if (!color) continue;
    selected.push({ object: source.object, color });
    spend[color]++;
    generic--;
  }
  return generic ? null : { kind: "payment", sources: selected, spend };
}

/** Stateless seeded tie breaking: save/resume does not need a hidden driver RNG cursor. */
function rank(seed: number, revision: number, id: string): number {
  let value = (seed ^ revision) >>> 0;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619) >>> 0;
  return value;
}
function strength(object: VisibleObject): number {
  return Math.max(0, object.characteristics.power ?? 0);
}
function blockers(observation: PlayerObservation, decision: Decision): Response {
  const available = observation.objects.filter((object) => decision.cards.includes(object.id));
  const blocks: Extract<Response, { kind: "block" }>["blocks"] = [];
  if (!decision.blockDomain)
    throw new Error("DriverUnsupportedDecision: missing authoritative blocking domain");
  for (const domain of decision.blockDomain) {
    const attacker = observation.objects.find((object) => object.id === domain.attacker);
    if (!attacker) throw new Error("Attacker absent from public observation");
    const count = domain.minimumBlockers;
    const eligible = available.filter((object) => domain.blockers.includes(object.id));
    // Trading is deliberately simple, but it uses only entitled public characteristics.
    eligible.sort((a, b) => strength(b) - strength(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (eligible.length < count) continue;
    for (const chosen of eligible.slice(0, count)) {
      blocks.push({ blocker: chosen.id, attacker: domain.attacker });
      available.splice(available.indexOf(chosen), 1);
    }
  }
  return { kind: "block", blocks };
}
function damage(decision: Decision): Response {
  const allocations: Extract<Response, { kind: "damage" }>["allocations"] = [];
  for (const domain of decision.damageDomain) {
    let remaining = domain.power;
    for (const target of domain.targets) {
      const amount = Math.min(remaining, target.kind === "creature" ? target.lethal : remaining);
      if (amount) allocations.push({ source: domain.source, target: target.id, amount });
      remaining -= amount;
    }
    const remainderTarget = domain.tramplePlayer ?? domain.targets[0]?.id;
    if (remaining && remainderTarget) {
      const existing = allocations.find(
        (entry) => entry.source === domain.source && entry.target === remainderTarget,
      );
      if (existing) existing.amount += remaining;
      else allocations.push({ source: domain.source, target: remainderTarget, amount: remaining });
    }
  }
  return { kind: "damage", allocations };
}
function damageReplacement(
  observation: PlayerObservation,
  decision: Decision,
  seed: number,
): Response {
  const choice = decision.damageReplacement;
  if (!choice) throw new Error("Damage replacement decision lacks its current owned event");
  const candidates = choice.occurrences.flatMap((occurrence) =>
    occurrence.effects.map((effect) => ({ occurrence: occurrence.id, effect: effect.id })),
  );
  // Mandatory effects remain player choices. Seeded ordering is policy, not rules precedence.
  const identity = (candidate: (typeof candidates)[number]) =>
    `${choice.eventId}:${choice.version}:${candidate.occurrence}:${candidate.effect}`;
  candidates.sort(
    (a, b) =>
      rank(seed, observation.revision, identity(a)) -
        rank(seed, observation.revision, identity(b)) ||
      (identity(a) < identity(b) ? -1 : identity(a) > identity(b) ? 1 : 0),
  );
  const selected = candidates[0];
  if (!selected) throw new Error("Damage replacement decision has no applicable effect");
  return {
    kind: "damage-replacement",
    eventId: choice.eventId,
    eventVersion: choice.version,
    occurrenceId: selected.occurrence,
    effectId: selected.effect,
  };
}
// Ordinary counters are held until an opposing spell in their printed domain is visible.
// This is driver policy; the rules continue to allow targeting one's own spells.
function usefulCounterspell(observation: PlayerObservation, candidate: VisibleObject): boolean {
  const program = candidate.card?.spellProgram;
  if (!program?.effects.some((effect) => effect.kind === "counter")) return true;
  return observation.stack.some((entry) => {
    if (entry.kind !== "spell") return false;
    const target = observation.objects.find((object) => object.id === entry.objectId);
    if (!target || target.controller === observation.player) return false;
    const creature = target.card?.types.includes("Creature") ?? false;
    return (
      program.target === "spell" ||
      (program.target === "creature-spell" && creature) ||
      (program.target === "noncreature-spell" && !creature)
    );
  });
}
function priority(observation: PlayerObservation, decision: Decision, seed: number): Response {
  const actor = observation.players.find((player) => player.id === observation.player);
  if (!actor) throw new Error("Own seat absent from observation");
  const available = observation.objects.filter((object) => decision.cards.includes(object.id));
  const land = available.find((object) => object.card?.types.includes("Land"));
  if (land) return { kind: "land", card: land.id };
  const spells = available.filter((object) => {
    const cost = decision.cardCosts[object.id];
    return (
      object.card &&
      cost &&
      usefulCounterspell(observation, object) &&
      findPayment(cost, actor.mana, decision.manaSources) !== null
    );
  });
  spells.sort(
    (a, b) =>
      (b.card?.manaValue ?? 0) - (a.card?.manaValue ?? 0) ||
      rank(seed, observation.revision, a.id) - rank(seed, observation.revision, b.id),
  );
  const spell = spells[0];
  return spell
    ? { kind: "cast", card: spell.id }
    : (priorityActivation(observation, decision, findPayment) ?? { kind: "pass" });
}

/** All decisions are ordinary commands. This module cannot inspect RulesState or a library. */
export const heuristicDriver: Driver = (observation, seed) => {
  const decision = observation.decision;
  if (!decision || decision.actor !== observation.player)
    throw new Error("Driver has no owned decision");
  switch (decision.kind) {
    case "activation-target":
    case "activation-payment":
      return activationChoice(observation, decision, findPayment);
    case "damage-replacement":
      return damageReplacement(observation, decision, seed);
    case "trigger-order":
      return { kind: "trigger-order", triggers: [...decision.triggers].sort() };
    case "starting-player":
      if (!decision.players.includes(observation.player))
        throw new Error("Starting-player decision omits the chooser's own seat");
      return { kind: "starting-player", player: observation.player };
    case "mulligan":
      return { kind: "mulligan", keep: true };
    case "bottom":
      return { kind: "bottom", cards: decision.cards.slice(0, decision.count) };
    case "discard":
      return { kind: "discard", cards: decision.cards.slice(0, decision.count) };
    case "commander-replacement":
      return { kind: "commander-replacement", move: true };
    case "commander-zone":
      return { kind: "commander-zone", move: true };
    case "priority":
      return priority(observation, decision, seed);
    case "target": {
      const top = observation.stack.at(-1);
      const spell =
        top?.kind === "spell"
          ? observation.objects.find((object) => object.id === top.objectId)
          : undefined;
      if (!spell?.card?.spellProgram || spell.controller !== observation.player)
        throw new Error("Target decision lacks its public announced spell");
      const harmful = spell.card.spellProgram.effects.some(
        (effect) =>
          ["damage", "destroy", "exile", "counter", "return-to-hand"].includes(effect.kind) ||
          (effect.kind === "modify-creature" &&
            (effect.powerDelta < 0 || effect.toughnessDelta < 0)),
      );
      const players = observation.players.filter((player) => decision.players.includes(player.id));
      players.sort(
        (a, b) =>
          Number(a.id === observation.player) * (harmful ? 1 : -1) -
            Number(b.id === observation.player) * (harmful ? 1 : -1) || a.life - b.life,
      );
      const cards = observation.objects.filter((object) => decision.cards.includes(object.id));
      cards.sort(
        (a, b) =>
          (Number(a.controller === observation.player) -
            Number(b.controller === observation.player)) *
            (harmful ? 1 : -1) || strength(b) - strength(a),
      );
      const target = players[0]?.id ?? cards[0]?.id;
      if (!target) throw new Error("Target decision has no legal visible candidate");
      return { kind: "target", target };
    }
    case "trigger-payment": {
      const actor = observation.players.find((player) => player.id === observation.player);
      if (!actor || !decision.cost) throw new Error("Trigger payment decision lacks cost or actor");
      const payment = findPayment(decision.cost, actor.mana, decision.manaSources);
      // This is a policy proposal: the payer may instead decline even with sufficient mana.
      return payment
        ? { kind: "trigger-payment", pay: true, sources: payment.sources, spend: payment.spend }
        : { kind: "trigger-payment", pay: false };
    }
    case "payment": {
      const actor = observation.players.find((player) => player.id === observation.player);
      if (!actor || !decision.cost) throw new Error("Payment decision lacks cost or actor");
      const payment = findPayment(decision.cost, actor.mana, decision.manaSources);
      if (!payment)
        throw new Error("Announced spell cannot be paid from the observed legal sources");
      return payment;
    }
    case "attack": {
      const opponents = observation.players.filter((player) =>
        decision.players.includes(player.id),
      );
      opponents.sort(
        (a, b) =>
          a.life - b.life ||
          rank(seed, observation.revision, a.id) - rank(seed, observation.revision, b.id),
      );
      const defender = opponents[0];
      return {
        kind: "attack",
        attacks: defender
          ? decision.cards
              .filter((id) => {
                const object = observation.objects.find((entry) => entry.id === id);
                return object && strength(object) > 0;
              })
              .map((attacker) => ({ attacker, defender: defender.id }))
          : [],
      };
    }
    case "block":
      return blockers(observation, decision);
    case "damage":
      return damage(decision);
  }
};

export function scriptedDriver(
  script: readonly { actor: string; kind: Decision["kind"]; response: Response }[],
  startingRevision = 0,
): Driver {
  return (observation) => {
    const cursor = observation.revision - startingRevision;
    const entry = script[cursor];
    if (!entry || entry.actor !== observation.player || entry.kind !== observation.decision?.kind)
      throw new Error(`Script diverged at entry ${cursor}`);
    return structuredClone(entry.response);
  };
}
