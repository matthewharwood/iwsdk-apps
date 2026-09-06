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
/** Durable resolved modifiers, independently distinguished from announced spell effects. */
export function continuousEvidence(archive: MatchArchive, coordinator: Coordinator) {
  const created: Record<string, number> = {};
  const expired: string[] = [];
  for (const record of archive.records) {
    const sources = new Map(
      record.events
        .filter((event) => event.type === "SpellResolved")
        .map((event) => [event.data.source, event.data.definition]),
    );
    for (const event of record.events) {
      if (event.type === "ContinuousEffectCreated") {
        const definition = sources.get(event.data.source);
        if (typeof definition !== "string") throw new Error("Modifier lacks a resolved source");
        created[definition] = (created[definition] ?? 0) + 1;
      }
      if (event.type === "ContinuousEffectsExpired" && Array.isArray(event.data.effects))
        for (const id of event.data.effects) if (typeof id === "string") expired.push(id);
    }
  }
  const state = coordinator.current();
  const viewer = state.players[0]?.id;
  if (!viewer) throw new Error("Missing proof viewer");
  const objects = coordinator.view(viewer).objects;
  return {
    created,
    expired,
    active: state.continuousEffects,
    absentSources: state.continuousEffects
      .filter((effect) => !state.objects[effect.source.id])
      .map((effect) => effect.source.id),
    affectedObjects: state.continuousEffects.map((effect) => {
      const target = objects.find((object) => object.id === effect.affectedObject);
      return {
        id: effect.affectedObject,
        zone: target?.zone ?? null,
        characteristics: target?.characteristics ?? null,
      };
    }),
  };
}
export type ProofStage =
  | "starting-player"
  | "target"
  | "payment"
  | "pending-trigger"
  | "pending-ordered-trigger"
  | "active-modifier";
export function atProofStage(view: PlayerObservation, kind: ProofStage): boolean {
  if (kind === "active-modifier")
    return (
      view.decision?.kind === "priority" &&
      view.objects.some((object) => {
        if (object.zone !== "battlefield") return false;
        const counters = (object.counters["+1/+1"] ?? 0) - (object.counters["-1/-1"] ?? 0);
        return (
          object.characteristics.keywords.some(
            (keyword) => !object.card.keywords.includes(keyword),
          ) ||
          (object.card.power !== null &&
            object.characteristics.power !== object.card.power + counters) ||
          (object.card.toughness !== null &&
            object.characteristics.toughness !== object.card.toughness + counters)
        );
      })
    );
  if (kind === "pending-ordered-trigger")
    return (
      view.decision?.kind === "priority" &&
      view.abilities.some((ability) => ability.program.schema === "commander-trigger/2")
    );
  return kind === "pending-trigger"
    ? view.decision?.kind === "priority" &&
        view.stack.some((entry) => entry.kind === "triggered-ability")
    : view.decision?.kind === kind;
}
