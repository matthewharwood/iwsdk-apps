import type { Keyword } from "@iwsdk-apps/contracts";

export const KEYWORD_REMINDER_RECIPE_VERSION = "keyword-reminder-creature/1";
export const KEYWORD_REMINDER_RULES = ["207.2", "207.2a"] as const;
/** Twenty complete source lines individually reviewed as keyword plus explanatory reminder.
 * Exact equality only: punctuation, pronouns and every parenthetical word are significant here.
 * Never strip arbitrary parentheses, accept a substring, or interpret a new reminder as rules.
 */
export const KEYWORD_REMINDER_REGISTRY: readonly { text: string; keyword: Keyword }[] = [
  {
    text: "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)",
    keyword: "deathtouch",
  },
  {
    text: "Defender (This creature can't attack.)",
    keyword: "defender",
  },
  {
    text: "Double strike (This creature deals both first-strike and regular combat damage.)",
    keyword: "double-strike",
  },
  {
    text: "First strike (This creature deals combat damage before creatures without first strike.)",
    keyword: "first-strike",
  },
  {
    text: "Flash (You may cast this spell any time you could cast an instant.)",
    keyword: "flash",
  },
  {
    text: "Flying (This creature can't be blocked except by creatures with flying or reach.)",
    keyword: "flying",
  },
  {
    text: "Haste (This creature can attack and {T} as soon as he comes under your control.)",
    keyword: "haste",
  },
  {
    text: "Haste (This creature can attack and {T} as soon as it comes under your control.)",
    keyword: "haste",
  },
  {
    text: "Hexproof (This creature can't be the target of spells or abilities your opponents control.)",
    keyword: "hexproof",
  },
  {
    text: 'Indestructible (Damage and effects that say "destroy" don\'t destroy this creature. If its toughness is 0 or less, it still dies.)',
    keyword: "indestructible",
  },
  {
    text: "Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it's still put into its owner's graveyard.)",
    keyword: "indestructible",
  },
  {
    text: 'Indestructible (Damage and effects that say "destroy" don\'t destroy this creature.)',
    keyword: "indestructible",
  },
  {
    text: "Lifelink (Damage dealt by this creature also causes you to gain that much life.)",
    keyword: "lifelink",
  },
  {
    text: "Menace (This creature can't be blocked except by two or more creatures.)",
    keyword: "menace",
  },
  {
    text: "Reach (This creature can block creatures with flying.)",
    keyword: "reach",
  },
  {
    text: "Shroud (This creature can't be the target of spells or abilities.)",
    keyword: "shroud",
  },
  {
    text: "Trample (This creature can deal excess combat damage to the player he's attacking.)",
    keyword: "trample",
  },
  {
    text: "Trample (This creature can deal excess combat damage to the player it's attacking.)",
    keyword: "trample",
  },
  {
    text: "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)",
    keyword: "trample",
  },
  {
    text: "Vigilance (Attacking doesn't cause this creature to tap.)",
    keyword: "vigilance",
  },
];
export function exactKeywordReminder(line: string): Keyword | null {
  return KEYWORD_REMINDER_REGISTRY.find((entry) => entry.text === line)?.keyword ?? null;
}
