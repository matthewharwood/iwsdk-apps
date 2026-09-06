import { expect, test } from "bun:test";
import { SelfEntryProgram } from "./triggers";

const program: SelfEntryProgram = {
  schema: "commander-trigger/1",
  id: "self-entry-0",
  trigger: {
    kind: "self-enters-battlefield",
    view: "post-committed-event",
    placementClass: "ordinary",
  },
  choice: { kind: "mandatory" },
  effect: { kind: "draw", recipient: "trigger-controller", amount: 1 },
};
test("self-entry schema preserves captured-controller constant effect semantics", () => {
  expect(SelfEntryProgram.parse(program)).toEqual(program);
  expect(
    SelfEntryProgram.parse({
      ...program,
      effect: { kind: "gain-life", recipient: "trigger-controller", amount: 3 },
    }).effect,
  ).toEqual({ kind: "gain-life", recipient: "trigger-controller", amount: 3 });
});
test("optional, targeted, conditional, multi-effect and wrong event views cannot enter the initial trigger ABI", () => {
  for (const mutation of [
    { ...program, choice: { kind: "optional" } },
    { ...program, target: "player" },
    { ...program, condition: { kind: "true" } },
    { ...program, effect: { ...program.effect, recipient: "controller" } },
    { ...program, effect: { ...program.effect, amount: 0 } },
    { ...program, effect: { ...program.effect, amount: 1.5 } },
    { ...program, effect: { ...program.effect, amount: 100_001 } },
    { ...program, effects: [program.effect, program.effect] },
    { ...program, trigger: { ...program.trigger, view: "pre-event" } },
    { ...program, trigger: { ...program.trigger, kind: "another-creature-enters" } },
    { ...program, trigger: { ...program.trigger, placementClass: "triggered-by-trigger" } },
  ])
    expect(SelfEntryProgram.safeParse(mutation).success).toBe(false);
});
