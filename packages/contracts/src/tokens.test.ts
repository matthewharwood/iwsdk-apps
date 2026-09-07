import { expect, test } from "bun:test";
import { SpellProgram, TokenTemplate } from "./index";

const template: TokenTemplate = {
  schema: "fixed-token-template/1",
  id: `token-template:${"a".repeat(64)}`,
  rulesHash: "b".repeat(64),
  characteristics: {
    name: "Knight Ally Token",
    types: ["Creature"],
    subtypes: ["Knight", "Ally"],
    supertypes: [],
    colors: ["W"],
    manaCost: null,
    manaValue: 0,
    power: 2,
    toughness: 2,
    keywords: ["vigilance"],
  },
};
test("strict token templates distinguish noncard characteristics from producer and printed Oracle metadata", () => {
  expect(TokenTemplate.parse(template)).toEqual(template);
  for (const changed of [
    { ...template, oracleId: "fabricated" },
    { ...template, id: `oracle:${"a".repeat(64)}` },
    { ...template, characteristics: { ...template.characteristics, colors: ["C"] } },
    { ...template, characteristics: { ...template.characteristics, types: ["Token", "Creature"] } },
    { ...template, characteristics: { ...template.characteristics, commander: true } },
    { ...template, characteristics: { ...template.characteristics, keywords: ["haste", "haste"] } },
  ])
    expect(TokenTemplate.safeParse(changed).success).toBe(false);
});
test("one controller token instruction is nontargeted and admits only fixed counts one through four", () => {
  for (const count of [1, 2, 3, 4])
    expect(
      SpellProgram.safeParse({
        schema: "commander-spell/1",
        target: null,
        effects: [
          { kind: "create-token", recipient: "controller", count, templateId: template.id },
        ],
      }).success,
    ).toBe(true);
  const effect = {
    kind: "create-token",
    recipient: "controller",
    count: 2,
    templateId: template.id,
  };
  for (const changed of [
    { target: "player", effects: [effect] },
    { target: null, effects: [{ ...effect, count: 0 }] },
    { target: null, effects: [{ ...effect, count: 5 }] },
    { target: null, effects: [{ ...effect, recipient: "target" }] },
    { target: null, effects: [effect, { kind: "draw", recipient: "controller", amount: 1 }] },
  ])
    expect(SpellProgram.safeParse({ schema: "commander-spell/1", ...changed }).success).toBe(false);
});
