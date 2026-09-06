import { expect, test } from "bun:test";
import type { AiObservation } from "@iwsdk-apps/schemas";
import {
  chooseHeuristic,
  chooseScoredAction,
  chooseWithFallback,
  encodeObservation,
} from "./index";

function observation(remaining: number): AiObservation {
  return {
    schemaVersion: 1,
    gameId: "g",
    expectedRevision: 1,
    decisionId: "g:1",
    remaining,
    legalChoices: ([1, 2, 3] as const).filter((take) => take <= remaining),
  };
}

test("heuristic supports every reachable decision and chooses the winning residue", () => {
  for (let remaining = 1; remaining <= 15; remaining += 1) {
    const input = observation(remaining);
    const choice = chooseHeuristic(input);
    expect(input.legalChoices).toContain(choice);
    if (remaining % 4 !== 0) expect(remaining % 4).toBe(choice);
  }
});

test("model scores cannot select unavailable actions or NaN", () => {
  expect(chooseScoredAction(observation(1), [0, 100, 200])).toBe(1);
  expect(() => chooseScoredAction(observation(3), [0, NaN, 1])).toThrow("invalid action scores");
});

test("feature encoding ignores session identity and all metadata", () => {
  const a = observation(11);
  const b = { ...a, gameId: "other", decisionId: "other:9", expectedRevision: 9 };
  expect(encodeObservation(a)).toEqual(encodeObservation(b));
});

test("failed inference falls back, but cancellation discards the entire decision", async () => {
  const policy = {
    choose: async () => {
      throw new Error("GPU lost");
    },
    close() {},
  };
  expect(await chooseWithFallback(policy, observation(3))).toBe(3);
  const abort = new AbortController();
  abort.abort();
  await expect(chooseWithFallback(policy, observation(3), abort.signal)).rejects.toThrow();
});
