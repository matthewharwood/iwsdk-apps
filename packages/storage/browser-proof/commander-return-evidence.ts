import { type ContentRelease, GameObject, ResolvingSpellFrame } from "@iwsdk-apps/contracts";
import type { Coordinator, MatchArchive } from "../src/index";

/** Capture the actual precommit continuation and associate each choice with its completed spell. */
export function commanderReturnEvidence(
  archive: MatchArchive,
  release: ContentRelease,
  coordinator: Coordinator,
) {
  const requests = archive.records.flatMap((record) =>
    record.events
      .filter((event) => event.type === "CommanderHandReplacementRequested")
      .map((event) => ({ revision: record.receipt.revision, event })),
  );
  const occurrences = archive.records.flatMap((record) =>
    record.events.flatMap((choice, choiceIndex) => {
      if (choice.type !== "CommanderHandReplacementChosen") return [];
      const requested = requests.find((row) => row.event.data.proposal === choice.data.proposal);
      if (
        !requested ||
        requested.revision >= record.receipt.revision ||
        record.command.response.kind !== "commander-replacement" ||
        record.command.actor !== choice.data.owner ||
        record.command.response.move !== choice.data.move ||
        requested.event.data.source !== choice.data.source ||
        requested.event.data.target !== choice.data.target ||
        requested.event.data.owner !== choice.data.owner
      )
        throw new Error("Replacement choice lacks its prior source-bound owner proposal");
      const returnIndex = record.events.findIndex(
        (event) =>
          event.type === "ReturnInstructionCompleted" && event.data.source === choice.data.source,
      );
      const returned = record.events[returnIndex];
      const targetMoveIndex = record.events.findIndex((event) => {
        if (event.type !== "ObjectMoved") return false;
        const before = GameObject.safeParse(event.data.before);
        return before.success && before.data.id === choice.data.target;
      });
      const targetMovement = record.events[targetMoveIndex];
      const before = GameObject.parse(targetMovement?.data.before);
      const after = GameObject.parse(targetMovement?.data.after);
      const resolvedIndex = record.events.findIndex(
        (event) => event.type === "SpellResolved" && event.data.source === choice.data.source,
      );
      const resolved = record.events[resolvedIndex];
      const definitionId = resolved?.data.definition;
      const definition =
        typeof definitionId === "string" ? release.definitions[definitionId] : undefined;
      const sourceMoveIndex = record.events.findIndex((event) => {
        if (event.type !== "ObjectMoved") return false;
        const source = GameObject.safeParse(event.data.before);
        return source.success && source.data.id === choice.data.source;
      });
      const sourceMovement = record.events[sourceMoveIndex];
      const sourceBefore = GameObject.parse(sourceMovement?.data.before);
      const sourceAfter = GameObject.parse(sourceMovement?.data.after);
      const destination = choice.data.move ? "command" : "hand";
      const drawIndices = record.events.flatMap((event, index) =>
        event.type === "CardDrawn" ? [index] : [],
      );
      const expectedDraws = definition?.spellProgram?.effects.filter(
        (effect) => effect.kind === "draw",
      ).length;
      if (
        !definition ||
        definition.spellProgram?.effects[0]?.kind !== "return-to-hand" ||
        !(
          choiceIndex < targetMoveIndex &&
          targetMoveIndex < returnIndex &&
          returnIndex < sourceMoveIndex &&
          sourceMoveIndex < resolvedIndex
        ) ||
        before.id !== choice.data.target ||
        before.zone !== "battlefield" ||
        !before.commander ||
        before.owner !== choice.data.owner ||
        after.id === before.id ||
        after.lineage !== before.lineage ||
        after.generation !== before.generation + 1 ||
        after.owner !== before.owner ||
        after.zone !== destination ||
        returned?.data.after !== after.id ||
        returned.data.before !== before.id ||
        returned.data.destination !== destination ||
        returned.data.owner !== before.owner ||
        returned.data.sourceController !== sourceBefore.controller ||
        sourceBefore.id !== choice.data.source ||
        sourceBefore.definition !== definition.id ||
        sourceBefore.zone !== "stack" ||
        sourceAfter.zone !== "graveyard" ||
        sourceAfter.lineage !== sourceBefore.lineage ||
        sourceAfter.generation !== sourceBefore.generation + 1 ||
        sourceAfter.id === sourceBefore.id ||
        resolved?.data.graveyardObject !== sourceAfter.id ||
        drawIndices.length !== expectedDraws ||
        drawIndices.some(
          (index) =>
            index <= returnIndex ||
            index >= sourceMoveIndex ||
            record.events[index]?.data.player !== sourceBefore.controller,
        )
      )
        throw new Error(
          "Replacement did not commit its owner destination before completing the same spell",
        );
      return [
        {
          proposal: choice.data.proposal,
          requestedRevision: requested.revision,
          choiceRevision: record.receipt.revision,
          command: record.command,
          receipt: record.receipt,
          sourceDefinition: definition.id,
          sourceVersion: definition.sourceVersion,
          program: definition.spellProgram,
          sourceBefore,
          sourceAfter,
          targetBefore: before,
          targetAfter: after,
          destination,
          owner: before.owner,
          move: choice.data.move,
          eventIndices: {
            requested: requested.event.index,
            choice: choice.index,
            targetMovement: targetMovement?.index,
            returned: returned.index,
            sourceMovement: sourceMovement?.index,
            resolved: resolved.index,
          },
          drawEvents: drawIndices.map((index) => record.events[index]),
        },
      ];
    }),
  );
  const state = coordinator.current();
  const frame = state.frames.find((candidate) => candidate.kind === "resolving-spell");
  const pending = frame ? ResolvingSpellFrame.parse(frame) : null;
  const sourceDefinition = pending ? release.definitions[pending.source.definition] : undefined;
  return {
    requests,
    occurrences,
    pending: pending
      ? {
          frame: pending,
          decision: state.decision,
          priorityPlayer: state.priorityPlayer,
          stack: state.stack,
          sourceDefinition,
          currentSource: state.objects[pending.source.id],
          currentTarget: state.objects[pending.target],
          ownerViews: state.players.map((player) => ({
            player: player.id,
            decision: coordinator.view(player.id).decision,
          })),
        }
      : null,
  };
}
