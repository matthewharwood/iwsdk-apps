import { expect, test } from "bun:test";
import { observe } from "../../engine/src/index";
import {
  announce,
  answer,
  cast,
  counterFixture,
  locate,
} from "../../engine/test-fixtures/counterspells";
import { heuristicDriver } from "./driver";

test("observation-only policy holds a counter while only its own other spell is available", async () => {
  const f = counterFixture();
  cast(f, "A", "creature");
  const observation = observe(f.state, f.registry, "A");
  if (!observation.decision) throw new Error("No priority decision");
  // Limit the policy fixture to this available card; its legal domain still includes one's own spell.
  observation.decision.cards = [locate(f, "A", "counter").id];
  expect(await heuristicDriver(observation, 1)).toEqual({ kind: "pass" });
});

test("observation-only policy casts an affordable creature counter against an opposing creature spell", async () => {
  const f = counterFixture();
  cast(f, "A", "creature");
  answer(f, { kind: "pass" });
  const observation = observe(f.state, f.registry, "B");
  if (!observation.decision) throw new Error("No priority decision");
  const source = locate(f, "B", "creature-counter").id;
  observation.decision.cards = [source];
  expect(await heuristicDriver(observation, 1)).toEqual({ kind: "cast", card: source });
});

test("target policy prefers the opponent's counter over its own protected lower spell", async () => {
  const f = counterFixture();
  const original = cast(f, "A", "draw-spell");
  const enemy = cast(f, "B", "counter", original);
  announce(f, "A", "counter");
  const observation = observe(f.state, f.registry, "A");
  expect(observation.decision?.cards).toEqual([original, enemy]);
  expect(await heuristicDriver(observation, 1)).toEqual({ kind: "target", target: enemy });
});
