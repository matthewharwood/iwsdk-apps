import { expect, test } from "bun:test";
import { CardDefinition, StaticKeywordGrant } from "./index";

const program: StaticKeywordGrant = {
  schema: "commander-static-keyword-grant/1",
  sourceZone: "battlefield",
  layer: 6,
  filter: {
    types: ["Creature"],
    color: null,
    subtype: "Sliver",
    controller: "source-controller",
    excludeSource: false,
  },
  grant: ["indestructible"],
};
test("strict live keyword grant preserves explicit recipient filter and independent keywords", () => {
  expect(StaticKeywordGrant.parse(program)).toEqual(program);
  expect(
    StaticKeywordGrant.parse({
      ...program,
      filter: {
        ...program.filter,
        types: ["Artifact", "Creature"],
        subtype: "Minotaur",
        color: "R",
      },
    }).filter.color,
  ).toBe("R");
  expect(
    StaticKeywordGrant.parse({
      ...program,
      filter: { ...program.filter, controller: "any", subtype: "Cleric" },
    }).filter.controller,
  ).toBe("any");
  expect(CardDefinition.shape.staticKeywordPrograms.parse(undefined)).toBeUndefined();
  expect(CardDefinition.shape.staticKeywordPrograms.parse([program])).toEqual([program]);
});
test("grant contract rejects unsupported layer/domain/removal/filter and duplicate programs", () => {
  for (const change of [
    { layer: 7 },
    { sourceZone: "graveyard" },
    { schema: "commander-static-keyword-grant/2" },
    { grant: [] },
    { grant: ["indestructible", "indestructible"] },
    { grant: ["ward"] },
    { remove: ["indestructible"] },
    ...[
      { controller: "all" },
      { types: ["Artifact"] },
      { types: ["Creature", "Creature"] },
      { types: ["Creature", "Artifact"] },
      { types: ["Creature", "Enchantment"] },
      { color: "C" },
      { subtype: "Unreviewed" },
      { affectedObjects: ["cached-recipient"] },
      { currentKeyword: "flying" },
    ].map((filter) => ({ filter: { ...program.filter, ...filter } })),
  ])
    expect(StaticKeywordGrant.safeParse({ ...program, ...change }).success).toBe(false);
  expect(CardDefinition.shape.staticKeywordPrograms.safeParse([program, program]).success).toBe(
    false,
  );
});
