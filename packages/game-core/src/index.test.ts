import { expect, test } from "bun:test";
import type { GameCommand, GameState } from "@iwsdk-apps/schemas";
import { applyCommand, createGame, getLegalChoices, observeForAi } from "./index";

const timestamp = "2026-09-06T12:00:00.000Z";
function command(state: GameState, take: 1 | 2 | 3): GameCommand {
  return {
    schemaVersion: 1,
    gameId: state.gameId,
    commandId: `c-${state.revision}`,
    expectedRevision: state.revision,
    decisionId: state.decisionId,
    take,
  };
}

test("all reachable branches terminate with the last token taker's victory", () => {
  let terminals = 0;
  function visit(state: GameState): void {
    if (state.winner) {
      terminals += 1;
      expect(state.remaining).toBe(0);
      expect(state.history.at(-1)?.actor).toBe(state.winner);
      expect(getLegalChoices(state)).toEqual([]);
      return;
    }
    for (const take of getLegalChoices(state)) {
      const before = JSON.stringify(state);
      const next = applyCommand(state, command(state, take), state.turn, timestamp);
      expect(JSON.stringify(state)).toBe(before);
      expect(next.remaining).toBe(state.remaining - take);
      expect(next.revision).toBe(state.revision + 1);
      visit(next);
    }
  }
  visit(createGame("example", timestamp));
  expect(terminals).toBeGreaterThan(1000);
});

test("stale revision, stale decision, wrong game, and wrong seat are rejected", () => {
  const state = createGame("example", timestamp);
  const move = command(state, 1);
  expect(() => applyCommand(state, move, "ai", timestamp)).toThrow("not your turn");
  expect(() => applyCommand(state, { ...move, expectedRevision: 1 }, "human", timestamp)).toThrow(
    "table changed",
  );
  expect(() => applyCommand(state, { ...move, decisionId: "old" }, "human", timestamp)).toThrow(
    "table changed",
  );
  expect(() => applyCommand(state, { ...move, gameId: "other" }, "human", timestamp)).toThrow(
    "another game",
  );
});

test("AI input is an explicit observation, with no mutable authority or history", () => {
  const initial = createGame("example", timestamp);
  const state = applyCommand(initial, command(initial, 2), "human", timestamp);
  expect(observeForAi(state)).toEqual({
    schemaVersion: 1,
    gameId: "example",
    expectedRevision: 1,
    decisionId: "example:1",
    remaining: 13,
    legalChoices: [1, 2, 3],
  });
  expect(() => observeForAi(initial)).toThrow("No AI decision");
});
