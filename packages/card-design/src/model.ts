import { z } from "zod";

export const CardColorSchema = z.enum(["W", "U", "B", "R", "G"]);
export const CardRaritySchema = z.enum([
  "common",
  "uncommon",
  "rare",
  "mythic",
  "special",
  "bonus",
]);
export const CardAnnotationsSchema = z.object({
  // These are reviewed display annotations, never an executable rules program.
  abilities: z
    .array(
      z.object({
        paragraph: z.int().nonnegative(),
        label: z.string().min(1).optional(),
        labelKind: z.enum(["trigger", "replacement", "neutral"]).optional(),
        costEnd: z.int().positive().optional(),
      }),
    )
    .default([]),
  highlights: z.array(z.string().min(1)).default([]),
  reminder: z.string().min(1).optional(),
  tokens: z.array(z.string().min(1)).default([]),
  table: z.string().min(1).optional(),
  badge: z.string().min(1).optional(),
  timing: z
    .object({
      caption: z.string().min(1),
      phases: z.array(z.enum(["UPKEEP", "MAIN", "COMBAT", "END"])),
    })
    .optional(),
});

export const CardFaceDisplaySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    // null means absent, and is deliberately different from the zero cost "{0}".
    manaCost: z.string().nullable(),
    typeLine: z.string(),
    oracleText: z.string(),
    power: z.string().optional(),
    toughness: z.string().optional(),
    loyalty: z.string().optional(),
    defense: z.string().optional(),
    handModifier: z.string().optional(),
    lifeModifier: z.string().optional(),
    colors: z.array(CardColorSchema).default([]),
    colorIndicator: z.array(CardColorSchema).default([]),
    rarity: CardRaritySchema.optional(),
    annotations: CardAnnotationsSchema.optional(),
  })
  .superRefine((face, context) => {
    const paragraphs = face.oracleText.split("\n");
    const seen = new Set<number>();
    for (const [index, annotation] of (face.annotations?.abilities ?? []).entries()) {
      const paragraph = paragraphs[annotation.paragraph];
      if (paragraph === undefined || seen.has(annotation.paragraph)) {
        context.addIssue({
          code: "custom",
          path: ["annotations", "abilities", index],
          message: "Each annotation must reference one distinct existing paragraph.",
        });
      }
      seen.add(annotation.paragraph);
      if (
        annotation.costEnd !== undefined &&
        (paragraph === undefined || annotation.costEnd >= paragraph.length)
      ) {
        context.addIssue({
          code: "custom",
          path: ["annotations", "abilities", index, "costEnd"],
          message: "A supplied cost boundary must leave both cost and effect text intact.",
        });
      }
      if (
        paragraph &&
        annotation.costEnd !== undefined &&
        [...paragraph.matchAll(/\{[^{}]+\}/g)].some(
          (symbol) =>
            annotation.costEnd !== undefined &&
            annotation.costEnd > symbol.index &&
            annotation.costEnd < symbol.index + symbol[0].length,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["annotations", "abilities", index, "costEnd"],
          message: "A cost boundary cannot split a mana symbol.",
        });
      }
    }
    const text = `${face.oracleText}\n${face.annotations?.reminder ?? ""}`;
    for (const [index, phrase] of (face.annotations?.highlights ?? []).entries()) {
      if (!text.includes(phrase))
        context.addIssue({
          code: "custom",
          path: ["annotations", "highlights", index],
          message: "A highlight must be an exact phrase in the displayed text.",
        });
    }
  });

export const CardDisplaySchema = z
  .object({
    id: z.string().min(1),
    layout: z.string().min(1),
    kind: z.enum(["card", "token", "reference"]).default("card"),
    // The adapter chooses composition. We do not guess it from a layout or card name.
    faceTreatment: z.enum(["separate", "combined"]),
    faces: z.array(CardFaceDisplaySchema).min(1),
    colorIdentity: z.array(CardColorSchema).default([]),
  })
  .superRefine((card, context) => {
    if (new Set(card.faces.map((face) => face.id)).size !== card.faces.length) {
      context.addIssue({
        code: "custom",
        path: ["faces"],
        message: "Face identities must be distinct.",
      });
    }
  });

export type CardColor = z.infer<typeof CardColorSchema>;
export type CardRarity = z.infer<typeof CardRaritySchema>;
export type CardAnnotations = z.infer<typeof CardAnnotationsSchema>;
export type CardFaceDisplay = z.infer<typeof CardFaceDisplaySchema>;
export type CardDisplay = z.infer<typeof CardDisplaySchema>;
