import {
  type DamageHost,
  type ExecutionRegistry,
  GameEvent,
  type PendingDamageFrame,
  type Response,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { emit, hit, request, requireRule } from "./common";
import {
  damageChoice,
  damageEffects,
  damageInvariant,
  damageOriginals,
  transformedDamage,
} from "./damage-domain";
import { commitDamageResults } from "./damage-results";

function requestDamageReplacement(
  state: RulesState,
  registry: ExecutionRegistry,
  frame: PendingDamageFrame,
): boolean {
  const choice = damageChoice(state, registry, frame);
  if (!choice) return false;
  state.priorityPlayer = null;
  request(state, "damage-replacement", choice.actor, {
    damageReplacement: choice.domain,
    context: "Choose the next applicable damage replacement or prevention effect.",
  });
  return true;
}
export function beginDamageBatch(
  state: RulesState,
  registry: ExecutionRegistry,
  host: DamageHost,
): boolean {
  damageInvariant(
    state.frames.length === 0,
    "Cannot nest this finite damage continuation inside another resolution frame",
  );
  const eventId = `damage:${state.eventSequence}`;
  const originals = damageOriginals(state, registry, host, eventId);
  const occurrences = originals.map((original) => ({
    original,
    amount: original.amount,
    applied: [] as string[],
  }));
  if (!occurrences.some((entry) => damageEffects(state, registry, entry).length > 0)) {
    commitDamageResults(state, host, occurrences);
    return true;
  }
  emit(
    state,
    "DamageBatchProposed",
    GameEvent.shape.data.parse({ eventId, host, occurrences: originals }),
  );
  const origin = state.events.at(-1);
  damageInvariant(origin, "Damage proposal event was not retained");
  const frame: PendingDamageFrame = {
    kind: "pending-damage",
    eventId,
    version: 0,
    proposedAtRevision: state.revision,
    turn: state.turn,
    step: state.step,
    host: structuredClone(host),
    origin: structuredClone(origin),
    occurrences,
    rewrites: [],
  };
  state.frames.push(frame);
  damageInvariant(
    requestDamageReplacement(state, registry, frame),
    "An applicable damage event has no affected decision owner",
  );
  hit(state, "rule:616.1");
  return false;
}
/** One selected instance is one durable rewrite; forced remaining instances remain explicit. */
export function answerDamageReplacement(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
  response: Response,
): DamageHost | null {
  requireRule(
    response.kind === "damage-replacement",
    "Expected an owned damage replacement choice",
  );
  const frame = state.frames.find((entry) => entry.kind === "pending-damage");
  damageInvariant(frame, "Damage choice has no pending event");
  const choice = damageChoice(state, registry, frame);
  requireRule(
    choice?.actor === actor &&
      response.eventId === frame.eventId &&
      response.eventVersion === frame.version,
    "Damage event version or affected decision owner changed",
  );
  const entry = frame.occurrences.find(
    (candidate) => candidate.original.id === response.occurrenceId,
  );
  requireRule(
    entry && choice.domain.occurrences.some((candidate) => candidate.id === entry.original.id),
    "That damage occurrence is not owned by this actor",
  );
  const effect = damageEffects(state, registry, entry, frame.version).find(
    (candidate) => candidate.id === response.effectId,
  );
  requireRule(effect, "That effect is no longer applicable or already applied to this occurrence");
  const result = transformedDamage(entry.amount, entry.original.source.preventable, effect);
  const rewrite = {
    version: frame.version + 1,
    occurrenceId: entry.original.id,
    actor,
    effect,
    before: entry.amount,
    ...result,
  };
  entry.amount = result.after;
  entry.applied.push(effect.id);
  frame.version++;
  frame.rewrites.push(rewrite);
  emit(
    state,
    "DamageRewritten",
    GameEvent.shape.data.parse({ eventId: frame.eventId, ...rewrite }),
  );
  hit(state, "rule:614.5");
  hit(state, effect.program.kind === "prevention" ? "rule:615.10" : "rule:614.1a");
  if (effect.program.kind === "prevention" && !entry.original.source.preventable)
    hit(state, "rule:615.12a");
  if (requestDamageReplacement(state, registry, frame)) return null;
  const host = frame.host;
  state.frames = state.frames.filter((candidate) => candidate !== frame);
  state.decision = null;
  commitDamageResults(state, host, frame.occurrences);
  emit(
    state,
    "DamageBatchCommitted",
    GameEvent.shape.data.parse({
      eventId: frame.eventId,
      version: frame.version,
      occurrences: frame.occurrences,
      rewrites: frame.rewrites,
    }),
  );
  return host;
}
