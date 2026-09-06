import type { SpellProgram } from "@iwsdk-apps/contracts";

export const SPELL_FAMILY_VERSION = "exact-spell-families/1";
export const SPELL_FAMILY_REGISTRY = [
  { id: "draw-controller/1", amounts: [1, 2, 3, 4], rules: ["109.5", "121.1", "121.2", "121.4"] },
  {
    id: "draw-target-player/1",
    amounts: [2, 4, 7],
    rules: ["121.1", "121.2", "121.4", "601.2c", "608.2b"],
  },
  { id: "gain-controller/1", amounts: [4, 5, 6, 7, 8], rules: ["109.5", "119.3"] },
  { id: "gain-target-player/1", amounts: [5, 7, 8], rules: ["119.3", "601.2c", "608.2b"] },
  {
    id: "damage-target-creature/1",
    amounts: [2, 3, 4, 5, 7],
    rules: ["201.5", "120.3e", "120.4", "601.2c", "608.2b", "704.4"],
  },
  {
    id: "damage-creature-gain-controller/1",
    pairs: [
      [2, 2],
      [3, 3],
    ],
    rules: ["109.5", "201.5", "119.3", "120.3e", "601.2c", "608.2b", "608.2c", "704.4"],
  },
  {
    id: "gain-controller-draw-controller/1",
    gainAmounts: [3, 4, 6],
    drawAmount: 1,
    rules: ["109.5", "119.3", "121.1", "608.2c", "704.4"],
  },
  {
    id: "gain-target-draw-controller/1",
    gainAmount: 4,
    drawAmount: 1,
    rules: ["109.5", "119.3", "121.1", "601.2c", "608.2b", "608.2c", "704.4"],
  },
  {
    id: "destroy-target-creature/1",
    rules: ["701.8a", "701.8b", "702.12b", "400.7", "601.2c", "608.2b", "704.4", "903.9a"],
  },
  {
    id: "exile-target-creature/1",
    rules: ["701.13a", "406.1", "400.7", "601.2c", "608.2b", "704.4", "903.9a"],
  },
] as const;
export interface SpellFamilyBinding {
  family: string;
  program: SpellProgram;
  rules: readonly string[];
}
const DRAW_WORDS: Readonly<Record<number, string>> = {
  1: "a card",
  2: "two cards",
  3: "three cards",
  4: "four cards",
  7: "seven cards",
};
function sequence(
  family: string,
  target: SpellProgram["target"],
  effects: SpellProgram["effects"],
): SpellFamilyBinding {
  const specification = SPELL_FAMILY_REGISTRY.find((row) => row.id === family);
  if (!specification) throw new Error(`Unknown reviewed family: ${family}`);
  return {
    family,
    program: { schema: "commander-spell/1", target, effects },
    rules: specification.rules,
  };
}

/** A finite table of entire Oracle bodies, not a general or partial English parser. */
export function bindExactSpellFamily(
  name: string,
  completeText: string,
): SpellFamilyBinding | null {
  for (const amount of SPELL_FAMILY_REGISTRY[0].amounts)
    if (completeText === `Draw ${DRAW_WORDS[amount]}.`)
      return sequence("draw-controller/1", null, [
        { kind: "draw", recipient: "controller", amount },
      ]);
  for (const amount of SPELL_FAMILY_REGISTRY[1].amounts)
    if (completeText === `Target player draws ${DRAW_WORDS[amount]}.`)
      return sequence("draw-target-player/1", "player", [
        { kind: "draw", recipient: "target", amount },
      ]);
  for (const amount of SPELL_FAMILY_REGISTRY[2].amounts)
    if (completeText === `You gain ${amount} life.`)
      return sequence("gain-controller/1", null, [
        { kind: "gain-life", recipient: "controller", amount },
      ]);
  for (const amount of SPELL_FAMILY_REGISTRY[3].amounts)
    if (completeText === `Target player gains ${amount} life.`)
      return sequence("gain-target-player/1", "player", [
        { kind: "gain-life", recipient: "target", amount },
      ]);
  for (const amount of SPELL_FAMILY_REGISTRY[4].amounts)
    if (completeText === `${name} deals ${amount} damage to target creature.`)
      return sequence("damage-target-creature/1", "creature", [{ kind: "damage", amount }]);
  for (const [damage, gain] of SPELL_FAMILY_REGISTRY[5].pairs)
    if (
      completeText ===
      `${name} deals ${damage} damage to target creature and you gain ${gain} life.`
    )
      return sequence("damage-creature-gain-controller/1", "creature", [
        { kind: "damage", amount: damage },
        { kind: "gain-life", recipient: "controller", amount: gain },
      ]);
  for (const amount of SPELL_FAMILY_REGISTRY[6].gainAmounts)
    if (completeText === `You gain ${amount} life.\nDraw a card.`)
      return sequence("gain-controller-draw-controller/1", null, [
        { kind: "gain-life", recipient: "controller", amount },
        { kind: "draw", recipient: "controller", amount: 1 },
      ]);
  if (completeText === "Target player gains 4 life.\nDraw a card.")
    return sequence("gain-target-draw-controller/1", "player", [
      { kind: "gain-life", recipient: "target", amount: 4 },
      { kind: "draw", recipient: "controller", amount: 1 },
    ]);
  if (completeText === "Destroy target creature.")
    return sequence("destroy-target-creature/1", "creature", [{ kind: "destroy" }]);
  if (completeText === "Exile target creature.")
    return sequence("exile-target-creature/1", "creature", [{ kind: "exile" }]);
  return null;
}
