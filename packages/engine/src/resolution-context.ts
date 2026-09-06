import {
  canonicalJson,
  type ExecutionRegistry,
  ResolvingSpellFrame,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { definition, RulesError } from "./common";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("Invariant", message);
}
export function handProposalId(event: number): string {
  return `hand-movement:${event}`;
}

/** Verify the durable precommit boundary, including its actual retained proposal event. */
export function assertResolutionContinuation(state: RulesState, release: ExecutionRegistry): void {
  const candidates = state.frames.filter((frame) => frame.kind === "resolving-spell");
  if (!candidates.length) {
    invariant(
      state.decision?.kind !== "commander-replacement",
      "Replacement decision lost its resolution continuation",
    );
    return;
  }
  invariant(
    candidates.length === 1 && state.frames.length === 1,
    "Resolution continuation overlaps another workflow",
  );
  const parsed = ResolvingSpellFrame.safeParse(candidates[0]);
  invariant(parsed.success, "Invalid serialized resolution continuation");
  const frame = parsed.data;
  const current = state.objects[frame.source.id];
  const programSource = definition(release, frame.source.definition);
  const movement = frame.pendingMovement;
  const top = state.stack.at(-1);
  invariant(
    top?.kind === "spell" && top.objectId === frame.source.id && current?.zone === "stack",
    "Resolving source is not the top stack incarnation",
  );
  invariant(
    canonicalJson(current) === canonicalJson(frame.source),
    "Resolving source snapshot changed",
  );
  invariant(
    programSource.sourceVersion === frame.sourceVersion &&
      canonicalJson(programSource.spellProgram) === canonicalJson(frame.program),
    "Resolving program differs from its source pin",
  );
  invariant(
    frame.controller === frame.source.controller &&
      frame.source.spellState?.target === frame.target,
    "Resolution controller or target differs from the captured spell",
  );
  invariant(
    frame.program.target === "creature" &&
      frame.effectIndex === 0 &&
      frame.program.effects[0]?.kind === "return-to-hand",
    "Unsupported resolution instruction cursor",
  );
  invariant(
    movement.before.id === frame.target &&
      movement.before.zone === "battlefield" &&
      movement.before.commander &&
      canonicalJson(state.objects[frame.target]) === canonicalJson(movement.before),
    "Pending movement changed its commander incarnation",
  );
  invariant(
    state.players.some((seat) => seat.id === movement.before.owner && !seat.lost),
    "Replacement owner is not living",
  );
  invariant(
    state.priorityPlayer === null &&
      state.outcome.kind === "ongoing" &&
      state.decision?.kind === "commander-replacement" &&
      state.decision.actor === movement.before.owner &&
      state.decision.count === 1 &&
      canonicalJson(state.decision.cards) === canonicalJson([frame.target]),
    "Resolution replacement has no exclusive owner decision",
  );
  invariant(
    movement.id === handProposalId(movement.proposedAtEvent) &&
      movement.proposedAtEvent < state.eventSequence,
    "Pending movement proposal identity changed",
  );
  const proposed = state.events.find(
    (event) =>
      event.index === movement.proposedAtEvent &&
      event.type === "CommanderHandReplacementRequested",
  );
  invariant(
    proposed?.data.proposal === movement.id &&
      proposed.data.source === frame.source.id &&
      proposed.data.target === frame.target &&
      proposed.data.owner === movement.before.owner &&
      proposed.data.destination === "hand" &&
      proposed.data.effectIndex === 0,
    "Pending movement differs from its retained proposal event",
  );
}
