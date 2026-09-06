import { expect, test } from "bun:test";
import { Response, SpellProgram } from "./index";

const returning = { kind: "return-to-hand" };
const draw = { kind: "draw", recipient: "controller", amount: 1 };
test("bounded return programs permit the exact return and mandatory-controller-draw shapes", () => {
  for (const effects of [[returning], [returning, draw]])
    expect(
      SpellProgram.safeParse({ schema: "commander-spell/1", target: "creature", effects }).success,
    ).toBe(true);
  for (const effects of [
    [draw, returning],
    [returning, returning],
    [returning, { ...draw, amount: 2 }],
    [returning, { ...draw, recipient: "target" }],
    [returning, { kind: "damage", amount: 1 }],
    [returning, { kind: "gain-life", recipient: "controller", amount: 1 }],
    [{ ...returning, optional: true }],
  ])
    expect(
      SpellProgram.safeParse({ schema: "commander-spell/1", target: "creature", effects }).success,
    ).toBe(false);
  for (const target of [null, "player", "spell"])
    expect(
      SpellProgram.safeParse({ schema: "commander-spell/1", target, effects: [returning] }).success,
    ).toBe(false);
});
test("resolution replacement response carries only an owned Boolean answer", () => {
  expect(Response.safeParse({ kind: "commander-replacement", move: true }).success).toBe(true);
  expect(Response.safeParse({ kind: "commander-replacement", move: false }).success).toBe(true);
  expect(
    Response.safeParse({ kind: "commander-replacement", move: true, program: {} }).success,
  ).toBe(false);
  expect(Response.safeParse({ kind: "commander-replacement", destination: "hand" }).success).toBe(
    false,
  );
});
