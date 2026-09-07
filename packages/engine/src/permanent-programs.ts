import {
  type CardDefinition,
  ConditionalSelfEntryProgram,
  EntryCausedTriggerProgram,
  EntryObserverProgram,
  SelfEntryProgram,
  StaticCreatureBonus,
} from "@iwsdk-apps/contracts";

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

/** Legacy self-entry creatures and the closed mandatory observer permanent tier. */
export function isReviewedTriggeredPermanent(card: CardDefinition): boolean {
  if (
    !card.triggerPrograms ||
    card.triggerPrograms.length !== 1 ||
    card.manaCost === null ||
    card.spellProgram ||
    card.staticPrograms ||
    card.subtypes.includes("Aura")
  )
    return false;
  if (isEntryObserverPermanent(card)) return true;
  return (
    card.types.includes("Creature") &&
    card.types.every((type) => ["Creature", "Artifact", "Enchantment"].includes(type)) &&
    card.power !== null &&
    card.toughness !== null &&
    (SelfEntryProgram.safeParse(card.triggerPrograms[0]).success ||
      ConditionalSelfEntryProgram.safeParse(card.triggerPrograms[0]).success ||
      EntryCausedTriggerProgram.safeParse(card.triggerPrograms[0]).success)
  );
}
export function isEntryObserverPermanent(card: CardDefinition): boolean {
  if (
    card.triggerPrograms?.length !== 1 ||
    card.manaCost === null ||
    card.spellProgram ||
    card.staticPrograms ||
    card.subtypes.includes("Aura") ||
    !EntryObserverProgram.safeParse(card.triggerPrograms[0]).success
  )
    return false;
  if (card.types.includes("Creature"))
    return (
      card.types.every((type) => type === "Creature" || type === "Enchantment") &&
      card.power !== null &&
      card.toughness !== null
    );
  return (
    card.types.length === 1 &&
    card.types[0] === "Enchantment" &&
    card.power === null &&
    card.toughness === null
  );
}
