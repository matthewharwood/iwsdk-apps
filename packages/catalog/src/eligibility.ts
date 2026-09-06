import { z } from "zod";
import { canonical, hash } from "./hash";
import { type Archive, type Card, HashSchema } from "./schemas";

/** Reviewed exclusion applies only to this exact online Oracle object and these archived primary sources. */
export const TABLETOP_EXCLUSION = {
  id: "tabletop-eligibility/name-sticker-goblin/1",
  identity: "acee1d16-1651-4e2c-8138-cc6456c4ee71",
  sourceVersion: "f84acb32fc9630ad8d168e43e70ae7ec1d6e807cc9bf68684d5a167c45b6a8f9",
  evidence: [
    {
      url: "https://www.mtgo.com/news/june-2024-vintage-cube-update",
      sha256: "221c0a663308a794e6093b2afc584a145ecad4c45efc9b58266c48b550160314",
      supports: "online-object-does-not-exist-in-this-form-on-tabletop",
    },
    {
      url: "https://www.mtgo.com/news/mtgo-blog-05142024",
      sha256: "cfcea3d046199ae6fbeac7f66e7114246fcb8eeebef22a13a682855028688927",
      supports: "commander-legality-statement-applies-to-magic-online",
    },
  ],
} as const;

export const EligibilityDecisionSchema = z.strictObject({
  schema: z.literal("reviewed-eligibility/1"),
  decision: z.literal(TABLETOP_EXCLUSION.id),
  identity: z.literal(TABLETOP_EXCLUSION.identity),
  sourceVersion: z.literal(TABLETOP_EXCLUSION.sourceVersion),
  profile: z.literal("tabletop-commander"),
  status: z.literal("excluded"),
  roles: z.array(z.enum(["main-deck", "commander", "additional-commander", "companion"])),
  reason: z.literal("reviewed-online-only-object-not-tabletop-card"),
  primarySourceHash: HashSchema,
  evidence: z.array(z.strictObject({ url: z.url(), sha256: HashSchema, supports: z.string() })),
  facts: z.strictObject({
    digital: z.literal(true),
    games: z.tuple([z.literal("mtgo")]),
    firstPaperPrinting: z.null(),
    providerCommanderLegal: z.literal(true),
  }),
  semanticCertification: z.literal("not-certified"),
});
export type EligibilityDecision = z.infer<typeof EligibilityDecisionSchema>;

/** Caller supplies archives only after byte/hash verification. Missing or changed evidence never broadens this decision. */
export function reviewedTabletopExclusion(
  card: Card,
  sourceVersion: string,
  firstPaperPrinting: string | null,
  verifiedArchives: readonly Archive[],
): EligibilityDecision | null {
  if (
    card.oracle_id !== TABLETOP_EXCLUSION.identity ||
    sourceVersion !== TABLETOP_EXCLUSION.sourceVersion ||
    hash(canonical(card)) !== TABLETOP_EXCLUSION.sourceVersion ||
    card.digital !== true ||
    card.games.length !== 1 ||
    card.games[0] !== "mtgo" ||
    firstPaperPrinting !== null ||
    card.legalities.commander !== "legal"
  )
    return null;
  if (
    !TABLETOP_EXCLUSION.evidence.every((evidence) =>
      verifiedArchives.some(
        (archive) =>
          archive.kind === "policy-evidence" &&
          archive.format === "html" &&
          archive.url === evidence.url &&
          archive.sha256 === evidence.sha256,
      ),
    )
  )
    return null;
  return EligibilityDecisionSchema.parse({
    schema: "reviewed-eligibility/1",
    decision: TABLETOP_EXCLUSION.id,
    identity: card.oracle_id,
    sourceVersion,
    profile: "tabletop-commander",
    status: "excluded",
    roles: ["main-deck", "commander", "additional-commander", "companion"],
    reason: "reviewed-online-only-object-not-tabletop-card",
    primarySourceHash: TABLETOP_EXCLUSION.evidence[0].sha256,
    evidence: TABLETOP_EXCLUSION.evidence,
    facts: {
      digital: true,
      games: ["mtgo"],
      firstPaperPrinting: null,
      providerCommanderLegal: true,
    },
    semanticCertification: "not-certified",
  });
}
