import {
  canonicalJson,
  type ExecutionRegistry,
  type GameObject,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { assertActivatedAbility, assertActivationContexts } from "./activation-context";
import { assertAttachmentContexts } from "./attachment-context";
import { castTargetKind } from "./cast-targets";
import { assertBlockingDecision } from "./combat";
import { assertRegistryPin, definition, RulesError } from "./common";
import { assertDamageContinuation } from "./damage-context";
import { assertResolutionContinuation } from "./resolution-context";
import { assertPhysicalInventory, assertToken } from "./token-invariants";
import { assertTriggerContexts } from "./trigger-context";
import { assertTriggerPayment } from "./trigger-payment";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("Invariant", message);
}
function assertUndealtSetup(state: RulesState, seats: ReadonlySet<string>): void {
  invariant(
    state.revision === 0 && state.turn === 0 && state.step === "setup",
    "Undealt state escaped initial setup",
  );
  invariant(
    state.activePlayer === null && state.priorityPlayer === null,
    "Undealt setup has an active or priority player",
  );
  invariant(
    Object.keys(state.objects).length === 0 &&
      state.stack.length === 0 &&
      Object.keys(state.abilities).length === 0 &&
      Object.keys(state.activatedAbilities ?? {}).length === 0 &&
      state.pendingTriggers.length === 0 &&
      state.triggerPlacement === null &&
      state.frames.length === 0 &&
      state.continuousEffects.length === 0,
    "Cards or continuations exist before starting-player selection",
  );
  invariant(
    state.players.every(
      (seat) => seat.hand.length === 0 && seat.library.length === 0 && seat.graveyard.length === 0,
    ),
    "A zone was populated before starting-player selection",
  );
  invariant(
    state.outcome.kind === "ongoing" &&
      state.decision?.kind === "starting-player" &&
      state.decision.actor === state.startingPlayerChooser &&
      state.decision.revision === state.revision,
    "Initial setup lacks its owned starting-player decision",
  );
  invariant(
    state.decision.players.length === seats.size &&
      new Set(state.decision.players).size === seats.size &&
      state.decision.players.every((id) => seats.has(id)),
    "Starting-player decision does not contain every seat exactly once",
  );
}
function assertTriggers(state: RulesState, release: ExecutionRegistry): void {
  const occurrences = [
    ...state.pendingTriggers,
    ...(state.triggerPlacement?.cohort ?? []),
    ...state.stack.flatMap((entry) =>
      entry.kind === "triggered-ability" ? [entry.triggerId] : [],
    ),
  ];
  invariant(
    new Set(occurrences).size === occurrences.length,
    "Trigger instance appears in multiple locations",
  );
  invariant(
    occurrences.length === Object.keys(state.abilities).length &&
      occurrences.every((id) => state.abilities[id]),
    "Captured trigger lost its queue or stack location",
  );
  assertTriggerContexts(state, release);
  assertTriggerPayment(state, release);
  if (state.triggerPlacement) {
    invariant(
      state.decision?.kind === "trigger-order",
      "Trigger placement lacks its serializable ordering decision",
    );
    const actor = state.triggerPlacement.remainingPlayers[0];
    invariant(actor !== undefined, "Trigger placement has no remaining APNAP controller");
    const activeIndex = state.players.findIndex((seat) => seat.id === state.activePlayer);
    const apnap = [...state.players.slice(activeIndex), ...state.players.slice(0, activeIndex)]
      .filter((seat) => !seat.lost)
      .map((seat) => seat.id);
    const actorIndex = apnap.indexOf(actor);
    invariant(
      actorIndex >= 0 &&
        canonicalJson(state.triggerPlacement.remainingPlayers) ===
          canonicalJson(apnap.slice(actorIndex)) &&
        state.triggerPlacement.cohort.every((id) => {
          const ability = state.abilities[id];
          return ability?.program.trigger.placementClass !== state.triggerPlacement?.phase
            ? state.triggerPlacement?.phase === "ordinary"
            : state.triggerPlacement?.remainingPlayers.includes(ability?.controller ?? "");
        }),
      "Trigger placement continuation differs from living APNAP order",
    );
    const owned = state.triggerPlacement.cohort.filter(
      (id) =>
        state.abilities[id]?.controller === actor &&
        state.abilities[id]?.program.trigger.placementClass === state.triggerPlacement?.phase,
    );
    invariant(
      state.decision.actor === actor &&
        owned.length > 1 &&
        state.decision.triggers.length === owned.length &&
        new Set(state.decision.triggers).size === owned.length &&
        state.decision.triggers.every((id) => owned.includes(id)),
      "Trigger ordering decision differs from its owned cohort",
    );
  } else
    invariant(
      state.decision?.kind !== "trigger-order",
      "Trigger ordering decision has no continuation",
    );
}
function sameActivationModifier(
  instruction: {
    kind: string;
    powerDelta: number;
    toughnessDelta: number;
    keywords: string[];
    duration: string;
  },
  modifier: unknown,
): boolean {
  return (
    canonicalJson({
      kind: instruction.kind,
      powerDelta: instruction.powerDelta,
      toughnessDelta: instruction.toughnessDelta,
      keywords: instruction.keywords,
      duration: instruction.duration,
    }) === canonicalJson(modifier)
  );
}
function assertContinuousEffects(state: RulesState, release: ExecutionRegistry): void {
  invariant(
    new Set(state.continuousEffects.map((effect) => effect.id)).size ===
      state.continuousEffects.length,
    "Duplicate continuous effect identity",
  );
  for (const effect of state.continuousEffects) {
    const source = definition(release, effect.source.definition);
    invariant(
      effect.id === `${state.manifest.id}:continuous:${effect.eventIndex}:${effect.programIndex}` &&
        effect.eventIndex < state.eventSequence,
      "Continuous effect occurrence mismatch",
    );
    if (effect.activation) {
      const ability = assertActivatedAbility(state, release, effect.activation, true);
      const instruction = ability.program.effects[0];
      invariant(
        ability.payment &&
          instruction.kind === "modify-creature" &&
          effect.programIndex === 0 &&
          sameActivationModifier(instruction, effect.modifier),
        "Continuous activation effect changed its complete instruction",
      );
      invariant(
        canonicalJson(effect.source) === canonicalJson(ability.source) &&
          effect.sourceVersion === ability.sourceVersion &&
          effect.controller === ability.controller &&
          effect.eventIndex > ability.payment.event.index,
        "Continuous effect changed its captured activation host",
      );
      invariant(
        effect.affectedObject ===
          (instruction.recipient === "source" ? ability.source.id : ability.target) &&
          effect.expiresAfterTurn === state.turn &&
          state.turn > 0,
        "Continuous activation effect changed its affected incarnation or duration",
      );
      continue;
    }
    invariant(
      effect.source.zone === "stack" &&
        effect.source.id === `${effect.source.lineage}@${effect.source.generation}`,
      "Continuous effect source incarnation mismatch",
    );
    invariant(
      effect.controller === effect.source.controller &&
        state.players.some((seat) => seat.id === effect.controller),
      "Continuous effect controller differs from its source snapshot",
    );
    invariant(
      effect.affectedObject === effect.source.spellState?.target,
      "Continuous effect changed its fixed affected incarnation",
    );
    invariant(
      effect.expiresAfterTurn === state.turn && state.turn > 0,
      "Continuous effect escaped its duration",
    );
    invariant(
      source.sourceVersion === effect.sourceVersion &&
        source.spellProgram?.effects[effect.programIndex]?.kind === "modify-creature" &&
        canonicalJson(source.spellProgram.effects[effect.programIndex]) ===
          canonicalJson(effect.modifier),
      "Continuous effect differs from its pinned program",
    );
  }
}
function assertStackSpellState(
  state: RulesState,
  release: ExecutionRegistry,
  entry: GameObject,
): void {
  const program = entry.token ? undefined : definition(release, entry.definition).spellProgram;
  if (entry.zone === "stack" && program) {
    invariant(entry.spellState, "Programmed spell has no serialized target state");
    const isBeingCast = state.frames.some(
      (frame) => frame.kind === "casting" && frame.card === entry.id,
    );
    invariant(
      program.target === null
        ? entry.spellState.target === null
        : isBeingCast || entry.spellState.target !== null,
      "Completed casting has inconsistent chosen target state",
    );
  }
}
export function assertInvariants(state: RulesState, release: ExecutionRegistry): void {
  assertRegistryPin(state.manifest, release);
  assertContinuousEffects(state, release);
  assertAttachmentContexts(state, release);
  const seats = new Set(state.players.map((seat) => seat.id));
  invariant(seats.has(state.startingPlayerChooser), "Starting-player chooser is not a match seat");
  if (state.startingPlayer === null) {
    assertUndealtSetup(state, seats);
    return;
  }
  invariant(
    seats.has(state.startingPlayer) && state.activePlayer !== null && seats.has(state.activePlayer),
    "Selected starting or active player is absent",
  );
  invariant(state.turn !== 0 || state.priorityPlayer === null, "Pregame setup exposes priority");
  const listed = new Set<string>();
  for (const seat of state.players) {
    for (const zone of ["library", "hand", "graveyard"] as const)
      for (const id of seat[zone]) {
        invariant(!listed.has(id), "An object appears in multiple ordered zones");
        listed.add(id);
        invariant(
          state.objects[id]?.owner === seat.id && state.objects[id]?.zone === zone,
          "Ordered zone membership mismatch",
        );
      }
  }
  const lineages = new Set<string>();
  for (const entry of Object.values(state.objects)) {
    if (entry.token) assertToken(state, release, entry);
    else definition(release, entry.definition);
    invariant(
      entry.id === `${entry.lineage}@${entry.generation}`,
      "Object generation identity mismatch",
    );
    invariant(!lineages.has(entry.lineage), "More than one live generation of a physical card");
    lineages.add(entry.lineage);
    invariant(
      state.players.some((seat) => seat.id === entry.owner && !seat.lost),
      "Object owned by missing/departed player",
    );
    invariant(
      state.players.some((seat) => seat.id === entry.controller && !seat.lost),
      "Object controlled by missing/departed player",
    );
    invariant(
      !["library", "hand", "graveyard"].includes(entry.zone) || listed.has(entry.id),
      "Object missing from its ordered zone",
    );
    invariant(
      entry.zone !== "stack" ||
        state.stack.some((item) => item.kind === "spell" && item.objectId === entry.id),
      "Stack object missing from stack order",
    );
    invariant(
      !entry.spellState || entry.zone === "stack",
      "Spell target state escaped its stack object",
    );
    assertStackSpellState(state, release, entry);
  }
  invariant(
    new Set(
      state.stack.map((entry) =>
        entry.kind === "spell"
          ? entry.objectId
          : entry.kind === "triggered-ability"
            ? entry.triggerId
            : entry.abilityId,
      ),
    ).size === state.stack.length &&
      state.stack.every((entry) =>
        entry.kind === "spell"
          ? state.objects[entry.objectId]?.zone === "stack"
          : entry.kind === "triggered-ability"
            ? state.abilities[entry.triggerId]
            : state.activatedAbilities?.[entry.abilityId],
      ),
    "Invalid stack order",
  );
  assertTriggers(state, release);
  assertActivationContexts(state, release);
  assertResolutionContinuation(state, release);
  assertDamageContinuation(state, release);
  assertBlockingDecision(state, release);
  assertPhysicalInventory(state);
  if (state.outcome.kind === "ongoing") {
    invariant(state.decision !== null, "Ongoing transition has no serializable decision");
    invariant(
      state.players.some((seat) => seat.id === state.decision?.actor && !seat.lost),
      "Decision assigned to a departed/missing player",
    );
    invariant(state.decision.revision === state.revision, "Stale decision revision");
    if (state.decision.kind === "target" || state.decision.kind === "payment") {
      const frame = state.frames.at(-1);
      invariant(
        frame?.kind === "casting" && frame.actor === state.decision.actor,
        "Casting decision has no owned continuation",
      );
      invariant(
        state.objects[frame.card]?.zone === "stack",
        "Casting continuation lost its announced spell",
      );
      const spell = state.objects[frame.card];
      if (
        spell &&
        (definition(release, spell.definition).spellProgram ||
          castTargetKind(definition(release, spell.definition)))
      )
        invariant(
          spell.spellState?.target === frame.target,
          "Casting target and stack target state disagree",
        );
      if (state.decision.kind === "target")
        invariant(
          castTargetKind(definition(release, state.objects[frame.card]?.definition ?? "")) !== null,
          "Target decision lacks a targeted program",
        );
    }
  } else invariant(state.decision === null, "Finished game exposes a gameplay decision");
}
