import type {
  Decision,
  ExecutionRegistry,
  GameObject,
  Keyword,
  Response,
  RulesState,
} from "@iwsdk-apps/contracts";
import { characteristics } from "./characteristics";
import {
  creatures,
  emit,
  emptyCombat,
  hit,
  object,
  permanentBase,
  player,
  power,
  request,
  requireActivePlayer,
  requireRule,
  toughness,
} from "./common";
import { beginDamageBatch } from "./damage";

type AttackResponse = Extract<Response, { kind: "attack" }>;
type BlockResponse = Extract<Response, { kind: "block" }>;
type DamageResponse = Extract<Response, { kind: "damage" }>;
type Allocation = DamageResponse["allocations"][number];
type Domain = Decision["damageDomain"];

function has(state: RulesState, release: ExecutionRegistry, id: string, keyword: Keyword): boolean {
  return characteristics(state, release, id).keywords.includes(keyword);
}

function liveCreature(
  state: RulesState,
  release: ExecutionRegistry,
  id: string,
): GameObject | undefined {
  const current = state.objects[id];
  if (!current || current.zone !== "battlefield" || player(state, current.controller).lost)
    return undefined;
  const types = permanentBase(state, release, id).types;
  return types.includes("Creature") && !types.includes("Battle") ? current : undefined;
}

function attackCandidates(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
): GameObject[] {
  const seat = player(state, actor);
  if (seat.lost) return [];
  return creatures(state, release).filter(
    (entry) =>
      entry.controller === actor &&
      !entry.tapped &&
      !permanentBase(state, release, entry.id).types.includes("Battle") &&
      !has(state, release, entry.id, "defender") &&
      (entry.controlledSinceTurn < seat.lastTurnStarted || has(state, release, entry.id, "haste")),
  );
}

function blockCandidates(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
): GameObject[] {
  return creatures(state, release).filter(
    (entry) =>
      entry.controller === actor &&
      !entry.tapped &&
      !permanentBase(state, release, entry.id).types.includes("Battle"),
  );
}

/** Turn order is used for decisions, never as damage or effect precedence. */
function apnap(state: RulesState): string[] {
  const activeIndex = state.players.findIndex((entry) => entry.id === state.activePlayer);
  requireRule(activeIndex >= 0, "The active seat is absent from turn order.");
  return [...state.players.slice(activeIndex), ...state.players.slice(0, activeIndex)]
    .filter((entry) => !entry.lost)
    .map((entry) => entry.id);
}

function requireDecision(state: RulesState, actor: string, kind: Decision["kind"]): void {
  requireRule(
    state.decision?.kind === kind && state.decision.actor === actor,
    `Only the requested player may answer this ${kind} decision.`,
  );
  requireRule(
    !player(state, actor).lost,
    "A player who left the game cannot make a combat choice.",
  );
}

function currentAttacks(
  state: RulesState,
  release: ExecutionRegistry,
): RulesState["combat"]["attacks"] {
  return state.combat.attacks.filter((attack) => {
    const attacker = liveCreature(state, release, attack.attacker);
    return attacker?.controller === state.activePlayer;
  });
}

function currentBlocks(
  state: RulesState,
  release: ExecutionRegistry,
): RulesState["combat"]["blocks"] {
  const attacks = currentAttacks(state, release);
  return state.combat.blocks.filter((block) => {
    const blocker = liveCreature(state, release, block.blocker);
    const attack = attacks.find((entry) => entry.attacker === block.attacker);
    return blocker && attack && blocker.controller === attack.defender;
  });
}

function combatants(state: RulesState, release: ExecutionRegistry): string[] {
  // Removing an attacker does not remove its surviving blockers from combat.
  // They can still establish a first-strike step even with nothing to damage.
  const blockers = state.combat.blocks.filter((block) => {
    const blocker = liveCreature(state, release, block.blocker);
    const attack = state.combat.attacks.find((entry) => entry.attacker === block.attacker);
    return blocker && attack && blocker.controller === attack.defender;
  });
  return [
    ...new Set([
      ...currentAttacks(state, release).map((entry) => entry.attacker),
      ...blockers.map((entry) => entry.blocker),
    ]),
  ];
}

export function startAttackDeclaration(state: RulesState, release: ExecutionRegistry): void {
  state.combat = emptyCombat();
  request(state, "attack", requireActivePlayer(state), {
    context: "Declare all attackers and the player each attacks.",
    cards: attackCandidates(state, release, requireActivePlayer(state)).map((entry) => entry.id),
    players: apnap(state).filter((id) => id !== state.activePlayer),
  });
}

