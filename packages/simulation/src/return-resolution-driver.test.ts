import { expect, test } from "bun:test";
import { observe } from "../../engine/src/index";
import { announce } from "../../engine/test-fixtures/counterspells";
import {
  castReturn,
  putTarget,
  resolveReturn,
  returnFixture,
} from "../../engine/test-fixtures/return-resolution";
import { heuristicDriver } from "./driver";

test("owner observation produces the distinct resolution replacement answer without needing the privileged continuation", async () => {
  const f = returnFixture(),
    target = putTarget(f);
  castReturn(f, target);
  resolveReturn(f);
  const view = observe(f.state, f.registry, "B");
  expect(await heuristicDriver(view, 1)).toEqual({ kind: "commander-replacement", move: true });
  expect(observe(f.state, f.registry, "A").decision).toBeNull();
  expect("frames" in view).toBe(false);
});
test("return target policy prefers an opposing creature from the legal observed domain", async () => {
  const f = returnFixture(false);
  putTarget(f, "A", false);
  const enemy = putTarget(f, "B", false);
  announce(f, "A", "draw-spell");
  expect(await heuristicDriver(observe(f.state, f.registry, "A"), 1)).toEqual({
    kind: "target",
    target: enemy,
  });
});
