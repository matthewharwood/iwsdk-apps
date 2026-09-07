import { expect, test } from "bun:test";
import { canonicalJson } from "@iwsdk-apps/contracts";
import { observe } from "../../engine/src/index";
import { answer, resolveOne } from "../../engine/test-fixtures/counterspells";
import {
  board,
  enterBatch,
  installObserver,
  observerFixture,
  priority,
} from "../../engine/test-fixtures/entry-observers";
import { atObserverStage, observerCohort } from "./entry-observer-evidence";

function pending() {
  // Constructed proof-predicate scenario, not a source-authenticated game.
  const f = observerFixture();
  for (const slot of ["creature", "protected-creature"]) {
    installObserver(f, slot);
    board(f, slot);
  }
  enterBatch(f, [{ slot: "artifact-creature" }]);
  priority(f);
  expect(f.state.decision?.kind).toBe("trigger-order");
  const cohort = observerCohort(observe(f.state, f.registry, "A"));
  expect(cohort).toHaveLength(2);
  return { ...f, cohort };
}
function view(f: ReturnType<typeof pending>) {
  return observe(f.state, f.registry, "A");
}
function ordered(f: ReturnType<typeof pending>) {
  const decision = f.state.decision;
  if (decision?.kind !== "trigger-order") throw new Error("Missing trigger order");
  answer(f, { kind: "trigger-order", triggers: [...decision.triggers] });
}
test("proof binds one actual pending same-event observer cohort and cannot use another player's hidden decision", () => {
  const f = pending();
  const before = canonicalJson(f.state);
  expect(atObserverStage(view(f), "observer-order", f.state.events)).toBe(true);
  expect(observerCohort(observe(f.state, f.registry, "B"))).toEqual([]);
  expect(atObserverStage(view(f), "observer-stack", f.state.events, f.cohort)).toBe(false);
  expect(canonicalJson(f.state)).toBe(before);
});
test("the exact captured identities must reach the stack after ordinary ordering", () => {
  const f = pending();
  ordered(f);
  expect(atObserverStage(view(f), "observer-stack", f.state.events, f.cohort)).toBe(true);
  expect(atObserverStage(view(f), "observer-order", f.state.events)).toBe(false);
  expect(
    atObserverStage(view(f), "observer-stack", f.state.events, [
      f.cohort[0] ?? "missing",
      "unrelated",
    ]),
  ).toBe(false);
});
test("one resolution cannot satisfy the full cohort; the last matching resolution can", () => {
  const f = pending();
  ordered(f);
  resolveOne(f);
  expect(atObserverStage(view(f), "observer-resolved", f.state.events, f.cohort)).toBe(false);
  resolveOne(f);
  expect(atObserverStage(view(f), "observer-resolved", f.state.events, f.cohort)).toBe(true);
  expect(atObserverStage(view(f), "observer-resolved", [], f.cohort)).toBe(false);
  expect(atObserverStage(view(f), "observer-stack", f.state.events, f.cohort)).toBe(false);
});
test("empty, singleton and repeated occurrence IDs cannot qualify stack or resolution checkpoints", () => {
  const f = pending();
  ordered(f);
  const id = f.cohort[0] ?? "missing";
  for (const cohort of [[], [id], [id, id]])
    for (const kind of ["observer-stack", "observer-resolved"])
      expect(atObserverStage(view(f), kind, f.state.events, cohort)).toBe(false);
});
test("a singleton observer plus a different capture event is not one multi-observer entry cohort", () => {
  const f = pending();
  const v = view(f);
  const first = v.abilities[0];
  if (!first) throw new Error("Missing captured ability");
  first.eventIndex++;
  expect(observerCohort(v)).toEqual([]);
});
