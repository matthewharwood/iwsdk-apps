import { expect, test } from "bun:test";
import { CardDefinition, StaticCreatureBonus } from "./index";

const sample = {
  schema: "static-creature-bonus/1",
  kind: "static-creature-bonus",
  activeZone: "battlefield",
  controller: "source-current",
  excludeSource: true,
  predicate: { kind: "legendary" },
  powerDelta: 2,
  toughnessDelta: 2,
  layer: "7c",
};
test("static contribution schema accepts the bounded three predicates and asymmetric bonuses", () => {
  for (const predicate of [
    { kind: "all" },
    { kind: "legendary" },
    { kind: "subtype", subtype: "Sliver" },
  ])
    expect(
      StaticCreatureBonus.safeParse({ ...sample, predicate, powerDelta: 0, toughnessDelta: 1 })
        .success,
    ).toBe(true);
});
test("static schema rejects unknown layers, predicates, extra abilities, captured controllers and unreviewed deltas", () => {
  for (const mutant of [
    { layer: "7b" },
    { layer: "7d" },
    { controller: "A" },
    { activeZone: "graveyard" },
    { predicate: { kind: "color", color: "W" } },
    { predicate: { kind: "subtype", subtype: "Unknown" } },
    { predicate: { kind: "all", unlessTapped: true } },
    { powerDelta: -1 },
    { powerDelta: 1.5 },
    { powerDelta: 4 },
    { powerDelta: 0, toughnessDelta: 0 },
    { keywords: ["flying"] },
    { dependsOn: "other-effect" },
    { timestamp: 1 },
    { affectedObjects: ["creature"] },
  ])
    expect(StaticCreatureBonus.safeParse({ ...sample, ...mutant }).success).toBe(false);
});
test("card static programs are optional but if present contain exactly one strict program", () => {
  const field = CardDefinition.shape.staticPrograms;
  expect(field.safeParse(undefined).success).toBe(true);
  expect(field.safeParse([sample]).success).toBe(true);
  expect(field.safeParse([]).success).toBe(false);
  expect(field.safeParse([sample, sample]).success).toBe(false);
});
