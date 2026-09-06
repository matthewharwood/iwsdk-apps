import type { ExecutionRegistry, RulesState } from "@iwsdk-apps/contracts";
import { assertRegistryPin, definition, RulesError } from "./common";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("Invariant", message);
}
export function assertInvariants(state: RulesState, release: ExecutionRegistry): void {
  assertRegistryPin(state.manifest, release);
  const listed = new Set<string>();
  for (const seat of state.players) {
    for (const zone of ["library", "hand", "graveyard"] as const)
      for (const id of seat[zone]) {
        invariant(!listed.has(id), "An object appears in multiple ordered zones");
        listed.add(id);
        invariant(
          state.objects[id]?.owner === seat.id && state.objects[id]?.zone === zone,
          "Ordered zone membership mismatch",
        );
      }
  }
  const lineages = new Set<string>();
  for (const entry of Object.values(state.objects)) {
    definition(release, entry.definition);
    invariant(
      entry.id === `${entry.lineage}@${entry.generation}`,
      "Object generation identity mismatch",
    );
    invariant(!lineages.has(entry.lineage), "More than one live generation of a physical card");
    lineages.add(entry.lineage);
    invariant(
      state.players.some((seat) => seat.id === entry.owner && !seat.lost),
      "Object owned by missing/departed player",
    );
    invariant(
      state.players.some((seat) => seat.id === entry.controller && !seat.lost),
      "Object controlled by missing/departed player",
    );
    invariant(
      !["library", "hand", "graveyard"].includes(entry.zone) || listed.has(entry.id),
      "Object missing from its ordered zone",
    );
    invariant(
      entry.zone !== "stack" || state.stack.includes(entry.id),
      "Stack object missing from stack order",
    );
    invariant(
      !entry.spellState || entry.zone === "stack",
      "Spell target state escaped its stack object",
    );
    const program = definition(release, entry.definition).spellProgram;
    if (entry.zone === "stack" && program) {
      invariant(entry.spellState, "Programmed spell has no serialized target state");
      const isBeingCast = state.frames.some(
        (frame) => frame.kind === "casting" && frame.card === entry.id,
      );
      invariant(
        program.target === null
          ? entry.spellState.target === null
          : isBeingCast || entry.spellState.target !== null,
        "Completed casting has inconsistent chosen target state",
      );
    }
  }
  invariant(
    new Set(state.stack).size === state.stack.length &&
      state.stack.every((id) => state.objects[id]?.zone === "stack"),
    "Invalid stack order",
  );
  for (const seat of state.players.filter((candidate) => !candidate.lost)) {
    invariant(
      Object.values(state.objects).filter((entry) => entry.owner === seat.id).length === 100,
      "Physical card inventory changed without an implemented create/remove operation",
    );
  }
  if (state.outcome.kind === "ongoing") {
    invariant(state.decision !== null, "Ongoing transition has no serializable decision");
    invariant(
      state.players.some((seat) => seat.id === state.decision?.actor && !seat.lost),
      "Decision assigned to a departed/missing player",
    );
    invariant(state.decision.revision === state.revision, "Stale decision revision");
    if (state.decision.kind === "target" || state.decision.kind === "payment") {
      const frame = state.frames.at(-1);
      invariant(
        frame?.kind === "casting" && frame.actor === state.decision.actor,
        "Casting decision has no owned continuation",
      );
      invariant(
        state.objects[frame.card]?.zone === "stack",
        "Casting continuation lost its announced spell",
      );
      const spell = state.objects[frame.card];
      if (spell && definition(release, spell.definition).spellProgram)
        invariant(
          spell.spellState?.target === frame.target,
          "Casting target and stack target state disagree",
        );
      if (state.decision.kind === "target")
        invariant(
          !!definition(release, state.objects[frame.card]?.definition ?? "").spellProgram?.target,
          "Target decision lacks a targeted program",
        );
    }
  } else invariant(state.decision === null, "Finished game exposes a gameplay decision");
}
