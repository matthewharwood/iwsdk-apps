import type {
  ExecutionRegistry,
  GameObject,
  ResolvingSpellFrame,
  Response,
  RulesState,
  SpellProgram,
} from "@iwsdk-apps/contracts";
import { card, draw, emit, hit, move, object, RulesError, request, requireRule } from "./common";
import { handProposalId } from "./resolution-context";

type ReturnContext = Pick<
  ResolvingSpellFrame,
  "source" | "sourceVersion" | "controller" | "program" | "target" | "effectIndex"
>;
function commitReturn(
  state: RulesState,
  context: ReturnContext,
  destination: "hand" | "command",
): void {
  const before = object(state, context.target);
  const after = move(
    state,
    before.id,
    destination,
    destination === "hand"
      ? "return creature to owner hand"
      : "commander hand destination replacement",
  );
  emit(state, "ReturnInstructionCompleted", {
    source: context.source.id,
    sourceController: context.controller,
    before: before.id,
    after: after.id,
    owner: before.owner,
    destination,
  });
  hit(state, "rule:400.3");
  hit(state, "rule:400.7");
}
function finishReturn(state: RulesState, context: ReturnContext): void {
  // The whole-spell target check has already succeeded. The returned incarnation
  // is deliberately not queried again between the movement and the following draw.
  for (let index = context.effectIndex; index < context.program.effects.length; index++) {
    const effect = context.program.effects[index];
    if (effect?.kind !== "draw" || effect.recipient !== "controller" || effect.amount !== 1)
      throw new RulesError("UnsupportedMechanic", "Unsupported instruction after creature return");
    draw(state, context.controller, 1);
  }
  const grave = move(
    state,
    context.source.id,
    "graveyard",
    "instant or sorcery resolution completed",
  );
  emit(state, "SpellResolved", {
    source: context.source.id,
    definition: context.source.definition,
    target: context.target,
    graveyardObject: grave.id,
  });
  for (const rule of ["608.2c", "608.2n", "704.4"]) hit(state, `rule:${rule}`);
  hit(state, `card:${context.source.definition}:resolve`);
}

/** The only admitted replacement is903.9b for one proposed owner-hand movement. */
export function beginReturnResolution(
  state: RulesState,
  release: ExecutionRegistry,
  source: GameObject,
  program: SpellProgram,
  target: string,
): boolean {
  const before = object(state, target);
  const context: ReturnContext = {
    source: structuredClone(source),
    sourceVersion: card(state, release, source.id).sourceVersion,
    controller: source.controller,
    program: structuredClone(program),
    target,
    effectIndex: 0,
  };
  if (!before.commander) {
    commitReturn(state, context, "hand");
    context.effectIndex++;
    finishReturn(state, context);
    return true;
  }
  requireRule(state.frames.length === 0, "Resolution cannot overlap another workflow");
  const proposedAtEvent = state.eventSequence;
  const id = handProposalId(proposedAtEvent);
  state.frames.push({
    kind: "resolving-spell",
    ...context,
    pendingMovement: {
      id,
      proposedAtEvent,
      before: structuredClone(before),
      destination: "hand",
      replacement: "commander-hand/1",
    },
  });
  emit(state, "CommanderHandReplacementRequested", {
    proposal: id,
    source: source.id,
    target,
    owner: before.owner,
    destination: "hand",
    effectIndex: 0,
  });
  state.priorityPlayer = null;
  request(state, "commander-replacement", before.owner, {
    cards: [target],
    count: 1,
    context:
      "Put your commander into the command zone instead of your hand? The resolving spell will then continue.",
  });
  hit(state, "rule:117.2e");
  return false;
}

export function answerCommanderReplacement(
  state: RulesState,
  actor: string,
  response: Response,
): boolean {
  requireRule(
    response.kind === "commander-replacement",
    "Expected resolution-time commander replacement choice",
  );
  const frame = state.frames.at(-1);
  requireRule(frame?.kind === "resolving-spell", "No resolving spell continuation");
  requireRule(
    frame.pendingMovement.before.owner === actor,
    "Only the commander owner may replace this movement",
  );
  // transition validates the full frozen continuation before cloning/resetting its event batch.
  emit(state, "CommanderHandReplacementChosen", {
    proposal: frame.pendingMovement.id,
    source: frame.source.id,
    target: frame.target,
    owner: actor,
    move: response.move,
  });
  commitReturn(state, frame, response.move ? "command" : "hand");
  hit(state, "rule:903.9b");
  if (response.move) hit(state, "rule:614.6");
  frame.effectIndex++;
  state.frames.pop();
  finishReturn(state, frame);
  return true;
}
