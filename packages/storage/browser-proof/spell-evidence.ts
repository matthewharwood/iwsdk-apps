import {
  type ContentRelease,
  type ContinuousEffect,
  type GameEvent,
  GameObject,
  OrdinaryActivatedProgram,
  type PlayerObservation,
} from "@iwsdk-apps/contracts";
import type { Coordinator, MatchArchive } from "../src/index";
import { atDamageReplacementStage } from "./damage-evidence";
import { atObserverStage, OBSERVER_STAGES } from "./entry-observer-evidence";
import { atStaticStage } from "./static-evidence";
import { atTriggerPaymentStage, triggerPaymentEvidence } from "./trigger-payment-evidence";

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
    fullTokenTemplateCount: Object.keys(release.tokenTemplates ?? {}).length,
    excludedTokenTemplateCount:
      Object.keys(release.tokenTemplates ?? {}).length - info.tokenTemplateCount,
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
  const outcomes: { trigger: string; revision: number; kind: string }[] = [];
  const conditionChecks: { revision: number; event: GameEvent }[] = [];
  for (const record of archive.records)
    for (const event of record.events) {
      const id = event.data.definition;
      if (typeof id !== "string") continue;
      if (event.type === "TriggerConditionEvaluated")
        conditionChecks.push({ revision: record.receipt.revision, event });
      if (
        typeof event.data.trigger === "string" &&
        (event.type === "TriggeredAbilityResolved" ||
          (event.type === "TriggeredAbilityRemoved" &&
            event.data.reason === "intervening-if-false"))
      )
        outcomes.push({
          trigger: event.data.trigger,
          revision: record.receipt.revision,
          kind: event.type,
        });
      if (event.type === "TriggerCaptured") captured[id] = (captured[id] ?? 0) + 1;
      if (event.type === "TriggeredAbilityResolved") resolved[id] = (resolved[id] ?? 0) + 1;
    }
  return {
    captured,
    resolved,
    outcomes,
    conditionChecks,
    payments: triggerPaymentEvidence(archive),
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
type ModifierOrigin = {
  source: string;
  definition: string;
  controller: string;
  program: OrdinaryActivatedProgram;
  paid: boolean;
};
function modifierDefinition(
  events: readonly GameEvent[],
  index: number,
  spells: ReadonlyMap<string, string>,
  abilities: ReadonlyMap<string, ModifierOrigin>,
): string {
  const created = events[index];
  if (!created) throw new Error("Missing modifier creation event");
  const resolutions = events
    .slice(index + 1)
    .filter(
      (event) =>
        (event.type === "SpellResolved" || event.type === "ActivatedAbilityResolved") &&
        event.data.source === created.data.source,
    );
  const resolved = resolutions[0];
  if (resolutions.length !== 1 || !resolved || typeof resolved.data.definition !== "string")
    throw new Error("Modifier lacks one subsequently resolved source");
  if (resolved.type === "SpellResolved") {
    if (spells.get(String(resolved.data.source)) !== resolved.data.definition)
      throw new Error("Modifier spell resolution differs from its announced source");
  } else {
    const origin = abilities.get(String(resolved.data.ability));
    if (
      !origin?.paid ||
      origin.source !== created.data.source ||
      origin.definition !== resolved.data.definition ||
      origin.controller !== resolved.data.controller ||
      origin.program.id !== resolved.data.program ||
      origin.program.effects[0].kind !== "modify-creature" ||
      created.data.programIndex !== 0
    )
      throw new Error("Modifier ability resolution differs from its paid captured source");
  }
  return resolved.data.definition;
}
function recordModifierOrigin(
  event: GameEvent,
  spells: Map<string, string>,
  abilities: Map<string, ModifierOrigin>,
): void {
  if (
    event.type === "SpellAnnounced" &&
    typeof event.data.object === "string" &&
    typeof event.data.definition === "string"
  )
    spells.set(event.data.object, event.data.definition);
  if (event.type === "AbilityAnnounced") {
    const source = GameObject.parse(event.data.source);
    const program = OrdinaryActivatedProgram.parse(event.data.program);
    if (typeof event.data.ability !== "string" || typeof event.data.controller !== "string")
      throw new Error("Modifier ability announcement lost its identity");
    abilities.set(event.data.ability, {
      source: source.id,
      definition: source.definition,
      controller: event.data.controller,
      program,
      paid: false,
    });
  }
  if (event.type === "AbilityActivated") {
    const origin = abilities.get(String(event.data.ability));
    if (
      !origin ||
      origin.source !== event.data.source ||
      origin.program.id !== event.data.program ||
      origin.controller !== event.data.controller
    )
      throw new Error("Modifier ability payment differs from its announced source");
    origin.paid = true;
  }
}
/** Counts creation only when the same record subsequently completes its exact spell/ability source. */
export function continuousEvidence(
  archive: { records: readonly { events: readonly GameEvent[] }[] },
  coordinator: Pick<Coordinator, "current" | "view">,
) {
  const created: Record<string, number> = {};
  const expired: string[] = [];
  const spells = new Map<string, string>();
  const abilities = new Map<string, ModifierOrigin>();
  for (const record of archive.records) {
    for (const [index, event] of record.events.entries()) {
      recordModifierOrigin(event, spells, abilities);
      if (event.type === "ContinuousEffectCreated") {
        const definition = modifierDefinition(record.events, index, spells, abilities);
        created[definition] = (created[definition] ?? 0) + 1;
      }
      if (event.type === "SpellResolved") spells.delete(String(event.data.source));
      if (
        [
          "ActivatedAbilityResolved",
          "ActivatedAbilityDidNotResolve",
          "ActivationReversed",
        ].includes(event.type)
      )
        abilities.delete(String(event.data.ability));
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
/** Actual counter events must agree with movement and source resolution in the same record. */
export function counterEvidence(archive: MatchArchive, release: ContentRelease) {
  const occurrences = [];
  for (const record of archive.records) {
    for (const [index, event] of record.events.entries()) {
      if (event.type !== "SpellCountered") continue;
      const resolvedIndex = record.events.findIndex(
        (row) => row.type === "SpellResolved" && row.data.source === event.data.source,
      );
      const resolved = record.events[resolvedIndex];
      const definition = resolved?.data.definition;
      if (
        typeof definition !== "string" ||
        !release.definitions[definition]?.spellProgram?.effects.some((e) => e.kind === "counter") ||
        resolvedIndex <= index
      )
        throw new Error("Counter event lacks its subsequently resolved reviewed source");
      const movementIndex = record.events.findIndex((row) => {
        if (row.type !== "ObjectMoved") return false;
        const before = GameObject.safeParse(row.data.before);
        return before.success && before.data.id === event.data.before;
      });
      const movement = record.events[movementIndex];
      const before = GameObject.parse(movement?.data.before);
      const after = GameObject.parse(movement?.data.after);
      if (
        movementIndex >= index ||
        before.zone !== "stack" ||
        after.zone !== "graveyard" ||
        before.id === after.id ||
        before.lineage !== after.lineage ||
        after.id !== event.data.after ||
        before.definition !== event.data.definition ||
        before.owner !== event.data.owner ||
        after.owner !== before.owner ||
        before.id === event.data.source ||
        record.events.some((row) => row.type === "SpellResolved" && row.data.source === before.id)
      )
        throw new Error(
          "Counter event does not match a distinct unresolved spell moving to its owner's graveyard",
        );
      occurrences.push({
        revision: record.receipt.revision,
        source: event.data.source,
        sourceDefinition: definition,
        targetBefore: before.id,
        targetAfter: after.id,
        targetDefinition: before.definition,
        targetOwner: before.owner,
        targetController: before.controller,
        commander: before.commander,
        eventIndex: index,
        sourceResolvedIndex: resolvedIndex,
      });
    }
  }
  const state = archive.current;
  const spellIds = new Set(
    state.stack.flatMap((entry) => (entry.kind === "spell" ? [entry.objectId] : [])),
  );
  const pending = Object.values(state.objects).flatMap((source) => {
    const targetId = source.spellState?.target;
    if (
      !spellIds.has(source.id) ||
      !targetId ||
      source.id === targetId ||
      !spellIds.has(targetId) ||
      !release.definitions[source.definition]?.spellProgram?.effects.some(
        (effect) => effect.kind === "counter",
      )
    )
      return [];
    const target = state.objects[targetId];
    if (!target) throw new Error("Pending counter target object is missing");
    return [{ source, target }];
  });
  return { occurrences, pending };
}
export type ProofStage =
  | "pending-damage"
  | "observer-order"
  | "observer-stack"
  | "observer-resolved"
  | "starting-player"
  | "target"
  | "payment"
  | "pending-trigger"
  | "pending-conditional"
  | "trigger-payment"
  | "pending-ordered-trigger"
  | "active-modifier"
  | "pending-counter"
  | "commander-replacement"
  | "pending-token"
  | "active-token"
  | "token-departure"
  | "pending-static"
  | "active-static"
  | "static-departure";
export function atProofStage(
  view: PlayerObservation,
  kind: ProofStage,
  events: readonly GameEvent[] = [],
  release?: ContentRelease,
  continuousEffects: readonly ContinuousEffect[] = [],
  observerIds: readonly string[] = [],
): boolean {
  if (OBSERVER_STAGES.some((stage) => stage === kind))
    return atObserverStage(view, kind, events, observerIds);
  if (["pending-static", "active-static", "static-departure"].includes(kind))
    return atStaticStage(view, kind, events, release);
  if (kind === "pending-token")
    return (
      view.decision?.kind === "priority" &&
      view.stack.some(
        (entry) =>
          entry.kind === "spell" &&
          view.objects.some(
            (object) =>
              object.id === entry.objectId &&
              object.card?.spellProgram?.effects[0]?.kind === "create-token",
          ),
      )
    );
  if (kind === "active-token")
    return (
      view.decision?.kind === "priority" &&
      view.objects.some((object) => !!object.token && object.zone === "battlefield")
    );
  if (kind === "token-departure")
    return view.decision !== null && events.some((event) => event.type === "TokensCeased");
  if (kind === "pending-counter") {
    const spells = new Set(
      view.stack.flatMap((entry) => (entry.kind === "spell" ? [entry.objectId] : [])),
    );
    return (
      view.decision?.kind === "priority" &&
      view.objects.some((source) => {
        const target = source.spellState?.target;
        return (
          spells.has(source.id) &&
          !!target &&
          source.id !== target &&
          spells.has(target) &&
          source.card?.spellProgram?.effects.some((effect) => effect.kind === "counter")
        );
      })
    );
  }
  if (kind === "active-modifier")
    return (
      view.decision?.kind === "priority" &&
      continuousEffects.some(
        (effect) =>
          effect.expiresAfterTurn >= view.turn &&
          view.objects.some(
            (object) =>
              object.id === effect.affectedObject &&
              object.zone === "battlefield" &&
              (object.card ?? object.tokenTemplate?.characteristics)?.types.includes("Creature"),
          ),
      )
    );
  if (kind === "pending-damage") return atDamageReplacementStage(view);
  if (kind === "trigger-payment") return atTriggerPaymentStage(view);
  if (kind === "pending-conditional")
    return (
      view.decision?.kind === "priority" &&
      view.abilities.some(
        (ability) =>
          ability.program.schema === "commander-conditional-self-entry/1" &&
          view.stack.some(
            (entry) => entry.kind === "triggered-ability" && entry.triggerId === ability.id,
          ),
      )
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
