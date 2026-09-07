import { expect, test } from "bun:test";
import {
  ActivatedProgram,
  AttachedModifier,
  AttachmentProgram,
  EquipProgram,
  emptyMana,
  OrdinaryActivatedProgram,
} from "./index";

const modifier: AttachedModifier = { powerDelta: -13, toughnessDelta: 10, keywords: ["shroud"] };
const equip: EquipProgram = {
  schema: "commander-equip/1",
  id: "equip:0",
  sourceZone: "battlefield",
  timing: "sorcery",
  cost: { mana: { ...emptyMana(), generic: 0 }, tapSource: false },
  target: "creature-you-control",
  effects: [{ kind: "attach-source", recipient: "target" }],
};
test("attachment contributions retain signed source values and do not accept a fake duration or intrinsic grants", () => {
  expect(AttachedModifier.parse(modifier)).toEqual(modifier);
  for (const changed of [
    { ...modifier, duration: "until-end-of-turn" },
    { ...modifier, keywords: ["shroud", "shroud"] },
    { ...modifier, intrinsic: ["indestructible"] },
    { ...modifier, keywords: ["unknown-keyword"] },
  ])
    expect(AttachedModifier.safeParse(changed).success).toBe(false);
});
test("Aura and Equipment source programs discriminate their separate casting and activation roles", () => {
  expect(
    AttachmentProgram.safeParse({
      schema: "commander-aura/1",
      enchant: "creature",
      attachedModifier: modifier,
    }).success,
  ).toBe(true);
  expect(
    AttachmentProgram.safeParse({
      schema: "commander-equipment/1",
      attachedModifier: modifier,
      equip,
    }).success,
  ).toBe(true);
  for (const changed of [
    { schema: "commander-aura/1", enchant: "player", attachedModifier: modifier },
    { schema: "commander-aura/1", enchant: "creature", attachedModifier: modifier, equip },
    { schema: "commander-equipment/1", attachedModifier: modifier },
  ])
    expect(AttachmentProgram.safeParse(changed).success).toBe(false);
});
test("equip requires real explicit zero mana cost and sorcery/own-creature instruction", () => {
  expect(EquipProgram.parse(equip)).toEqual(equip);
  for (const changed of [
    { ...equip, timing: "priority" },
    { ...equip, target: "creature" },
    { ...equip, cost: { mana: null, tapSource: false } },
    { ...equip, cost: { mana: equip.cost.mana, tapSource: true } },
    { ...equip, effects: [{ kind: "modify-creature", recipient: "target" }] },
  ])
    expect(EquipProgram.safeParse(changed).success).toBe(false);
});
test("ordinary activation representation is preserved exactly within the new noncard union", () => {
  const ordinary = OrdinaryActivatedProgram.parse({
    schema: "commander-activated/1",
    id: "old",
    sourceZone: "battlefield",
    timing: "priority",
    cost: { mana: null, tapSource: true },
    target: null,
    effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
  });
  expect(ActivatedProgram.parse(ordinary)).toEqual(ordinary);
  expect(ActivatedProgram.parse(equip)).toEqual(equip);
  expect(OrdinaryActivatedProgram.safeParse(equip).success).toBe(false);
});
