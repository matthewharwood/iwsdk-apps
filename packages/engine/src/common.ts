import {
  type CardDefinition,
  type Decision,
  type ExecutionRegistry,
  emptyMana,
  GameEvent,
  type GameObject,
  type MatchManifest,
  type PlayerState,
  type RulesState,
  type Zone,
} from "@iwsdk-apps/contracts";
import { orderedObjects } from "./object-order";
import { battlefieldCreatures, selectedObjects } from "./selection";

export class RulesError extends Error {
  constructor(
    public readonly code: "IllegalCommand" | "UnsupportedMechanic" | "Invariant",
    message: string,
  ) {
    super(message);
  }
}
export function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("IllegalCommand", message);
}
export function player(state: RulesState, id: string): PlayerState {
  const found = state.players.find((entry) => entry.id === id);
  if (!found) throw new RulesError("Invariant", `Unknown player ${id}`);
  return found;
}
/** Setup has no active player until the chooser selects the starting seat. */
export function requireActivePlayer(state: RulesState): string {
  requireRule(state.activePlayer !== null, "The starting player has not been chosen.");
  return state.activePlayer;
}
export function object(state: RulesState, id: string): GameObject {
  const found = state.objects[id];
  if (!found) throw new RulesError("IllegalCommand", "The referenced object no longer exists.");
  return found;
}
export function definition(
  release: Pick<ExecutionRegistry, "definitions">,
  id: string,
): CardDefinition {
  const found = release.definitions[id];
  if (!found) throw new RulesError("UnsupportedMechanic", `Definition unavailable: ${id}`);
  return found;
}
export function card(state: RulesState, release: ExecutionRegistry, id: string): CardDefinition {
  return definition(release, object(state, id).definition);
}
export function battlefield(state: RulesState): GameObject[] {
  return orderedObjects(state).filter((entry) => entry.zone === "battlefield");
}
export function creatures(state: RulesState, release: ExecutionRegistry): GameObject[] {
  return selectedObjects(state, release, battlefieldCreatures);
}
export function power(state: RulesState, release: ExecutionRegistry, id: string): number {
  const current = object(state, id);
  const base = card(state, release, id).power;
  if (base === null)
    throw new RulesError(
      "UnsupportedMechanic",
      "Dynamic creature power is not implemented in this release.",
    );
  return base + (current.counters["+1/+1"] ?? 0) - (current.counters["-1/-1"] ?? 0);
}
export function toughness(state: RulesState, release: ExecutionRegistry, id: string): number {
  const current = object(state, id);
  const base = card(state, release, id).toughness;
  if (base === null)
    throw new RulesError(
      "UnsupportedMechanic",
      "Dynamic creature toughness is not implemented in this release.",
    );
  return base + (current.counters["+1/+1"] ?? 0) - (current.counters["-1/-1"] ?? 0);
}
export function hit(state: RulesState, obligation: string): void {
  state.coverage[obligation] = (state.coverage[obligation] ?? 0) + 1;
}
export function emit(
  state: RulesState,
  type: string,
  data: GameEvent["data"],
  visibility: GameEvent["visibility"] = "public",
  cause = "rules",
): void {
  state.epoch++;
  state.events.push({
    index: state.eventSequence++,
    epoch: state.epoch,
    type,
    data,
    visibility,
    cause,
  });
}
export function request(
  state: RulesState,
  kind: Decision["kind"],
  actor: string,
  options: Partial<Omit<Decision, "id" | "actor" | "revision" | "kind">> = {},
): void {
  state.decision = {
    id: `${state.manifest.id}:decision:${state.revision}`,
    actor,
    revision: state.revision,
    kind,
    context: kind,
    count: 0,
    cards: [],
    triggers: [],
    players: [],
    manaSources: [],
    cost: null,
    cardCosts: {},
    damageDomain: [],
    ...options,
  };
}
export function nextLiving(state: RulesState, after: string): string {
  const start = state.players.findIndex((entry) => entry.id === after);
  for (let distance = 1; distance <= state.players.length; distance++) {
    const candidate = state.players[(start + distance) % state.players.length];
    if (candidate && !candidate.lost) return candidate.id;
  }
  throw new RulesError("Invariant", "No surviving seat");
}
export function removeFromLists(state: RulesState, id: string): void {
  for (const seat of state.players)
    for (const zone of ["library", "hand", "graveyard"] as const)
      seat[zone] = seat[zone].filter((entry) => entry !== id);
  state.stack = state.stack.filter((entry) => entry.kind !== "spell" || entry.objectId !== id);
}
/** A zone transition creates a new game object; physical lineage/commander designation survive. */
export function move(
  state: RulesState,
  id: string,
  destination: Zone,
  cause: string,
  controller?: string,
): GameObject {
  requireRule(
    controller === undefined || destination === "battlefield",
    "An entry controller applies only on the battlefield",
  );
  const before = object(state, id);
  const lastKnown = { ...before, counters: { ...before.counters } };
  removeFromLists(state, id);
  delete state.objects[id];
  const generation = before.generation + 1;
  const after: GameObject = {
    id: `${before.lineage}@${generation}`,
    lineage: before.lineage,
    generation,
    definition: before.definition,
    owner: before.owner,
    controller: controller ?? before.owner,
    zone: destination,
    tapped: false,
    controlledSinceTurn: state.turn,
    damage: 0,
    deathtouchDamage: false,
    counters: {},
    commander: before.commander,
    commanderMoveOffered: false,
  };
  state.objects[after.id] = after;
  if (destination === "stack") state.stack.push({ kind: "spell", objectId: after.id });
  if (["library", "hand", "graveyard"].includes(destination))
    player(state, after.owner)[destination as "library" | "hand" | "graveyard"].push(after.id);
  const hidden =
    before.zone === "library" ||
    destination === "library" ||
    (before.zone === "hand" && destination === "hand");
  emit(
    state,
    "ObjectMoved",
    GameEvent.shape.data.parse({ before: lastKnown, after: { ...after } }),
    hidden ? [before.owner] : "public",
    cause,
  );
  hit(state, "rule:400.7");
  return after;
}
export function randomBelow(state: RulesState, bound: number): number {
  requireRule(Number.isInteger(bound) && bound > 0 && bound <= 0xffffffff, "Invalid chance range");
  const limit = Math.floor(0x100000000 / bound) * bound;
  for (;;) {
    let next = state.chanceState;
    next ^= next << 13;
    next ^= next >>> 17;
    next ^= next << 5;
    state.chanceState = next >>> 0;
    state.chanceOperations++;
    if (state.chanceState < limit) return state.chanceState % bound;
  }
}
export function shuffleLibrary(state: RulesState, actor: string): void {
  const library = player(state, actor).library;
  for (let index = library.length - 1; index > 0; index--) {
    const swap = randomBelow(state, index + 1);
    const a = library[index],
      b = library[swap];
    if (a === undefined || b === undefined) throw new RulesError("Invariant", "Shuffle index");
    library[index] = b;
    library[swap] = a;
  }
  emit(state, "LibraryShuffled", { player: actor, count: library.length }, "public");
  hit(state, "rule:701.24");
}
export function draw(state: RulesState, actor: string, amount: number): void {
  const seat = player(state, actor);
  for (let index = 0; index < amount; index++) {
    const top = seat.library[0];
    if (top === undefined) {
      seat.drawnFromEmptyLibrary = true;
      emit(state, "DrawFromEmptyLibrary", { player: actor });
    } else {
      const drawn = move(state, top, "hand", "draw");
      emit(state, "CardDrawn", { player: actor, object: drawn.id }, [actor]);
    }
  }
  hit(state, "rule:121.2");
}
export function clearMana(state: RulesState): void {
  for (const seat of state.players) seat.mana = emptyMana();
}
export function emptyCombat(): RulesState["combat"] {
  return {
    attacks: [],
    blocks: [],
    blocked: [],
    remainingDefenders: [],
    damageActors: [],
    allocations: [],
    firstStrikeParticipants: [],
  };
}

/** The host admits and verifies registry bytes before calling the pure engine. */
export function assertRegistryPin(manifest: MatchManifest, registry: ExecutionRegistry): void {
  requireRule(manifest.releaseHash === registry.sourceReleaseHash, "Source release pin mismatch");
  requireRule(
    (manifest.preparedArtifactHash ?? null) === registry.preparedArtifactHash,
    "Prepared artifact pin mismatch",
  );
  requireRule(
    manifest.resolver === "full-scan"
      ? registry.preparedArtifactHash === null
      : registry.preparedArtifactHash !== null,
    "Resolver requires the matching full or prepared execution registry",
  );
}