export function answerAttack(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: AttackResponse,
): void {
  requireDecision(state, actor, "attack");
  requireRule(actor === state.activePlayer, "Only the active player declares attackers.");
  const candidates = new Set(attackCandidates(state, release, actor).map((entry) => entry.id));
  const defenders = new Set(apnap(state).filter((id) => id !== actor));
  const selected = new Set<string>();
  for (const attack of response.attacks) {
    requireRule(
      candidates.has(attack.attacker),
      "An attacker must be an eligible untapped creature you control.",
    );
    requireRule(!selected.has(attack.attacker), "A creature cannot attack more than one defender.");
    requireRule(
      defenders.has(attack.defender),
      "An attacker must attack an opponent still in the game.",
    );
    selected.add(attack.attacker);
  }
  // Validate the complete declaration before tapping any creature (CR 508.1).
  state.combat.attacks = response.attacks.map((entry) => ({ ...entry }));
  for (const attack of response.attacks) {
    if (!has(state, release, attack.attacker, "vigilance"))
      object(state, attack.attacker).tapped = true;
  }
  state.decision = null;
  emit(state, "AttackersDeclared", { player: actor, attacks: state.combat.attacks });
  hit(state, "rule:508.1");
}

function requestBlock(state: RulesState, release: ExecutionRegistry): boolean {
  const actor = state.combat.remainingDefenders[0];
  if (!actor) {
    state.decision = null;
    return false;
  }
  request(state, "block", actor, {
    context: "Declare all blockers against creatures attacking you.",
    cards: blockCandidates(state, release, actor).map((entry) => entry.id),
  });
  return true;
}

export function startBlockDeclarations(state: RulesState, release: ExecutionRegistry): boolean {
  const attacked = new Set(currentAttacks(state, release).map((entry) => entry.defender));
  state.combat.remainingDefenders = apnap(state).filter((id) => attacked.has(id));
  return requestBlock(state, release);
}

export function answerBlock(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: BlockResponse,
): boolean {
  requireDecision(state, actor, "block");
  requireRule(
    state.combat.remainingDefenders[0] === actor,
    "Defenders declare blockers in APNAP order.",
  );
  const candidates = new Set(blockCandidates(state, release, actor).map((entry) => entry.id));
  const attacks = currentAttacks(state, release).filter((entry) => entry.defender === actor);
  const attackers = new Set(attacks.map((entry) => entry.attacker));
  const selected = new Set<string>();
  for (const block of response.blocks) {
    requireRule(
      candidates.has(block.blocker),
      "A blocker must be an untapped creature you control.",
    );
    requireRule(
      !selected.has(block.blocker),
      "A creature cannot block multiple attackers without an explicit ability.",
    );
    requireRule(attackers.has(block.attacker), "You can block only creatures attacking you.");
    requireRule(
      !has(state, release, block.attacker, "flying") ||
        has(state, release, block.blocker, "flying") ||
        has(state, release, block.blocker, "reach"),
      "A flying attacker requires a blocker with flying or reach.",
    );
    selected.add(block.blocker);
  }
  for (const attack of attacks) {
    const count = response.blocks.filter((entry) => entry.attacker === attack.attacker).length;
    requireRule(
      count !== 1 || !has(state, release, attack.attacker, "menace"),
      "A creature with menace must be blocked by at least two creatures or left unblocked.",
    );
  }
  state.combat.blocks.push(...response.blocks.map((entry) => ({ ...entry })));
  state.combat.blocked = [
    ...new Set([...state.combat.blocked, ...response.blocks.map((entry) => entry.attacker)]),
  ];
  state.combat.remainingDefenders.shift();
  emit(state, "BlockersDeclared", { player: actor, blocks: response.blocks });
  hit(state, "rule:509.1");
  return !requestBlock(state, release);
}

export function hasFirstStrikeStep(state: RulesState, release: ExecutionRegistry): boolean {
  return combatants(state, release).some(
    (id) => has(state, release, id, "first-strike") || has(state, release, id, "double-strike"),
  );
}

function assignsThisStep(state: RulesState, release: ExecutionRegistry, id: string): boolean {
  if (state.step === "first-strike-damage")
    return state.combat.firstStrikeParticipants.includes(id);
  return (
    !state.combat.firstStrikeParticipants.includes(id) || has(state, release, id, "double-strike")
  );
}

function creatureTarget(
  state: RulesState,
  release: ExecutionRegistry,
  source: string,
  id: string,
): Domain[number]["targets"][number] {
  const remaining = Math.max(0, toughness(state, release, id) - object(state, id).damage);
  return {
    id,
    kind: "creature",
    lethal: has(state, release, source, "deathtouch") ? Math.min(1, remaining) : remaining,
  };
}

