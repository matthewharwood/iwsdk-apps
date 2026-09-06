import { type ResolvingSpellFrame, SpellProgram } from "@iwsdk-apps/contracts";
import { move } from "../src/common";
import { admitDeck } from "../src/index";
import { answer, type CounterFixture, cast, counterFixture, locate } from "./counterspells";

/** Explicit constructed source programs/boards; production authentication has no fixture exception. */
export function returnFixture(cantrip = true, seats: 2 | 4 = 2) {
  const f = counterFixture(seats);
  const original = f.registry.definitions["draw-spell"];
  if (!original) throw new Error("Missing constructed spell template");
  f.registry.definitions["draw-spell"] = {
    ...original,
    implementationRevision: "constructed-creature-return/1",
    oracleText: "Constructed return instruction",
    spellProgram: SpellProgram.parse({
      schema: "commander-spell/1",
      target: "creature",
      effects: [
        { kind: "return-to-hand" },
        ...(cantrip ? [{ kind: "draw", recipient: "controller", amount: 1 }] : []),
      ],
    }),
  };
  for (const seat of f.state.manifest.seats) admitDeck(seat.deck, f.registry);
  return f;
}
export function putTarget(f: CounterFixture, actor = "B", commander = true): string {
  return move(
    f.state,
    locate(f, actor, commander ? "commander" : "creature").id,
    "battlefield",
    "constructed return target",
  ).id;
}
export function castReturn(f: CounterFixture, target: string, actor = "A"): string {
  return cast(f, actor, "draw-spell", target);
}
export function resolveReturn(f: CounterFixture): void {
  for (let n = 0; n < f.state.players.length && f.state.decision?.kind === "priority"; n++) {
    answer(f, { kind: "pass" });
    if (f.state.stack.length === 0) return;
  }
}
export function pendingReturn(f: CounterFixture): ResolvingSpellFrame {
  const frame = f.state.frames.at(-1);
  if (frame?.kind !== "resolving-spell") throw new Error("Missing suspended resolution");
  return frame;
}
