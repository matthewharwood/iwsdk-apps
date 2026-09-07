import type { ExecutionRegistry, Response, RulesState } from "@iwsdk-apps/contracts";
import { attachmentSbas, detach } from "./attachments";
import { characteristics } from "./characteristics";
import {
  battlefield,
  creatures,
  emit,
  endObjectAttachments,
  hit,
  move,
  object,
  permanentBase,
  player,
  RulesError,
  removeFromLists,
  request,
  requireRule,
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
  removeDepartedTriggers(state, lost);
  if (state.activatedAbilities) {
    const removed = new Set(
      Object.values(state.activatedAbilities)
        .filter((ability) => lost.has(ability.controller))
        .map((ability) => ability.id),
    );
    state.stack = state.stack.filter(
      (entry) => entry.kind !== "activated-ability" || !removed.has(entry.abilityId),
    );
    for (const id of removed) delete state.activatedAbilities[id];
  }
  for (const entry of orderedObjects(state)) {
    if (lost.has(entry.owner)) {
      endObjectAttachments(state, entry.id, "owner left game");
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
/** Reject the unimplemented choice before applying a convenient partial SBA batch. */
function guardDuplicateLegends(state: RulesState, release: ExecutionRegistry): void {
  const legends = new Set<string>();
  for (const entry of battlefield(state)) {
    const current = permanentBase(state, release, entry.id);
    if (!current.supertypes.includes("Legendary")) continue;
    const key = JSON.stringify([entry.controller, current.name]);
    if (legends.has(key))
      throw new RulesError(
        "UnsupportedMechanic",
        "Legend-rule selection is not implemented in this content release.",
      );
    legends.add(key);
  }
}
/** Capture eligibility AND reason from the same pre-batch characteristic view. */
function creatureDeaths(state: RulesState, release: ExecutionRegistry) {
  return creatures(state, release).flatMap((entry) => {
    const current = characteristics(state, release, entry.id);
    const health = current.toughness ?? 0;
    const rules: string[] = [];
    if (health <= 0) rules.push("rule:704.5f");
    else if (!current.keywords.includes("indestructible")) {
      if (entry.damage >= health) rules.push("rule:704.5g");
      if (entry.deathtouchDamage) rules.push("rule:704.5h");
    }
    return rules.length ? [{ entry, rules }] : [];
  });
}
function applyAttachmentSbas(
  state: RulesState,
  attachmentActions: ReturnType<typeof attachmentSbas>,
): void {
  for (const action of attachmentActions) {
    if (state.objects[action.source]?.zone !== "battlefield") continue;
    if (action.kind === "graveyard") {
      move(state, action.source, "graveyard", "state-based illegal Aura");
      hit(state, "rule:704.5m");
    } else {
      detach(state, action.source, "state-based illegal attachment");
      hit(state, "rule:704.5n");
    }
  }
}
function stateBasedActions(
  state: RulesState,
  release: ExecutionRegistry,
): { waiting: boolean; changed: boolean } {
  let changed = false;
  for (let iteration = 0; iteration < 1000; iteration++) {
    guardDuplicateLegends(state, release);
    const dead = creatureDeaths(state, release);
    const attachmentActions = attachmentSbas(state, release);
    // 704.5h/702.2b only consider deathtouch damage since the preceding SBA
    // check. Capture eligibility first, then expire that fact even if protection
    // means this check performs no action. Marked damage remains until cleanup.
    for (const entry of battlefield(state)) entry.deathtouchDamage = false;
    const ceased = orderedObjects(state).filter(
      (entry) => entry.token && entry.zone !== "battlefield",
    );
    const losses = state.players
      .filter((seat) => !seat.lost)
      .flatMap((seat) => {
        const reason = lossReason(state, seat.id);
        return reason ? [{ player: seat.id, reason }] : [];
      });
    if (
      dead.length === 0 &&
      losses.length === 0 &&
      ceased.length === 0 &&
      attachmentActions.length === 0
    )
      break;
    const moved: { before: string; after: string }[] = [];
    for (const { entry, rules } of dead) {
      for (const rule of rules) hit(state, rule);
      const after = move(state, entry.id, "graveyard", "state-based creature death");
      moved.push({ before: entry.id, after: after.id });
      hit(state, `${entry.token ? "token" : "card"}:${entry.definition}:dies`);
    }
    applyAttachmentSbas(state, attachmentActions);
    if (moved.length) {
      emit(state, "CreaturesDiedBatch", { objects: moved });
    }
    for (const entry of ceased) {
      removeFromLists(state, entry.id);
      delete state.objects[entry.id];
    }
    if (ceased.length) {
      emit(state, "TokensCeased", {
        objects: ceased.map((entry) => ({
          object: entry.id,
          definition: entry.definition,
          owner: entry.owner,
          zone: entry.zone,
        })),
      });
      hit(state, "rule:111.7");
      hit(state, "rule:704.5d");
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
  return { waiting: commanderChoice(state), changed };
}

export function checkpoint(
  state: RulesState,
  release: ExecutionRegistry,
): { waiting: boolean; changed: boolean } {
  requireRule(
    !state.frames.some(
      (frame) =>
        frame.kind === "resolving-spell" ||
        frame.kind === "resolving-trigger-payment" ||
        frame.kind === "pending-damage" ||
        frame.kind === "activating",
    ),
    "No checkpoint during a suspended resolution",
  );
  let changed = false;
  for (let iteration = 0; iteration < 1000; iteration++) {
    const sba = stateBasedActions(state, release);
    changed ||= sba.changed;
    if (sba.waiting || state.outcome.kind !== "ongoing") return { waiting: sba.waiting, changed };
    const placement = placeWaitingTriggers(state);
    changed ||= placement.changed;
    if (placement.waiting || !placement.changed) return { waiting: placement.waiting, changed };
  }
  throw new RulesError(
    "UnsupportedMechanic",
    "Checkpoint requires a resumable trigger-loop policy",
  );
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
import { placeWaitingTriggers, removeDepartedTriggers } from "./triggers";
