import {
  type CardDefinition,
  ConditionalSelfEntryProgram,
  DamageStaticProgram,
  EntryCausedTriggerProgram,
  EntryObserverProgram,
  OrdinaryActivatedProgram,
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
    !card.damagePrograms &&
    !card.activatedPrograms &&
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
    card.damagePrograms ||
    card.activatedPrograms ||
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
    card.damagePrograms ||
    card.activatedPrograms ||
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

/** One complete finite damage program, with no omitted additional permanent mechanics. */
export function isDamageProgramPermanent(card: CardDefinition): boolean {
  if (
    card.damagePrograms?.length !== 1 ||
    !DamageStaticProgram.safeParse(card.damagePrograms[0]).success ||
    card.manaCost === null ||
    card.spellProgram ||
    card.triggerPrograms ||
    card.staticPrograms ||
    card.activatedPrograms ||
    card.types.length !== 1 ||
    card.subtypes.includes("Aura")
  )
    return false;
  const program = card.damagePrograms[0];
  if (!program) return false;
  if (program.kind === "damage-cannot-be-prevented" && card.types[0] !== "Creature") return false;
  if (card.types[0] === "Creature") return card.power !== null && card.toughness !== null;
  return (
    (card.types[0] === "Artifact" || card.types[0] === "Enchantment") &&
    card.power === null &&
    card.toughness === null
  );
}

/** The complete finite nonmana activation tier; intrinsic supported keywords remain on the source. */
export function isOrdinaryActivatedPermanent(card: CardDefinition): boolean {
  return (
    !!card.activatedPrograms &&
    card.activatedPrograms.length === 1 &&
    OrdinaryActivatedProgram.safeParse(card.activatedPrograms[0]).success &&
    card.manaCost !== null &&
    card.manaAbilities.length === 0 &&
    !card.spellProgram &&
    !card.triggerPrograms &&
    !card.staticPrograms &&
    !card.damagePrograms &&
    card.types.length > 0 &&
    card.types.every((type) => ["Creature", "Artifact", "Enchantment"].includes(type)) &&
    !card.subtypes.some((type) =>
      ["Aura", "Equipment", "Vehicle", "Saga", "Class", "Case", "Room"].includes(type),
    ) &&
    (card.types.includes("Creature")
      ? card.power !== null && card.toughness !== null
      : card.power === null && card.toughness === null)
  );
}
