import type { ContentRelease, PlayerObservation } from "@iwsdk-apps/contracts";
import type { Coordinator, MatchArchive } from "../src/index";

function removals(record: MatchArchive["records"][number], release: ContentRelease) {
  const removalEvents = { destroy: 0, exile: 0 };
  const resolvedSources = new Map(
    record.events
      .filter((event) => event.type === "SpellResolved")
      .map((event) => [event.data.source, event.data.definition]),
  );
  for (const event of record.events) {
    const sourceDefinition = resolvedSources.get(event.data.source);
    if (typeof sourceDefinition === "string") {
      const program = release.definitions[sourceDefinition]?.spellProgram;
      if (
        event.type === "CreatureDestroyed" &&
        program?.effects.some((effect) => effect.kind === "destroy")
      )
        removalEvents.destroy++;
      if (
        event.type === "CreatureExiled" &&
        program?.effects.some((effect) => effect.kind === "exile")
      )
        removalEvents.exile++;
    }
  }
  return removalEvents;
}

/** These are observed event counts, not card presence in an unobserved library. */
export function spellEvidence(archive: MatchArchive, release: ContentRelease) {
  const announced: Record<string, number> = {};
  const resolved: Record<string, number> = {};
  const effects = new Set<string>();
  const removalEvents = { destroy: 0, exile: 0 };
  for (const record of archive.records) {
    const actual = removals(record, release);
    removalEvents.destroy += actual.destroy;
    removalEvents.exile += actual.exile;
    for (const event of record.events) {
      const id = event.data.definition;
      if (typeof id !== "string") continue;
      const definition = release.definitions[id];
      if (!definition?.spellProgram) continue;
      if (event.type === "SpellAnnounced") announced[id] = (announced[id] ?? 0) + 1;
      if (event.type === "SpellResolved") {
        resolved[id] = (resolved[id] ?? 0) + 1;
        for (const effect of definition.spellProgram.effects) effects.add(effect.kind);
      }
    }
  }
  return { announced, resolved, effectKinds: [...effects].sort(), removalEvents };
}

/** Measured runtime membership alongside the authenticated complete source size. */
export function executionEvidence(
  release: ContentRelease,
  info: ReturnType<Coordinator["executionInfo"]>,
) {
  const fullDefinitionCount = Object.keys(release.definitions).length;
  return {
    ...info,
    fullDefinitionCount,
    excludedDefinitionCount: fullDefinitionCount - info.definitionCount,
  };
}

/** Public setup projections prove the pending choice exists before any physical cards are dealt. */
export function setupEvidence(coordinator: Coordinator, archive: MatchArchive) {
  const state = coordinator.current();
  const choices = archive.records.filter(
    (record) => record.command.response.kind === "starting-player",
  );
  return {
    chooser: state.startingPlayerChooser,
    starter: state.startingPlayer,
    activePlayer: state.activePlayer,
    priorityPlayer: state.priorityPlayer,
    objectCount: Object.keys(state.objects).length,
    zones: state.players.map((seat) => ({
      player: seat.id,
      hand: seat.hand.length,
      library: seat.library.length,
      graveyard: seat.graveyard.length,
    })),
    choiceViews:
      state.startingPlayer === null
        ? state.players.map((seat) => {
            const view = coordinator.view(seat.id);
            return { player: seat.id, decision: view.decision, objectCount: view.objects.length };
          })
        : [],
    acceptedChoices: choices.length,
    firstChoice: choices[0] ? { command: choices[0].command, receipt: choices[0].receipt } : null,
  };
}

/** Counts only captured/resolved occurrences actually emitted by the engine. */
export function triggerEvidence(archive: MatchArchive) {
  const captured: Record<string, number> = {};
  const resolved: Record<string, number> = {};
  for (const record of archive.records)
    for (const event of record.events) {
      const id = event.data.definition;
      if (typeof id !== "string") continue;
      if (event.type === "TriggerCaptured") captured[id] = (captured[id] ?? 0) + 1;
      if (event.type === "TriggeredAbilityResolved") resolved[id] = (resolved[id] ?? 0) + 1;
    }
  return {
    captured,
    resolved,
    pending: archive.current.stack.flatMap((entry) =>
      entry.kind === "triggered-ability" ? [entry.triggerId] : [],
    ),
    abilities: archive.current.abilities,
    absentCapturedSources: Object.values(archive.current.abilities)
      .filter((ability) => !archive.current.objects[ability.source.id])
      .map((ability) => ability.source.id),
    pendingTriggers: archive.current.pendingTriggers,
    placement: archive.current.triggerPlacement,
  };
}
export type ProofStage = "starting-player" | "target" | "payment" | "pending-trigger";
export function atProofStage(view: PlayerObservation, kind: ProofStage): boolean {
  return kind === "pending-trigger"
    ? view.decision?.kind === "priority" &&
        view.stack.some((entry) => entry.kind === "triggered-ability")
    : view.decision?.kind === kind;
}
