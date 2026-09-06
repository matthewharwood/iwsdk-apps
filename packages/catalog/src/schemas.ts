import { z } from "zod";

export const IMPORTER_VERSION = "commander-catalog/1";
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const SourceKindSchema = z.enum([
  "bulk-metadata",
  "oracle_cards",
  "default_cards",
  "rulings",
  "rules-landing",
  "comprehensive-rules",
  "commander-policy",
  "banned-restricted",
  "policy-evidence",
]);
export const ArchiveSchema = z.object({
  kind: SourceKindSchema,
  url: z.url(),
  resolvedUrl: z.url(),
  retrievedAt: z.iso.datetime(),
  updatedAt: z.string().nullable(),
  effectiveDate: DateSchema.nullable(),
  contentType: z.string().nullable(),
  httpContentEncoding: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
  expectedBytes: z.number().int().nonnegative().nullable(),
  bytes: z.number().int().nonnegative(),
  sha256: HashSchema,
  hashLayer: z.literal("http-entity-identity-encoding"),
  format: z.enum(["json", "gzip-jsonl", "text", "html"]),
  path: z.string().regex(/^archives\/[a-f0-9]{64}\.(?:json|jsonl\.gz|txt|html)$/),
});
export const SourceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  importerVersion: z.literal(IMPORTER_VERSION),
  createdAt: z.iso.datetime(),
  bundleHash: HashSchema,
  archives: z.array(ArchiveSchema).min(1),
  certification: z.literal("source-acquisition-only"),
});
export const BulkMetadataSchema = z.object({
  object: z.literal("list"),
  has_more: z.literal(false),
  data: z.array(
    z.looseObject({
      object: z.literal("bulk_data"),
      id: z.uuid(),
      type: z.string(),
      updated_at: z.string(),
      jsonl_download_uri: z.url(),
      compressed_size: z.number().int().positive(),
    }),
  ),
});
export const CardFaceSchema = z.looseObject({
  name: z.string().min(1),
  oracle_id: z.uuid().optional(),
  mana_cost: z.string().optional(),
  type_line: z.string().optional(),
  oracle_text: z.string().optional(),
  colors: z.array(z.string()).optional(),
  color_indicator: z.array(z.string()).optional(),
  power: z.string().optional(),
  toughness: z.string().optional(),
  loyalty: z.string().optional(),
  defense: z.string().optional(),
});
export const CardSchema = z.looseObject({
  object: z.literal("card"),
  id: z.uuid(),
  oracle_id: z.uuid().optional(),
  name: z.string().min(1),
  layout: z.string().min(1),
  lang: z.string(),
  released_at: DateSchema,
  set: z.string(),
  collector_number: z.string(),
  legalities: z.record(z.string(), z.string()),
  games: z.array(z.string()),
  mana_cost: z.string().optional(),
  cmc: z.number().optional(),
  type_line: z.string().optional(),
  oracle_text: z.string().optional(),
  colors: z.array(z.string()).optional(),
  color_identity: z.array(z.string()),
  keywords: z.array(z.string()),
  card_faces: z.array(CardFaceSchema).optional(),
  all_parts: z
    .array(
      z.looseObject({
        id: z.uuid(),
        component: z.string(),
        name: z.string(),
        type_line: z.string(),
        uri: z.url(),
      }),
    )
    .optional(),
});
export const RulingSchema = z.looseObject({
  object: z.literal("ruling"),
  oracle_id: z.uuid(),
  source: z.string().min(1),
  published_at: DateSchema,
  comment: z.string(),
});
export const CatalogInventorySchema = z.object({
  importId: z.uuid(),
  bundleHash: HashSchema,
  importerVersion: z.string(),
  status: z.enum(["complete", "quarantined"]),
  semanticCertification: z.literal("unreviewed"),
  semanticHash: HashSchema,
  sourceRecords: z.number().int().nonnegative(),
  normalizedRecords: z.number().int().nonnegative(),
  quarantinedRecords: z.number().int().nonnegative(),
  cards: z.number().int().nonnegative(),
  faces: z.number().int().nonnegative(),
  names: z.number().int().nonnegative(),
  printings: z.number().int().nonnegative(),
  rulings: z.number().int().nonnegative(),
  ruleNodes: z.number().int().nonnegative(),
  glossaryTerms: z.number().int().nonnegative(),
  unresolvedRuleReferences: z.number().int().nonnegative(),
  unresolvedRelations: z.number().int().nonnegative(),
  unresolvedRulingIdentities: z.number().int().nonnegative(),
  providerCommanderLegal: z.number().int().nonnegative(),
  sourceConflicts: z.number().int().nonnegative(),
  eligibility: z.array(
    z.object({ role: z.string(), status: z.string(), count: z.number().int().nonnegative() }),
  ),
  archives: z.array(
    z.object({
      kind: z.string(),
      sha256: HashSchema,
      records: z.number().int().nonnegative(),
      decompressedBytes: z.number().int().nonnegative(),
      decompressedSha256: HashSchema,
    }),
  ),
});
export type CatalogInventory = z.infer<typeof CatalogInventorySchema>;
export type Archive = z.infer<typeof ArchiveSchema>;
export type SourceManifest = z.infer<typeof SourceManifestSchema>;
export type Card = z.infer<typeof CardSchema>;
