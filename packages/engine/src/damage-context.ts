import {
  canonicalJson,
  type ExecutionRegistry,
  PendingDamageFrame,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { request } from "./common";
import {
  damageChoice,
  damageEffects,
  damageInvariant,
  damageOriginals,
  transformedDamage,
} from "./damage-domain";

/** Structural provenance plus exact prefix refinement; journal replay authenticates historical state. */
export function assertDamageContinuation(state: RulesState, registry: ExecutionRegistry): void {
  const found = state.frames.filter((entry) => entry.kind === "pending-damage");
  if (found.length === 0) {
    damageInvariant(
      state.decision?.kind !== "damage-replacement" && !state.decision?.damageReplacement,
      "Damage decision exists without its pending event",
    );
    return;
  }
  damageInvariant(
    found.length === 1 && state.frames.length === 1,
    "Damage continuation cannot overlap another suspended procedure",
  );
  const parsed = PendingDamageFrame.safeParse(found[0]);
  damageInvariant(parsed.success, "Malformed pending damage frame");
  const frame = parsed.data;
  const { origin } = frame;
  damageInvariant(
    state.outcome.kind === "ongoing" &&
      state.priorityPlayer === null &&
      state.turn === frame.turn &&
      state.step === frame.step,
    "Damage continuation crossed a turn, priority, or outcome boundary",
  );
  damageInvariant(
    frame.version === frame.rewrites.length &&
      state.revision === frame.proposedAtRevision + frame.version &&
      origin.type === "DamageBatchProposed" &&
      frame.eventId === `damage:${origin.index}` &&
      state.eventSequence === origin.index + 1 + 2 * frame.version &&
      state.epoch === origin.epoch + 2 * frame.version,
    "Damage origin or rewrite boundary sequence changed",
  );
  const originals = damageOriginals(state, registry, frame.host, frame.eventId);
  damageInvariant(
    canonicalJson(origin.data) ===
      canonicalJson({ eventId: frame.eventId, host: frame.host, occurrences: originals }) &&
      origin.visibility === "public" &&
      origin.cause === "rules",
    "Damage immutable proposal differs from its actual instruction or allocations",
  );
  const replay: PendingDamageFrame = {
    ...frame,
    version: 0,
    occurrences: originals.map((original) => ({ original, amount: original.amount, applied: [] })),
    rewrites: [],
  };
  for (const rewrite of frame.rewrites) {
    const choice = damageChoice(state, registry, replay);
    const entry = replay.occurrences.find(
      (candidate) => candidate.original.id === rewrite.occurrenceId,
    );
    damageInvariant(
      entry &&
        choice?.actor === rewrite.actor &&
        choice.domain.occurrences.some((candidate) => candidate.id === rewrite.occurrenceId),
      "Damage history contains an unowned occurrence choice",
    );
    const effect = damageEffects(state, registry, entry, replay.version).find(
      (candidate) => candidate.id === rewrite.effect.id,
    );
    damageInvariant(
      effect && canonicalJson(effect) === canonicalJson(rewrite.effect),
      "Damage history effect provider/program is not the live applicable instance",
    );
    const result = transformedDamage(entry.amount, entry.original.source.preventable, effect);
    damageInvariant(
      rewrite.version === replay.version + 1 &&
        rewrite.before === entry.amount &&
        rewrite.after === result.after &&
        rewrite.prevented === result.prevented,
      "Damage rewrite arithmetic or occurrence version was altered",
    );
    entry.amount = result.after;
    entry.applied.push(effect.id);
    replay.version++;
    replay.rewrites.push(rewrite);
  }
  damageInvariant(
    canonicalJson(replay.occurrences) === canonicalJson(frame.occurrences),
    "Damage current occurrences differ from the complete rewrite history",
  );
  const choice = damageChoice(state, registry, replay);
  damageInvariant(choice, "Settled damage cannot remain suspended");
  const expected = { ...state, decision: null };
  request(expected, "damage-replacement", choice.actor, {
    damageReplacement: choice.domain,
    context: "Choose the next applicable damage replacement or prevention effect.",
  });
  damageInvariant(
    canonicalJson(state.decision) === canonicalJson(expected.decision),
    "Damage decision exposes stale, unowned or unrelated actions",
  );
}
