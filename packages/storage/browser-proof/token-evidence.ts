import { type ContentRelease, GameObject } from "@iwsdk-apps/contracts";
import type { Coordinator, MatchArchive } from "../src/index";

/** Privileged proof evidence. None of this history is supplied to the acting driver. */
export function tokenEvidence(
  archive: MatchArchive,
  release: ContentRelease,
  coordinator: Coordinator,
) {
  const state = coordinator.current();
  const live = Object.values(state.objects)
    .filter((object) => object.token)
    .map((object) => ({
      object,
      template: release.tokenTemplates?.[object.definition] ?? null,
    }));
  const pending = state.stack.flatMap((entry) => {
    if (entry.kind !== "spell") return [];
    const source = state.objects[entry.objectId];
    const definition = source ? release.definitions[source.definition] : undefined;
    const effect = definition?.spellProgram?.effects[0];
    return source && definition && effect?.kind === "create-token"
      ? [
          {
            source,
            definition,
            effect,
            template: release.tokenTemplates?.[effect.templateId] ?? null,
          },
        ]
      : [];
  });
  const creations = archive.records.flatMap((record) =>
    record.events
      .filter((event) => event.type === "TokensCreated")
      .map((event) => ({ revision: record.receipt.revision, event, command: record.command })),
  );
  const departures = archive.records.flatMap((record) =>
    record.events.flatMap((event) => {
      if (event.type !== "ObjectMoved") return [];
      const before = GameObject.safeParse(event.data.before).data;
      const after = GameObject.safeParse(event.data.after).data;
      if (!before?.token || !after) return [];
      const ceased = record.events.find(
        (candidate) =>
          candidate.type === "TokensCeased" &&
          Array.isArray(candidate.data.objects) &&
          candidate.data.objects.some(
            (value) =>
              typeof value === "object" &&
              value !== null &&
              !Array.isArray(value) &&
              value.object === after.id,
          ),
      );
      return [
        {
          revision: record.receipt.revision,
          before,
          after,
          movement: event,
          cessation: ceased ?? null,
          command: record.command,
          receipt: record.receipt,
        },
      ];
    }),
  );
  const cessations = archive.records.flatMap((record) =>
    record.events
      .filter((event) => event.type === "TokensCeased")
      .map((event) => ({ revision: record.receipt.revision, event })),
  );
  return {
    live,
    pending,
    creations,
    departures,
    cessations,
    physicalCards: state.players.map((seat) => ({
      player: seat.id,
      lost: seat.lost,
      count: Object.values(state.objects).filter(
        (object) => !object.token && object.owner === seat.id,
      ).length,
    })),
  };
}
