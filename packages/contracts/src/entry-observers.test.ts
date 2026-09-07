import { expect, test } from "bun:test";
import {
  EntryObserverProgram,
  SelfEntryProgram,
  TriggeredProgram,
  triggerEffects,
} from "./triggers";

const gain = { kind: "gain-life", recipient: "trigger-controller", amount: 1 } as const;
const draw = { kind: "draw", recipient: "trigger-controller", amount: 1 } as const;
const program = {
  schema: "commander-entry-observer/1",
  id: "observer",
  trigger: {
    kind: "permanent-enters-battlefield",
    view: "post-committed-event",
    placementClass: "ordinary",
    sourceZone: "battlefield",
    occurrence: "each-matching-object",
    subject: {
      kind: "filter",
      filter: {
        types: ["Land"],
        controller: "source-controller",
        excludeSource: false,
        token: "any",
      },
    },
  },
  choice: { kind: "mandatory" },
  effects: [gain, draw],
} satisfies EntryObserverProgram;

test("observer union preserves ordered Tatyova instructions and does not broaden the legacy self-entry schema", () => {
  expect(EntryObserverProgram.parse(program)).toEqual(program);
  expect(TriggeredProgram.parse(program)).toEqual(program);
  expect(SelfEntryProgram.safeParse(program).success).toBe(false);
  expect(triggerEffects(EntryObserverProgram.parse(program))).toEqual([gain, draw]);
});
test("literal type domains and Beast-only subtype are strict; Aura and inferred Creature conjunction reject", () => {
  for (const types of [["Creature"], ["Land"], ["Artifact"], ["Enchantment"]])
    expect(
      EntryObserverProgram.safeParse({
        ...program,
        trigger: {
          ...program.trigger,
          subject: { kind: "filter", filter: { ...program.trigger.subject.filter, types } },
        },
      }).success,
    ).toBe(true);
  const subtype = (types: string[], value = "Beast") => ({
    ...program,
    trigger: {
      ...program.trigger,
      subject: {
        kind: "filter",
        filter: { ...program.trigger.subject.filter, types, subtype: value },
      },
    },
  });
  expect(EntryObserverProgram.safeParse(subtype([])).success).toBe(true);
  expect(EntryObserverProgram.safeParse(subtype(["Creature"])).success).toBe(false);
  expect(EntryObserverProgram.safeParse(subtype([], "Aura")).success).toBe(false);
  expect(
    EntryObserverProgram.safeParse({
      ...program,
      trigger: {
        ...program.trigger,
        subject: { kind: "filter", filter: { ...program.trigger.subject.filter, types: [] } },
      },
    }).success,
  ).toBe(false);
});
test("optional, aggregated, numeric, opponent-only, nontoken and extra-effect constructors reject", () => {
  const filter = program.trigger.subject.filter;
  const bad = [
    { ...program, choice: { kind: "optional" } },
    { ...program, effects: [draw, gain] },
    { ...program, effects: [draw, draw] },
    { ...program, effects: [{ ...gain, amount: 3 }] },
    { ...program, effects: [gain, draw, draw] },
    { ...program, target: "player" },
    { ...program, trigger: { ...program.trigger, occurrence: "one-or-more" } },
    ...[
      { ...filter, token: "nontoken" },
      { ...filter, controller: "opponent" },
      { ...filter, powerAtLeast: 3 },
      { ...filter, types: ["Artifact", "Creature"] },
    ].map((item) => ({
      ...program,
      trigger: { ...program.trigger, subject: { kind: "filter", filter: item } },
    })),
    { ...program, trigger: { ...program.trigger, subject: { kind: "self-or-filter", filter } } },
  ];
  for (const mutation of bad) expect(EntryObserverProgram.safeParse(mutation).success).toBe(false);
});
