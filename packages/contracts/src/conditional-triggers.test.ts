import { expect, test } from "bun:test";
import { ConditionalSelfEntryProgram, SelfEntryProgram, TriggeredProgram } from "./triggers";

const conditional: ConditionalSelfEntryProgram = {
  schema: "commander-conditional-self-entry/1",
  id: "conditional-self-entry:constructed:0",
  trigger: {
    kind: "self-enters-battlefield",
    view: "post-committed-event",
    placementClass: "ordinary",
  },
  interveningIf: { kind: "controls-permanent", types: ["Artifact"] },
  choice: { kind: "mandatory" },
  effects: [{ kind: "draw", recipient: "trigger-controller", amount: 1 }],
};
test("the closed intervening-if schema preserves legacy exclusions and requires both condition and exact draw", () => {
  expect(ConditionalSelfEntryProgram.parse(conditional)).toEqual(conditional);
  expect(TriggeredProgram.parse(conditional)).toEqual(conditional);
  expect(SelfEntryProgram.safeParse(conditional).success).toBe(false);
  for (const mutation of [
    { ...conditional, interveningIf: undefined },
    { ...conditional, interveningIf: { kind: "controls-permanent", types: ["Creature"] } },
    {
      ...conditional,
      interveningIf: { kind: "controls-permanent", types: ["Artifact"], threshold: 2 },
    },
    {
      ...conditional,
      interveningIf: { kind: "controls-permanent", types: ["Artifact", "Creature"] },
    },
    { ...conditional, interveningIf: { kind: "was-true", value: true } },
    { ...conditional, choice: { kind: "optional" } },
    { ...conditional, witness: "saved-object" },
    { ...conditional, effects: [] },
    { ...conditional, effects: [...conditional.effects, ...conditional.effects] },
    { ...conditional, effects: [{ kind: "draw", recipient: "trigger-controller", amount: 2 }] },
  ])
    expect(TriggeredProgram.safeParse(mutation).success).toBe(false);
});
