import type { ExecutionRegistry, Response, RulesState } from "@iwsdk-apps/contracts";
import {
  card,
  creatures,
  definition,
  emit,
  hit,
  move,
  object,
  player,
  RulesError,
  removeFromLists,
  request,
  requireRule,
  toughness,
} from "./common";

function lossReason(state: RulesState, actor: string): string | null {
  const seat = player(state, actor);
  if (seat.life <= 0) return "life-total";
  if (seat.drawnFromEmptyLibrary) return "empty-library-draw";
  if (seat.poison >= 10) return "poison";
  if (Object.values(seat.commanderDamage).some((amount) => amount >= 21))
    return "commander-combat-damage";
  return null;
}
function eliminate(state: RulesState, losses: { player: string; reason: string }[]): void {
  for (const entry of losses) {
    const seat = player(state, entry.player);
    seat.lost = true;
    seat.lossReason = entry.reason;
  }
  const lost = new Set(losses.map((entry) => entry.player));
  for (const entry of orderedObjects(state)) {
    if (lost.has(entry.owner)) {
      removeFromLists(state, entry.id);
      delete state.objects[entry.id];
    } else if (lost.has(entry.controller)) {
      // Control-effect provenance is required before this branch can be adjudicated.
      throw new RulesError(
        "UnsupportedMechanic",
        "Player departure with foreign controlled objects requires control-effect history.",
      );
    }
  }
  state.combat.attacks = state.combat.attacks.filter(
    (entry) => !lost.has(entry.defender) && state.objects[entry.attacker],
  );
  state.combat.blocks = state.combat.blocks.filter(
    (entry) => state.objects[entry.blocker] && state.objects[entry.attacker],
  );
  emit(state, "PlayersLostBatch", { losses });
  hit(state, "rule:800.4a");
}
function determineOutcome(state: RulesState): void {
  const remaining = state.players.filter((seat) => !seat.lost);
  if (remaining.length > 1) return;
  const winner = remaining[0];
  state.outcome = winner
    ? { kind: "win", winner: winner.id, reason: "all-opponents-left" }
    : { kind: "draw", reason: "all-players-lost-simultaneously" };
  state.decision = null;
  emit(state, "GameFinished", state.outcome);
  hit(state, winner ? "rule:104.2a" : "rule:104.4a");
}
function commanderChoice(state: RulesState): boolean {
  const eligible = orderedObjects(state).filter(
    (entry) =>
      entry.commander && !entry.commanderMoveOffered && ["graveyard", "exile"].includes(entry.zone),
  );
  const start = state.players.findIndex((seat) => seat.id === state.activePlayer);
  const order = [...state.players.slice(start), ...state.players.slice(0, start)].map(
    (seat) => seat.id,
  );
  eligible.sort(
    (a, b) =>
      order.indexOf(a.owner) - order.indexOf(b.owner) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const first = eligible[0];
  if (!first) return false;
  state.frames.push({
    kind: "commander-zone",
    cards: eligible.map((entry) => entry.id),
    resume: "checkpoint",
  });
  request(state, "commander-zone", first.owner, {
    cards: [first.id],
    context: "Move your commander from this zone to the command zone?",
  });
  return true;
}
/** Simultaneous SBA batches precede all ordinary priority decisions. */
function recordDeathRules(state: RulesState, release: ExecutionRegistry, id: string): void {
  const entry = object(state, id);
  const health = toughness(state, release, id);
  if (health <= 0) hit(state, "rule:704.5f");
  else {
    if (entry.damage >= health) hit(state, "rule:704.5g");
    if (entry.deathtouchDamage) hit(state, "rule:704.5h");
  }
}
export function checkpoint(
  state: RulesState,
  release: ExecutionRegistry,
): { waiting: boolean; changed: boolean } {
  let changed = false;
  for (let iteration = 0; iteration < 1000; iteration++) {
    const dead = creatures(state, release).filter((entry) => {
      const current = definition(release, entry.definition);
      const health = toughness(state, release, entry.id);
      return (
        health <= 0 ||
        (!current.keywords.includes("indestructible") &&
          (entry.damage >= health || entry.deathtouchDamage))
      );
    });
    const losses = state.players
      .filter((seat) => !seat.lost)
      .flatMap((seat) => {
        const reason = lossReason(state, seat.id);
        return reason ? [{ player: seat.id, reason }] : [];
      });
    if (dead.length === 0 && losses.length === 0) break;
    const moved: { before: string; after: string }[] = [];
    for (const entry of dead) {
      recordDeathRules(state, release, entry.id);
      const after = move(state, entry.id, "graveyard", "state-based creature death");
      moved.push({ before: entry.id, after: after.id });
      hit(state, `card:${entry.definition}:dies`);
    }
    if (moved.length) {
      emit(state, "CreaturesDiedBatch", { objects: moved });
    }
    if (losses.length) eliminate(state, losses);
    changed = true;
    determineOutcome(state);
    if (state.outcome.kind !== "ongoing") return { waiting: false, changed };
    if (iteration === 999)
      throw new RulesError(
        "UnsupportedMechanic",
        "Unbounded automatic checkpoint requires a resumable loop policy.",
      );
  }
  // Legend choice is never silently approximated by keeping a convenient object.
  const legends = new Set<string>();
  for (const entry of creatures(state, release)) {
    const current = card(state, release, entry.id);
    if (!current.supertypes.includes("Legendary")) continue;
    const key = `${entry.controller}:${current.name}`;
    if (legends.has(key))
      throw new RulesError(
        "UnsupportedMechanic",
        "Legend-rule selection is not implemented in this content release.",
      );
    legends.add(key);
  }
  return { waiting: commanderChoice(state), changed };
}
export function answerCommanderZone(state: RulesState, actor: string, response: Response): boolean {
  requireRule(response.kind === "commander-zone", "Expected commander destination choice");
  const frame = state.frames.at(-1);
  requireRule(frame?.kind === "commander-zone", "No commander-zone continuation");
  const id = frame.cards.shift();
  requireRule(id !== undefined, "Missing pending commander object");
  const current = object(state, id);
  requireRule(current.owner === actor, "Only the commander owner may choose its destination.");
  current.commanderMoveOffered = true;
  if (response.move) move(state, id, "command", "commander state-based destination");
  hit(state, "rule:903.9a");
  const next = frame.cards[0];
  if (next) {
    request(state, "commander-zone", object(state, next).owner, { cards: [next] });
    return false;
  }
  state.frames.pop();
  return true;
}

import { orderedObjects } from "./object-order";
