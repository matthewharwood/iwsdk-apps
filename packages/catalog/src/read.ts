import { Database } from "bun:sqlite";
import { z } from "zod";
import { EligibilityDecisionSchema } from "./eligibility";
import { CardSchema, HashSchema } from "./schemas";

export const CatalogCardSchema = z.object({
  identity: z.string(),
  versionHash: HashSchema,
  sourceArchiveHash: HashSchema,
  sourceOrdinal: z.number().int().positive(),
  bundleHash: HashSchema,
  oracle: CardSchema,
  eligibility: z.array(
    z.object({
      role: z.string(),
      status: z.enum(["candidate", "excluded", "unresolved"]),
      reason: z.string(),
      sourceHash: HashSchema,
    }),
  ),
});
export type CatalogCard = z.infer<typeof CatalogCardSchema>;

/** Returns observed candidate facts, not a certified card program or completed deck admission. */
export function readCandidateCards(
  dbPath: string,
  options: { names?: string[]; colorIdentity?: string[]; limit?: number } = {},
): CatalogCard[] {
  const limit = options.limit ?? 50_000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50_000)
    throw new Error("Candidate read limit must be between 1 and 50000");
  using db = new Database(dbPath, { readonly: true, strict: true });
  const active = db
    .query<{ id: string; bundle_hash: string }, []>(
      "SELECT id,bundle_hash FROM import_runs WHERE status='complete' AND id=(SELECT value FROM catalog_meta WHERE key='active-import')",
    )
    .get();
  if (!active) throw new Error("No complete active source import");
  const wantedNames = options.names ? new Set(options.names) : null;
  const wantedColors = options.colorIdentity ? new Set(options.colorIdentity) : null;
  const results: CatalogCard[] = [];
  const query = db.query<
    {
      identity: string;
      version_hash: string;
      source_archive: string;
      source_ordinal: number;
      payload_json: string;
    },
    [string]
  >(
    "SELECT c.identity,c.version_hash,c.source_archive,c.source_ordinal,c.payload_json FROM card_versions c JOIN eligibility e ON e.import_id=c.import_id AND e.identity=c.identity AND e.role='main-deck' AND e.status='candidate' WHERE c.import_id=? ORDER BY c.name,c.identity",
  );
  for (const row of query.iterate(active.id)) {
    const oracle = CardSchema.parse(JSON.parse(row.payload_json));
    if (wantedNames && !wantedNames.has(oracle.name)) continue;
    if (wantedColors && oracle.color_identity.some((color) => !wantedColors.has(color))) continue;
    const eligibility = db
      .query<
        { role: string; status: string; reason: string; sourceHash: string },
        [string, string]
      >(
        "SELECT role,status,reason,source_hash AS sourceHash FROM eligibility WHERE import_id=? AND identity=? ORDER BY role",
      )
      .all(active.id, row.identity);
    results.push(
      CatalogCardSchema.parse({
        identity: row.identity,
        versionHash: row.version_hash,
        sourceArchiveHash: row.source_archive,
        sourceOrdinal: row.source_ordinal,
        bundleHash: active.bundle_hash,
        oracle,
        eligibility,
      }),
    );
    if (results.length >= limit) break;
  }
  return results;
}

/** Reviewed policy decisions remain separate from executable card semantics. Old bundles return no decisions. */
export function readEligibilityDecisions(dbPath: string) {
  using db = new Database(dbPath, { readonly: true, strict: true });
  const active = db
    .query<{ value: string }, []>("SELECT value FROM catalog_meta WHERE key='active-import'")
    .get();
  if (!active) throw new Error("No complete active source import");
  if (
    !db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='eligibility_decisions'")
      .get()
  )
    return [];
  return db
    .query<
      {
        decision_hash: string;
        source_archive: string;
        source_ordinal: number;
        payload_json: string;
      },
      [string]
    >(
      "SELECT decision_hash,source_archive,source_ordinal,payload_json FROM eligibility_decisions WHERE import_id=? ORDER BY identity,decision_id",
    )
    .all(active.value)
    .map((row) => ({
      hash: row.decision_hash,
      sourceArchiveHash: row.source_archive,
      sourceOrdinal: row.source_ordinal,
      decision: EligibilityDecisionSchema.parse(JSON.parse(row.payload_json)),
    }));
}
