import { z } from "zod";

// Source-reviewed subtype predicates only. Runtime never parses a source sentence.
export const ReviewedCreatureSubtype = z.enum([
  "Sliver",
  "Spirit",
  "Warrior",
  "Dragon",
  "Kobold",
  "Soldier",
  "Kithkin",
  "Vampire",
  "Dinosaur",
  "Cat",
  "Knight",
  "Zombie",
  "Squirrel",
  "Turtle",
  "Elf",
  "Merfolk",
  "Minotaur",
  "Cleric",
  "Ally",
]);
export type ReviewedCreatureSubtype = z.infer<typeof ReviewedCreatureSubtype>;
export const StaticCreatureBonus = z
  .strictObject({
    schema: z.literal("static-creature-bonus/1"),
    kind: z.literal("static-creature-bonus"),
    activeZone: z.literal("battlefield"),
    controller: z.literal("source-current"),
    excludeSource: z.boolean(),
    predicate: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("all") }),
      z.strictObject({ kind: z.literal("legendary") }),
      z.strictObject({ kind: z.literal("subtype"), subtype: ReviewedCreatureSubtype }),
    ]),
    powerDelta: z.number().int().min(0).max(3),
    toughnessDelta: z.number().int().min(0).max(3),
    layer: z.literal("7c"),
  })
  .refine((program) => program.powerDelta > 0 || program.toughnessDelta > 0, {
    message: "A static bonus must add power or toughness.",
  });
export type StaticCreatureBonus = z.infer<typeof StaticCreatureBonus>;
