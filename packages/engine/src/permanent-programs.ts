import { type CardDefinition, StaticCreatureBonus } from "@iwsdk-apps/contracts";

/** This tier admits one reviewed static creature bonus on a non-Aura permanent. */
export function isStaticBonusPermanent(card: CardDefinition): boolean {
  return (
    card.types.length === 1 &&
    (card.types[0] === "Creature" || card.types[0] === "Enchantment") &&
    card.manaCost !== null &&
    !card.subtypes.includes("Aura") &&
    !card.spellProgram &&
    !card.triggerPrograms &&
    card.staticPrograms?.length === 1 &&
    StaticCreatureBonus.safeParse(card.staticPrograms[0]).success &&
    (card.types[0] === "Creature"
      ? card.power !== null && card.toughness !== null
      : card.power === null && card.toughness === null)
  );
}
