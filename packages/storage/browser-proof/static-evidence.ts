import {
  type ContentRelease,
  type GameEvent,
  GameObject,
  type PlayerObservation,
  type StaticCreatureBonus,
} from "@iwsdk-apps/contracts";
import type { Coordinator, MatchArchive } from "../src/index";

type VisibleObject = PlayerObservation["objects"][number];
function applies(source: GameObject, target: VisibleObject, program: StaticCreatureBonus) {
  const traits = target.card ?? target.tokenTemplate?.characteristics;
  if (
    !traits ||
    target.zone !== "battlefield" ||
    !traits.types.includes("Creature") ||
    source.controller !== target.controller ||
    (program.excludeSource && source.id === target.id)
  )
    return false;
  if (program.predicate.kind === "legendary")
    return traits.supertypes.some((supertype) => supertype === "Legendary");
  if (program.predicate.kind === "subtype")
    return traits.subtypes.includes(program.predicate.subtype);
  return true;
}
function contributions(objects: readonly VisibleObject[], target: VisibleObject) {
  return objects.flatMap((source) =>
    source.zone !== "battlefield"
      ? []
      : (source.card?.staticPrograms ?? []).flatMap((program) =>
          applies(source, target, program)
            ? [
                {
                  source: source.id,
                  definition: source.definition,
                  program,
                  power: program.powerDelta,
                  toughness: program.toughnessDelta,
                },
              ]
            : [],
        ),
  );
}
function movedStatic(events: readonly GameEvent[], release: ContentRelease) {
  return events.flatMap((event) => {
    if (event.type !== "ObjectMoved") return [];
    const before = GameObject.safeParse(event.data.before).data;
    const after = GameObject.safeParse(event.data.after).data;
    const definition = before && release.definitions[before.definition];
    return before && after && definition?.staticPrograms
      ? [{ before, after, definition, event }]
      : [];
  });
}
/** Stop predicates are proof instrumentation, never input to the acting driver. */
export function atStaticStage(
  view: PlayerObservation,
  kind: string,
  events: readonly GameEvent[],
  release?: ContentRelease,
) {
  if (kind === "pending-static")
    return (
      view.decision?.kind === "priority" &&
      view.stack.some(
        (entry) =>
          entry.kind === "spell" &&
          view.objects.some(
            (object) => object.id === entry.objectId && !!object.card?.staticPrograms,
          ),
      )
    );
  if (kind === "active-static")
    return (
      view.decision?.kind === "priority" &&
      view.objects.some((target) => contributions(view.objects, target).length > 0)
    );
  if (kind !== "static-departure" || !view.decision || !release) return false;
  return movedStatic(events, release).some(
    ({ before, after, definition }) =>
      before.zone === "battlefield" &&
      after.zone !== "battlefield" &&
      view.objects.some((target) =>
        definition.staticPrograms?.some((program) => applies(before, target, program)),
      ),
  );
}
/** Privileged audit projection with separately calculated additive expectations. */
export function staticEvidence(
  archive: MatchArchive,
  release: ContentRelease,
  coordinator: Coordinator,
) {
  const state = coordinator.current();
  const viewer = state.players[0]?.id;
  if (!viewer) throw new Error("Missing static proof viewer");
  const objects = coordinator.view(viewer).objects;
  const liveSources = objects.filter(
    (object) => object.zone === "battlefield" && !!object.card?.staticPrograms,
  );
  const pending = state.stack.flatMap((entry) =>
    entry.kind !== "spell"
      ? []
      : objects.filter((object) => object.id === entry.objectId && !!object.card?.staticPrograms),
  );
  const recipients = objects.flatMap((object) => {
    const traits = object.card ?? object.tokenTemplate?.characteristics;
    if (
      object.zone !== "battlefield" ||
      !traits?.types.includes("Creature") ||
      traits.power === null ||
      traits.toughness === null
    )
      return [];
    const statics = contributions(objects, object);
    const temporary = state.continuousEffects.filter(
      (effect) => effect.affectedObject === object.id,
    );
    const counters = (object.counters["+1/+1"] ?? 0) - (object.counters["-1/-1"] ?? 0);
    const expected = {
      power:
        traits.power +
        counters +
        statics.reduce((sum, c) => sum + c.power, 0) +
        temporary.reduce((sum, e) => sum + e.modifier.powerDelta, 0),
      toughness:
        traits.toughness +
        counters +
        statics.reduce((sum, c) => sum + c.toughness, 0) +
        temporary.reduce((sum, e) => sum + e.modifier.toughnessDelta, 0),
      keywords: [
        ...new Set([
          ...traits.keywords,
          ...temporary.flatMap((effect) => effect.modifier.keywords),
        ]),
      ].sort(),
    };
    return [{ object, statics, temporary, counters, expected }];
  });
  const movements = archive.records.flatMap((record) =>
    movedStatic(record.events, release).map((movement) => ({
      revision: record.receipt.revision,
      ...movement,
    })),
  );
  const entries = movements.filter(
    ({ before, after }) => before.zone === "stack" && after.zone === "battlefield",
  );
  const departures = movements.filter(
    ({ before, after }) => before.zone === "battlefield" && after.zone !== "battlefield",
  );
  const cessationWitnesses = departures
    .filter((row) => row.revision === state.revision)
    .flatMap((departure) =>
      recipients
        .filter(({ object }) =>
          departure.definition.staticPrograms?.some((program) =>
            applies(departure.before, object, program),
          ),
        )
        .map(({ object }) => ({
          source: departure.before.id,
          sourceDefinition: departure.definition.id,
          recipient: object.id,
          sourceAfter: departure.after.id,
        })),
    );
  return { pending, liveSources, recipients, entries, departures, cessationWitnesses };
}