/** A constrained assignment domain, not an enumeration of every partition. */
export function damageDomain(state: RulesState, release: ExecutionRegistry, actor: string): Domain {
  const attacks = currentAttacks(state, release);
  const blocks = currentBlocks(state, release);
  const result: Domain = [];
  for (const source of combatants(state, release)) {
    if (object(state, source).controller !== actor || !assignsThisStep(state, release, source))
      continue;
    const amount = Math.max(0, power(state, release, source));
    if (amount === 0) continue;
    const attack = attacks.find((entry) => entry.attacker === source);
    let targets: Domain[number]["targets"];
    let tramplePlayer: string | null = null;
    if (attack) {
      targets = blocks
        .filter((entry) => entry.attacker === source)
        .map((entry) => creatureTarget(state, release, source, entry.blocker));
      const trample = has(state, release, source, "trample");
      if (
        (!state.combat.blocked.includes(source) || trample) &&
        !player(state, attack.defender).lost
      ) {
        targets.push({ id: attack.defender, kind: "player", lethal: 0 });
        if (trample) tramplePlayer = attack.defender;
      }
    } else {
      targets = blocks
        .filter((entry) => entry.blocker === source)
        .map((entry) => creatureTarget(state, release, source, entry.attacker));
    }
    if (targets.length > 0) result.push({ source, power: amount, targets, tramplePlayer });
  }
  return result;
}

function requestDamage(state: RulesState, release: ExecutionRegistry): boolean {
  const actor = state.combat.damageActors[0];
  if (!actor) {
    state.decision = null;
    return false;
  }
  const domain = damageDomain(state, release, actor);
  request(state, "damage", actor, {
    context: "Assign each creature's full combat damage among its legal targets.",
    cards: domain.map((entry) => entry.source),
    damageDomain: domain,
  });
  return true;
}

export function startCombatDamage(
  state: RulesState,
  release: ExecutionRegistry,
  first: boolean,
): boolean {
  state.step = first ? "first-strike-damage" : "combat-damage";
  state.combat.allocations = [];
  if (first) {
    state.combat.firstStrikeParticipants = combatants(state, release).filter(
      (id) => has(state, release, id, "first-strike") || has(state, release, id, "double-strike"),
    );
  }
  state.combat.damageActors = apnap(state).filter(
    (actor) => damageDomain(state, release, actor).length > 0,
  );
  return requestDamage(state, release);
}

function validateDamage(
  state: RulesState,
  release: ExecutionRegistry,
  domain: Domain,
  allocations: Allocation[],
): void {
  const pairs = new Set<string>();
  for (const allocation of allocations) {
    const source = domain.find((entry) => entry.source === allocation.source);
    requireRule(
      source?.targets.some((entry) => entry.id === allocation.target),
      "Combat damage references an ineligible source or target.",
    );
    requireRule(
      Number.isSafeInteger(allocation.amount) && allocation.amount >= 0,
      "Combat damage must be a nonnegative safe integer.",
    );
    const pair = JSON.stringify([allocation.source, allocation.target]);
    requireRule(!pairs.has(pair), "Give each source/target pair only one damage amount.");
    pairs.add(pair);
  }
  for (const source of domain) {
    const own = allocations.filter((entry) => entry.source === source.source);
    requireRule(
      own.reduce((sum, entry) => sum + entry.amount, 0) === source.power,
      "Assign exactly the creature's full positive power.",
    );
    if (
      !source.tramplePlayer ||
      !own.some((entry) => entry.target === source.tramplePlayer && entry.amount > 0)
    )
      continue;
    for (const target of source.targets.filter((entry) => entry.kind === "creature")) {
      // CR 702.19b checks the whole assignment, including another creature's
      // simultaneous damage; the source of deathtouch damage matters.
      const together = [...state.combat.allocations, ...allocations].filter(
        (entry) => entry.target === target.id,
      );
      const lethal =
        object(state, target.id).damage + together.reduce((sum, entry) => sum + entry.amount, 0) >=
          toughness(state, release, target.id) ||
        together.some(
          (entry) => entry.amount > 0 && has(state, release, entry.source, "deathtouch"),
        );
      requireRule(
        lethal,
        "Trample damage may reach the defender only after all blockers are assigned lethal damage.",
      );
    }
  }
}

export function answerDamage(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: DamageResponse,
): boolean {
  requireDecision(state, actor, "damage");
  requireRule(state.combat.damageActors[0] === actor, "Combat damage is assigned in APNAP order.");
  validateDamage(state, release, damageDomain(state, release, actor), response.allocations);
  state.combat.allocations.push(...response.allocations.map((entry) => ({ ...entry })));
  state.combat.damageActors.shift();
  return !requestDamage(state, release);
}

/** Damage is simultaneous. The caller performs SBAs, triggers and priority afterward. */
export function applyCombatDamage(state: RulesState, release: ExecutionRegistry): boolean {
  requireRule(
    state.combat.damageActors.length === 0,
    "Every combat damage owner must finish assigning before damage is dealt.",
  );
  requireRule(
    state.step === "first-strike-damage" || state.step === "combat-damage",
    "Combat damage requires a damage step",
  );
  return beginDamageBatch(state, release, {
    kind: "combat-step",
    step: state.step,
    allocations: structuredClone(state.combat.allocations),
  });
}
