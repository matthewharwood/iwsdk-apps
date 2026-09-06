import { canonicalJson, type ExecutionRegistry, type RulesState } from "@iwsdk-apps/contracts";
import { assertRegistryPin, definition, RulesError } from "./common";

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
  for (const [id, ability] of Object.entries(state.abilities)) {
    invariant(
      id ===
        `${state.manifest.id}:trigger:${ability.eventIndex}:${ability.occurrenceOrdinal}:${ability.program.id}` &&
        ability.source.zone === "battlefield",
      "Captured trigger event identity or source zone mismatch",
    );
    const source = definition(release, ability.source.definition);
    invariant(
      id === ability.id &&
        ability.source.id === `${ability.source.lineage}@${ability.source.generation}`,
      "Captured trigger or source identity mismatch",
    );
    invariant(
      source.sourceVersion === ability.sourceVersion &&
        source.triggerPrograms?.some(
          (program) => canonicalJson(program) === canonicalJson(ability.program),
        ),
      "Captured trigger program differs from its pinned source",
    );
    invariant(
      state.players.some((seat) => seat.id === ability.controller && !seat.lost),
      "Captured trigger belongs to a departed or missing player",
    );
    invariant(
      ability.controller === ability.source.controller,
      "Captured trigger controller differs from its entry snapshot",
    );
  }
  if (state.triggerPlacement) {
    invariant(
      state.triggerPlacement.phase === "ordinary" && state.decision?.kind === "trigger-order",
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
        state.triggerPlacement.cohort.every((id) =>
          state.triggerPlacement?.remainingPlayers.includes(state.abilities[id]?.controller ?? ""),
        ),
      "Trigger placement continuation differs from living APNAP order",
    );
    const owned = state.triggerPlacement.cohort.filter(
      (id) => state.abilities[id]?.controller === actor,
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
export function assertInvariants(state: RulesState, release: ExecutionRegistry): void {
  assertRegistryPin(state.manifest, release);
  assertContinuousEffects(state, release);
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
    definition(release, entry.definition);
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
    const program = definition(release, entry.definition).spellProgram;
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
  invariant(
    new Set(state.stack.map((entry) => (entry.kind === "spell" ? entry.objectId : entry.triggerId)))
      .size === state.stack.length &&
      state.stack.every((entry) =>
        entry.kind === "spell"
          ? state.objects[entry.objectId]?.zone === "stack"
          : state.abilities[entry.triggerId],
      ),
    "Invalid stack order",
  );
  assertTriggers(state, release);
  for (const seat of state.players.filter((candidate) => !candidate.lost)) {
    invariant(
      Object.values(state.objects).filter((entry) => entry.owner === seat.id).length === 100,
      "Physical card inventory changed without an implemented create/remove operation",
    );
  }
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
      if (spell && definition(release, spell.definition).spellProgram)
        invariant(
          spell.spellState?.target === frame.target,
          "Casting target and stack target state disagree",
        );
      if (state.decision.kind === "target")
        invariant(
          !!definition(release, state.objects[frame.card]?.definition ?? "").spellProgram?.target,
          "Target decision lacks a targeted program",
        );
    }
  } else invariant(state.decision === null, "Finished game exposes a gameplay decision");
}
