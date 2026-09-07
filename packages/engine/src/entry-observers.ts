import {
  type EntryObserverProgram,
  type ExecutionRegistry,
  GameEvent,
  type GameObject,
  type RulesState,
} from "@iwsdk-apps/contracts";
import {
  createView,
  type FieldSchema,
  prepareSelector,
  resolve,
  type Selector,
} from "@iwsdk-apps/rule-selection";
import { definition, emit, hit, player, RulesError } from "./common";
import {
  entrySubjectFacts,
  entrySubjectVersion,
  observerOccurrenceId,
} from "./entry-observer-context";
import { orderedObjects } from "./object-order";

const fields = {
  zone: "string",
  controller: "string",
  types: "string-set",
  subtypes: "string-set",
} satisfies FieldSchema;
const plans = new Map<string, ReturnType<typeof prepareSelector>>();
function subjectQuery(program: EntryObserverProgram): Selector {
  const filter = program.trigger.subject.filter;
  const terms: Selector[] = [{ op: "string-eq", field: "zone", value: "battlefield" }];
  if (filter.controller === "source-controller")
    terms.push({ op: "string-eq", field: "controller", value: { binding: "actor" } });
  for (const type of filter.types) terms.push({ op: "set-has", field: "types", value: type });
  if ("subtype" in filter) terms.push({ op: "set-has", field: "subtypes", value: filter.subtype });
  return { op: "and", terms };
}
function matchingSubjects(
  state: RulesState,
  registry: ExecutionRegistry,
  source: GameObject,
  program: EntryObserverProgram,
  entered: readonly GameObject[],
  eventIndex: number,
): Set<string> {
  const query = subjectQuery(program);
  const bindings = { actor: source.controller };
  const view = createView(
    "object",
    {
      match: state.manifest.id,
      revision: state.revision,
      epoch: state.epoch,
      lens: "after",
      eventVersion: String(eventIndex),
      processorVersion: "entry-observer-selection/1",
      bindingsKey: JSON.stringify(bindings),
      universe: "entry-batch",
      generation: state.epoch,
    },
    fields,
    entered.map((subject) => ({
      id: subject.id,
      values: {
        ...entrySubjectFacts(registry, subject),
        zone: subject.zone,
        controller: subject.controller,
      },
    })),
    bindings,
  );
  let result: ReturnType<typeof resolve>;
  if (state.manifest.resolver === "full-scan") result = resolve(view, query);
  else {
    const key = JSON.stringify(query);
    let plan = plans.get(key);
    if (!plan) {
      plan = prepareSelector(query, fields, {
        prefilterFields: ["zone", "controller"],
        indexedFields: ["zone", "controller", "types", "subtypes"],
      });
      if (plans.size >= 32) plans.clear();
      plans.set(key, plan);
    }
    result = resolve(view, query, { mode: state.manifest.resolver, plan });
  }
  const ids = new Set(result.ids);
  if (program.trigger.subject.filter.excludeSource) ids.delete(source.id);
  // CR700.7: the explicit self alternative ignores the descriptive type filter.
  if (
    program.trigger.subject.kind === "self-or-filter" &&
    entered.some((subject) => subject.id === source.id)
  )
    ids.add(source.id);
  return ids;
}
function captureObserver(
  state: RulesState,
  registry: ExecutionRegistry,
  source: GameObject,
  program: EntryObserverProgram,
  programIndex: number,
  subject: GameObject,
  occurrenceOrdinal: number,
  eventIndex: number,
): void {
  const card = definition(registry, source.definition);
  const id = observerOccurrenceId(state, source, eventIndex, programIndex, occurrenceOrdinal);
  if (state.abilities[id]) throw new RulesError("Invariant", "Observer occurrence captured twice");
  const entry = {
    schema: "entry-observer-capture/1" as const,
    batchId: `entry:${eventIndex}`,
    programIndex,
    subject: structuredClone(subject),
    subjectVersion: entrySubjectVersion(registry, subject),
    facts: entrySubjectFacts(registry, subject),
  };
  state.abilities[id] = {
    id,
    source: structuredClone(source),
    sourceVersion: card.sourceVersion,
    controller: source.controller,
    program: structuredClone(program),
    eventIndex,
    occurrenceOrdinal,
    entry,
  };
  state.pendingTriggers.push(id);
  emit(
    state,
    "TriggerCaptured",
    GameEvent.shape.data.parse({
      trigger: id,
      source: source.id,
      controller: source.controller,
      definition: card.id,
      ability: program.id,
      eventIndex,
      occurrenceOrdinal,
      subject: subject.id,
      subjectDefinition: subject.definition,
      subjectVersion: entry.subjectVersion,
      batchId: entry.batchId,
      subjectFacts: entry.facts,
      entry,
      sourceSnapshot: structuredClone(source),
    }),
  );
  for (const rule of ["603.2", "603.2c", "603.6a", "603.10", "603.3a"]) hit(state, `rule:${rule}`);
  if (program.trigger.subject.kind === "self-or-filter") hit(state, "rule:700.7");
  hit(state, `card:${card.id}:trigger:${program.id}:capture`);
}
/** Every existing and newly entered observer sees every entrant in the committed batch. */
export function captureEntryObservers(
  state: RulesState,
  registry: ExecutionRegistry,
  entered: readonly GameObject[],
  eventIndex: number,
): void {
  for (const source of orderedObjects(state)) {
    if (source.zone !== "battlefield" || source.token || player(state, source.controller).lost)
      continue;
    for (const [programIndex, program] of (
      definition(registry, source.definition).triggerPrograms ?? []
    ).entries()) {
      if (program.schema !== "commander-entry-observer/1") continue;
      const selected = matchingSubjects(state, registry, source, program, entered, eventIndex);
      for (const [ordinal, subject] of entered.entries())
        if (selected.has(subject.id)) {
          captureObserver(
            state,
            registry,
            source,
            program,
            programIndex,
            subject,
            ordinal,
            eventIndex,
          );
        }
    }
  }
}
