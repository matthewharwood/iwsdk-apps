import { z } from "zod";

export const EVASION_KEYWORDS = [
  "fear",
  "intimidate",
  "horsemanship",
  "shadow",
  "skulk",
  "plainswalk",
  "islandwalk",
  "swampwalk",
  "mountainwalk",
  "forestwalk",
] as const;

/** These restrictions are printed abilities, not Magic keyword abilities. */
export const BlockingRestriction = z.enum([
  "cannot-block",
  "cannot-be-blocked",
  "blocks-only-flying",
]);
export type BlockingRestriction = z.infer<typeof BlockingRestriction>;
