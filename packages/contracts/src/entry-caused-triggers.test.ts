import { expect, test } from "bun:test";
import { EntryCausedTriggerProgram, emptyMana, Response, TriggeredProgram } from "./index";

const program: EntryCausedTriggerProgram = {
  schema: "commander-entry-caused-trigger/1",
  id: "strict-proctor:0",
  trigger: {
    kind: "ability-triggered",
    immediateCause: "battlefield-entry",
    sourceZone: "battlefield",
    view: "post-committed-event",
    placementClass: "triggered-by-trigger",
  },
  effect: {
    kind: "counter-referenced-trigger-unless-paid",
    reference: "triggering-ability",
    payer: "referenced-ability-controller",
    cost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 2 },
  },
};
test("meta grammar accepts exactly the untargeted causal reference, source zone, second part and generic two optional payment", () => {
  expect(EntryCausedTriggerProgram.parse(program)).toEqual(program);
  expect(TriggeredProgram.parse(program)).toEqual(program);
  for (const changed of [
    { ...program, target: "triggered-ability" },
    { ...program, trigger: { ...program.trigger, immediateCause: "any-ancestor" } },
    { ...program, trigger: { ...program.trigger, view: "pre-event" } },
    { ...program, trigger: { ...program.trigger, placementClass: "ordinary" } },
    { ...program, trigger: { ...program.trigger, sourceZone: "graveyard" } },
    { ...program, effect: { ...program.effect, payer: "source-controller" } },
    { ...program, effect: { ...program.effect, cost: { ...emptyMana(), generic: 0, C: 2 } } },
    { ...program, effect: { ...program.effect, cost: { ...emptyMana(), generic: 1 } } },
    { ...program, effect: { ...program.effect, reference: "target-ability" } },
    { ...program, effects: [program.effect] },
  ])
    expect(EntryCausedTriggerProgram.safeParse(changed).success).toBe(false);
});
test("payment response branches distinguish voluntary decline from exact bundled resources, without cancellation or accidental partial payloads", () => {
  const no: Response = { kind: "trigger-payment", pay: false };
  const yes: Response = {
    kind: "trigger-payment",
    pay: true,
    sources: [],
    spend: { ...emptyMana(), W: 2 },
  };
  expect(Response.parse(no)).toEqual(no);
  expect(Response.parse(yes)).toEqual(yes);
  for (const changed of [
    { ...yes, pay: false },
    { ...no, sources: [] },
    { kind: "trigger-payment", pay: true },
    { ...yes, spend: { ...emptyMana(), W: -1 } },
    { ...yes, optional: true },
  ])
    expect(Response.safeParse(changed).success).toBe(false);
  expect(Response.parse({ kind: "mana", source: { object: "A:land@1", color: "W" } }).kind).toBe(
    "mana",
  );
});
