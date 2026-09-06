import type { ContentRelease } from "@iwsdk-apps/contracts";
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
