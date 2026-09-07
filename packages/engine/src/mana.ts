import {
  type Cost,
  type Decision,
  type ExecutionRegistry,
  type GameObject,
  MANA_COLORS,
  type Mana,
  type Response,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { definition, emit, hit, object, player, RulesError, requireRule } from "./common";
import { availableMana, selectedObjects } from "./selection";

export function manaSources(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
): Decision["manaSources"] {
  return selectedObjects(state, release, availableMana, {
    actor,
    lastTurn: player(state, actor).lastTurnStarted,
  }).map((entry) => ({
    object: entry.id,
    colors: definition(release, entry.definition).manaAbilities,
  }));
}
function safeMana(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RulesError("Invariant", "Mana arithmetic exceeded the exact integer domain");
  return value;
}
export function activateMana(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  response: Response,
): void {
  requireRule(response.kind === "mana", "Expected a mana activation");
  const source = manaSources(state, release, actor).find(
    (entry) => entry.object === response.source.object,
  );
  requireRule(
    source?.colors.includes(response.source.color),
    "That mana ability is not available.",
  );
  const amount = safeMana(player(state, actor).mana[response.source.color] + 1);
  object(state, response.source.object).tapped = true;
  player(state, actor).mana[response.source.color] = amount;
  state.consecutivePasses = 0;
  emit(state, "ManaAbilityResolved", {
    player: actor,
    source: response.source.object,
    color: response.source.color,
  });
  hit(state, "rule:605.3b");
}
export function validSpend(pool: Mana, spend: Mana, cost: Cost): boolean {
  let generic = 0;
  for (const color of MANA_COLORS) {
    if (spend[color] > pool[color] || spend[color] < cost[color]) return false;
    generic = safeMana(generic + spend[color] - cost[color]);
  }
  return generic === cost.generic;
}
export type FixedManaPayment = {
  poolBefore: Mana;
  poolAfter: Mana;
  spend: Mana;
  sources: { source: GameObject; color: (typeof MANA_COLORS)[number] }[];
};
/** Validate the complete payment without changing a permanent or pool. */
export function planManaPayment(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
  cost: Cost,
  sources: { object: string; color: (typeof MANA_COLORS)[number] }[],
  spend: Mana,
): FixedManaPayment {
  requireRule(
    new Set(sources.map((source) => source.object)).size === sources.length,
    "A mana source cannot be tapped twice.",
  );
  const available = manaSources(state, registry, actor),
    poolBefore = { ...player(state, actor).mana },
    pool = { ...poolBefore };
  const snapshots = sources.map((source) => {
    requireRule(
      available.find((entry) => entry.object === source.object)?.colors.includes(source.color),
      "Invalid mana source or output color",
    );
    pool[source.color] = safeMana(pool[source.color] + 1);
    return { source: structuredClone(object(state, source.object)), color: source.color };
  });
  requireRule(validSpend(pool, spend, cost), "Mana payment does not satisfy the exact cost.");
  for (const color of MANA_COLORS) pool[color] = safeMana(pool[color] - spend[color]);
  return { poolBefore, poolAfter: pool, spend: { ...spend }, sources: snapshots };
}
export function commitManaPayment(
  state: RulesState,
  actor: string,
  payment: FixedManaPayment,
): void {
  for (const source of payment.sources) {
    object(state, source.source.id).tapped = true;
    emit(state, "ManaAbilityResolved", {
      player: actor,
      source: source.source.id,
      color: source.color,
    });
  }
  for (const color of MANA_COLORS) player(state, actor).mana[color] = payment.poolAfter[color];
}
