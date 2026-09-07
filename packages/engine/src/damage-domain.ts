import {
  canonicalJson,
  type DamageEffectInstance,
  type DamageHost,
  type DamageOccurrence,
  type DamageReplacementChoice,
  type DamageSourceFacts,
  type ExecutionRegistry,
  type GameObject,
  type PendingDamageFrame,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { characteristics } from "./characteristics";
import { card, object, permanentBase, player, RulesError } from "./common";
import { selectDamageEffects } from "./damage-selection";
import { entrySubjectVersion, observerOccurrenceId } from "./entry-observer-context";
import { selectedObjects } from "./selection";

export function damageInvariant(value: unknown, message: string): asserts value {
  if (!value) throw new RulesError("Invariant", message);
}
export function checkedDamageNumber(value: number): number {
  if (!Number.isSafeInteger(value))
    throw new RulesError(
      "UnsupportedMechanic",
      "Damage arithmetic exceeds the exact safe-integer boundary",
    );
  return value;
}
function sourceFacts(
  state: RulesState,
  registry: ExecutionRegistry,
  source: GameObject,
  isSpell: boolean,
): DamageSourceFacts {
  const keywords = characteristics(state, registry, source.id).keywords;
  const cannotPrevent =
    !source.token &&
    card(state, registry, source.id).damagePrograms?.some(
      (program) => program.kind === "damage-cannot-be-prevented",
    );
  return {
    object: structuredClone(source),
    sourceVersion: entrySubjectVersion(registry, source),
    isSpell,
    deathtouch: keywords.includes("deathtouch"),
    lifelink: keywords.includes("lifelink"),
    preventable: !cannotPrevent,
  };
}
function occurrence(
  state: RulesState,
  registry: ExecutionRegistry,
  eventId: string,
  ordinal: number,
  source: string,
  target: string,
  amount: number,
  isSpell: boolean,
): DamageOccurrence {
  damageInvariant(
    amount > 0 && Number.isSafeInteger(amount),
    "Damage proposal must be a positive exact integer",
  );
  const seat = state.players.find((entry) => entry.id === target && !entry.lost);
  const creature = seat ? null : object(state, target);
  if (creature)
    damageInvariant(
      creature.zone === "battlefield" &&
        permanentBase(state, registry, creature.id).types.includes("Creature") &&
        !player(state, creature.controller).lost,
      "Damage recipient must be a living player or controlled battlefield creature",
    );
  return {
    id: `${eventId}:${ordinal}`,
    source: sourceFacts(state, registry, object(state, source), isSpell),
    recipient: seat
      ? { kind: "player", id: seat.id }
      : { kind: "creature", id: target, object: structuredClone(creature as GameObject) },
    affectedPlayer: seat?.id ?? (creature as GameObject).controller,
    amount,
  };
}
/** Reconstruct the actual instruction/allocation origin, never the event list from a later command. */
export function damageOriginals(
  state: RulesState,
  registry: ExecutionRegistry,
  host: DamageHost,
  eventId: string,
): DamageOccurrence[] {
  if (host.kind === "spell-instruction") {
    const source = object(state, host.source.id);
    const definition = card(state, registry, source.id);
    const top = state.stack.at(-1);
    damageInvariant(
      top?.kind === "spell" &&
        top.objectId === source.id &&
        source.zone === "stack" &&
        canonicalJson(source) === canonicalJson(host.source),
      "Pending damage spell incarnation or stack position changed",
    );
    damageInvariant(
      host.controller === source.controller &&
        definition.sourceVersion === host.sourceVersion &&
        canonicalJson(definition.spellProgram ?? null) === canonicalJson(host.program) &&
        source.spellState?.target === host.target,
      "Pending damage program, controller or target changed",
    );
    const effect = host.program.effects[host.effectIndex];
    damageInvariant(
      effect?.kind === "damage",
      "Damage continuation does not point at a damage instruction",
    );
    return [occurrence(state, registry, eventId, 0, source.id, host.target, effect.amount, true)];
  }
  damageInvariant(
    host.step === state.step &&
      state.combat.damageActors.length === 0 &&
      canonicalJson(host.allocations) === canonicalJson(state.combat.allocations),
    "Pending combat origin differs from completed assignments",
  );
  return host.allocations
    .filter((entry) => entry.amount > 0)
    .map((entry, index) => {
      const source = object(state, entry.source);
      damageInvariant(
        source.zone === "battlefield" &&
          permanentBase(state, registry, source.id).types.includes("Creature"),
        "Combat damage source is not a live creature",
      );
      return occurrence(
        state,
        registry,
        eventId,
        index,
        entry.source,
        entry.target,
        entry.amount,
        false,
      );
    });
}
export function damageEffects(
  state: RulesState,
  registry: ExecutionRegistry,
  entry: PendingDamageFrame["occurrences"][number],
  eventVersion = 0,
): DamageEffectInstance[] {
  const instances: DamageEffectInstance[] = selectedObjects(state, registry, {
    op: "and",
    terms: [
      { op: "string-eq", field: "zone", value: "battlefield" },
      { op: "boolean-eq", field: "hasDamageProgram", value: true },
    ],
  }).flatMap((provider) => {
    if (
      provider.zone !== "battlefield" ||
      provider.token ||
      player(state, provider.controller).lost
    )
      return [];
    const definition = card(state, registry, provider.id);
    const program = definition.damagePrograms?.[0];
    if (!program || program.kind === "damage-cannot-be-prevented") return [];
    const id = observerOccurrenceId(state, provider, 0, 0, 0).replace(
      "entry-observer:",
      "damage-effect:",
    );
    return [
      {
        id,
        provider: structuredClone(provider),
        sourceVersion: definition.sourceVersion,
        programIndex: 0 as const,
        program: structuredClone(program),
      },
    ];
  });
  return selectDamageEffects(state, entry, eventVersion, instances);
}
export function damageChoice(
  state: RulesState,
  registry: ExecutionRegistry,
  frame: PendingDamageFrame,
): { actor: string; domain: DamageReplacementChoice } | null {
  const candidates = frame.occurrences
    .map((entry) => ({ entry, effects: damageEffects(state, registry, entry, frame.version) }))
    .filter((entry) => entry.effects.length > 0);
  const anchor = state.players.findIndex((seat) => seat.id === state.activePlayer);
  damageInvariant(anchor >= 0, "Damage proposal has no active seat anchor");
  const order = [...state.players.slice(anchor), ...state.players.slice(0, anchor)].filter(
    (seat) => !seat.lost,
  );
  const actor = order.find((seat) =>
    candidates.some((candidate) => candidate.entry.original.affectedPlayer === seat.id),
  )?.id;
  if (!actor) return null;
  return {
    actor,
    domain: {
      eventId: frame.eventId,
      version: frame.version,
      occurrences: candidates
        .filter((candidate) => candidate.entry.original.affectedPlayer === actor)
        .map(({ entry, effects }) => ({
          id: entry.original.id,
          source: entry.original.source.object.id,
          recipient: { kind: entry.original.recipient.kind, id: entry.original.recipient.id },
          amount: entry.amount,
          preventable: entry.original.source.preventable,
          effects: effects.map((effect) => ({
            id: effect.id,
            provider: effect.provider.id,
            definition: effect.provider.definition,
            program: effect.program,
          })),
        })),
    },
  };
}
export function transformedDamage(
  amount: number,
  preventable: boolean,
  effect: DamageEffectInstance,
): { after: number; prevented: number } {
  if (effect.program.kind === "prevention") {
    const prevented = preventable ? Math.min(amount, effect.program.amount) : 0;
    return { after: amount - prevented, prevented };
  }
  return {
    after:
      effect.program.operation.kind === "multiply"
        ? checkedDamageNumber(amount * effect.program.operation.factor)
        : Math.max(0, amount - effect.program.operation.amount),
    prevented: 0,
  };
}
