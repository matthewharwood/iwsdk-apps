import {
  type CardDefinition,
  EntryObserverProgram,
  type EntrySubjectFilter,
  type MatchManifest,
  type SelfEntryEffect,
} from "@iwsdk-apps/contracts";
import { definition, move } from "../src/common";
import { admitDeck } from "../src/index";
import { enterBattlefield } from "../src/triggers";
import { givePriority } from "../src/turns";
import { answer, type CounterFixture, counterFixture, locate, resolveOne } from "./counterspells";

/** These are constructed rule scenarios; no synthetic source passes production authentication. */
export function observerProgram(
  filter: EntrySubjectFilter = {
    types: ["Creature"],
    controller: "any",
    excludeSource: true,
    token: "any",
  },
  effects: readonly SelfEntryEffect[] = [
    { kind: "gain-life", recipient: "trigger-controller", amount: 1 },
  ],
  self = false,
): EntryObserverProgram {
  return EntryObserverProgram.parse({
    schema: "commander-entry-observer/1",
    id: "constructed-observer-0",
    trigger: {
      kind: "permanent-enters-battlefield",
      view: "post-committed-event",
      placementClass: "ordinary",
      sourceZone: "battlefield",
      occurrence: "each-matching-object",
      subject: { kind: self ? "self-or-filter" : "filter", filter },
    },
    choice: { kind: "mandatory" },
    effects,
  });
}
export function observerFixture(mode: MatchManifest["resolver"] = "full-scan", seats: 2 | 4 = 2) {
  const f = counterFixture(seats);
  f.state.manifest.resolver = mode;
  if (mode !== "full-scan")
    f.state.manifest.preparedArtifactHash = f.registry.preparedArtifactHash = "d".repeat(64);
  return f;
}
export function installObserver(
  f: CounterFixture,
  slot: string,
  program = observerProgram(),
  change: Partial<CardDefinition> = {},
) {
  Object.assign(definition(f.registry, slot), { triggerPrograms: [program], ...change });
  for (const seat of f.state.manifest.seats) admitDeck(seat.deck, f.registry);
}
/** Declared pre-existing board, not an unrecorded ordinary spell resolution. */
export function board(f: CounterFixture, slot: string, actor = "A") {
  return move(f.state, locate(f, actor, slot).id, "battlefield", "constructed prior observer board")
    .id;
}
export function enterBatch(
  f: CounterFixture,
  slots: readonly { slot: string; owner?: string; controller?: string }[],
) {
  return enterBattlefield(
    f.state,
    f.registry,
    slots.map(({ slot, owner = "A", controller = owner }) => ({
      objectId: locate(f, owner, slot).id,
      controller,
    })),
    "constructed entry batch",
  );
}
export function priority(f: CounterFixture, actor = "A") {
  givePriority(f.state, f.registry, actor);
}
export function finishObservers(f: CounterFixture) {
  for (let n = 0; n < 200; n++) {
    if (f.state.outcome.kind !== "ongoing") return;
    if (f.state.decision?.kind === "trigger-order")
      answer(f, { kind: "trigger-order", triggers: [...f.state.decision.triggers] });
    else if (f.state.stack.length) resolveOne(f);
    else return;
  }
  throw new Error("Observer fixture exceeded its bounded resolution budget");
}
