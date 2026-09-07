import {
  type ContentRelease,
  EntryObserverCapture,
  EntryObserverProgram,
  type GameEvent,
  type PlayerObservation,
} from "@iwsdk-apps/contracts";
import type { MatchArchive } from "../src/index";

export const OBSERVER_STAGES = ["observer-order", "observer-stack", "observer-resolved"] as const;
export function observerCohort(view: PlayerObservation): string[] {
  if (view.decision?.kind !== "trigger-order") return [];
  const pending = new Set(view.decision.triggers);
  const groups = new Map<number, string[]>();
  for (const ability of view.abilities) {
    if (!pending.has(ability.id) || !("entry" in ability)) continue;
    const group = groups.get(ability.eventIndex) ?? [];
    group.push(ability.id);
    groups.set(ability.eventIndex, group);
  }
  return (
    [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .find(([, ids]) => ids.length >= 2)?.[1]
      .sort() ?? []
  );
}
/** Cohort IDs choose only proof checkpoints. They never enter the acting policy. */
export function atObserverStage(
  view: PlayerObservation,
  kind: string,
  events: readonly GameEvent[],
  cohort: readonly string[] = [],
): boolean {
  if (kind === "observer-order") return observerCohort(view).length >= 2;
  if (cohort.length < 2 || new Set(cohort).size !== cohort.length) return false;
  if (kind === "observer-stack")
    return (
      view.decision?.kind === "priority" &&
      cohort.every(
        (id) =>
          view.abilities.some((a) => a.id === id && "entry" in a) &&
          view.stack.some((s) => s.kind === "triggered-ability" && s.triggerId === id),
      )
    );
  if (kind === "observer-resolved")
    return (
      view.decision !== null &&
      cohort.every((id) => !view.abilities.some((a) => a.id === id)) &&
      events.some(
        (e) =>
          e.type === "TriggeredAbilityResolved" &&
          typeof e.data.trigger === "string" &&
          cohort.includes(e.data.trigger),
      )
    );
  return false;
}
/** Retained capture/resolution evidence is privileged audit data, never a driver observation. */
export function entryObserverEvidence(archive: MatchArchive, release: ContentRelease) {
  const captures = archive.records.flatMap((record) =>
    record.events.flatMap((event) => {
      if (event.type !== "TriggerCaptured" || event.data.entry === undefined) return [];
      const entry = EntryObserverCapture.parse(event.data.entry);
      const source =
        typeof event.data.definition === "string"
          ? release.definitions[event.data.definition]
          : undefined;
      const program = EntryObserverProgram.parse(source?.triggerPrograms?.[entry.programIndex]);
      if (typeof event.data.trigger !== "string" || typeof event.data.controller !== "string")
        throw new Error("Missing observer capture identity");
      const batch = record.events.find((e) => e.index === event.data.eventIndex);
      if (
        batch?.type !== "BattlefieldEntryBatch" ||
        !Array.isArray(batch.data.objects) ||
        !batch.data.objects.includes(entry.subject.id)
      )
        throw new Error("Observer capture lacks its actual entry batch");
      return [
        {
          id: event.data.trigger,
          revision: record.receipt.revision,
          eventIndex: event.index,
          sourceDefinition: source?.id,
          controller: event.data.controller,
          program,
          entry,
        },
      ];
    }),
  );
  const ids = new Set(captures.map((c) => c.id));
  if (ids.size !== captures.length) throw new Error("Duplicate observer capture identity");
  const resolved = archive.records.flatMap((record) =>
    record.events.flatMap((event) => {
      if (
        event.type !== "TriggeredAbilityResolved" ||
        typeof event.data.trigger !== "string" ||
        !ids.has(event.data.trigger)
      )
        return [];
      return [
        {
          id: event.data.trigger,
          revision: record.receipt.revision,
          eventIndex: event.index,
          effects: record.events
            .filter((e) => ["LifeGained", "CardDrawn", "DrawFromEmptyLibrary"].includes(e.type))
            .map((e) => ({ type: e.type, index: e.index, data: e.data })),
        },
      ];
    }),
  );
  return {
    captures,
    resolved,
    live: Object.values(archive.current.abilities).filter((a) => "entry" in a),
    pending: archive.current.pendingTriggers,
    stack: archive.current.stack.flatMap((s) =>
      s.kind === "triggered-ability" && ids.has(s.triggerId) ? [s.triggerId] : [],
    ),
    placement: archive.current.triggerPlacement,
  };
}
