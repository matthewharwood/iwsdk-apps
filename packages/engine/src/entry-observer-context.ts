import {
  canonicalJson,
  type EntryObserverAbility,
  type EntryObserverProgram,
  type EntrySubjectFacts,
  type ExecutionRegistry,
  type GameObject,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { definition, RulesError } from "./common";
import { objectBase } from "./object-definitions";
import { assertToken } from "./token-invariants";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("Invariant", message);
}
/** Current fragment has no processor changing types/subtypes before observer matching. */
export function entrySubjectFacts(
  registry: ExecutionRegistry,
  subject: GameObject,
): EntrySubjectFacts {
  const base = objectBase(registry, subject);
  return { types: [...base.types], subtypes: [...base.subtypes] };
}
export function entrySubjectVersion(registry: ExecutionRegistry, subject: GameObject): string {
  return subject.token
    ? objectBase(registry, subject).id.slice("token-template:".length)
    : definition(registry, subject.definition).sourceVersion;
}
function physicalCoordinate(state: RulesState, source: GameObject): string {
  const ownerIndex = state.manifest.seats.findIndex((seat) => seat.id === source.owner);
  const owner = state.manifest.seats[ownerIndex];
  invariant(owner && !source.token, "Observer source is not an original physical card");
  let ordinal = 0;
  for (const entry of owner.deck.entries) {
    for (let n = 0; n < entry.count; n++) {
      if (source.lineage === `${source.owner}:card:${ordinal}`) {
        invariant(
          source.definition === entry.definition,
          "Captured source differs from its original deck slot",
        );
        return `${ownerIndex}:${ordinal}:${source.generation}`;
      }
      ordinal++;
    }
  }
  throw new RulesError("Invariant", "Captured physical source has no original deck slot");
}
/** Match-local numeric coordinates avoid both delimiter collisions and unbounded compound IDs. */
export function observerOccurrenceId(
  state: RulesState,
  source: GameObject,
  eventIndex: number,
  programIndex: number,
  subjectOrdinal: number,
): string {
  return `entry-observer:${eventIndex}:${physicalCoordinate(state, source)}:${programIndex}:${subjectOrdinal}`;
}
/** Historical evidence predicate only: no current-state lookup or resolution-time retargeting. */
export function matchesCapturedEntry(
  program: EntryObserverProgram,
  source: GameObject,
  subject: GameObject,
  facts: EntrySubjectFacts,
): boolean {
  const selector = program.trigger.subject;
  if (selector.kind === "self-or-filter" && source.id === subject.id) return true;
  const filter = selector.filter;
  return (
    subject.zone === "battlefield" &&
    (!filter.excludeSource || source.id !== subject.id) &&
    (filter.controller === "any" || source.controller === subject.controller) &&
    filter.types.every((type) => facts.types.includes(type)) &&
    (!("subtype" in filter) || facts.subtypes.includes(filter.subtype))
  );
}
export function assertObserverContext(
  state: RulesState,
  registry: ExecutionRegistry,
  ability: EntryObserverAbility,
): void {
  const { entry } = ability;
  const subject = entry.subject;
  invariant(
    ability.id ===
      observerOccurrenceId(
        state,
        ability.source,
        ability.eventIndex,
        entry.programIndex,
        ability.occurrenceOrdinal,
      ) &&
      entry.batchId === `entry:${ability.eventIndex}` &&
      ability.eventIndex < state.eventSequence,
    "Observer occurrence or batch identity changed",
  );
  invariant(
    subject.id === `${subject.lineage}@${subject.generation}` &&
      subject.zone === "battlefield" &&
      state.players.some((seat) => seat.id === subject.owner) &&
      state.players.some((seat) => seat.id === subject.controller),
    "Observer subject is not a captured battlefield incarnation",
  );
  if (subject.token) assertToken(state, registry, subject);
  else physicalCoordinate(state, subject);
  const program = definition(registry, ability.source.definition).triggerPrograms?.[
    entry.programIndex
  ];
  invariant(
    canonicalJson(program ?? null) === canonicalJson(ability.program) &&
      entry.subjectVersion === entrySubjectVersion(registry, subject) &&
      canonicalJson(entry.facts) === canonicalJson(entrySubjectFacts(registry, subject)),
    "Observer source program or subject facts differ from pinned definitions",
  );
  invariant(
    matchesCapturedEntry(ability.program, ability.source, subject, entry.facts),
    "Captured observer did not match its recorded entry subject",
  );
  const capture = state.events.find(
    (candidate) => candidate.type === "TriggerCaptured" && candidate.data.trigger === ability.id,
  );
  if (capture)
    invariant(
      canonicalJson(capture.data.entry) === canonicalJson(entry) &&
        canonicalJson(capture.data.sourceSnapshot) === canonicalJson(ability.source),
      "Observer context differs from its retained capture event",
    );
  const event = state.events.find((candidate) => candidate.index === ability.eventIndex);
  if (event)
    invariant(
      event.type === "BattlefieldEntryBatch" &&
        Array.isArray(event.data.objects) &&
        event.data.objects[ability.occurrenceOrdinal] === subject.id,
      "Observer subject occurrence differs from the retained entry event",
    );
}
