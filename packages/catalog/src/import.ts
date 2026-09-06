import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createGunzip } from "node:zlib";
import { commanderSection } from "./acquire";
import { openCatalog } from "./database";
import { reviewedTabletopExclusion } from "./eligibility";
import { bundleHash, canonical, hash, hashFile } from "./hash";
import { parseCommanderBans, parseRules } from "./rules";
import {
  type Archive,
  type Card,
  CardSchema,
  type CatalogInventory,
  CatalogInventorySchema,
  IMPORTER_VERSION,
  RulingSchema,
  SourceManifestSchema,
} from "./schemas";

export interface ImportOptions {
  signal?: AbortSignal;
  batchSize?: number;
  onProgress?: (progress: {
    importId: string;
    kind: string;
    records: number;
    quarantined: number;
  }) => void;
}
export type { CatalogInventory } from "./schemas";

interface SourceLine {
  ordinal: number;
  raw: string;
  start: number;
  end: number;
}

async function* jsonLines(
  path: string,
  options: ImportOptions,
  stats: { bytes: number; digest: ReturnType<typeof createHash> },
): AsyncGenerator<SourceLine> {
  const input = createReadStream(path);
  const unzip = createGunzip();
  input.on("error", (error) => unzip.destroy(error));
  input.pipe(unzip);
  let pending = Buffer.alloc(0),
    offset = 0,
    ordinal = 0;
  const decode = new TextDecoder("utf-8", { fatal: true });
  try {
    for await (const chunk of unzip) {
      options.signal?.throwIfAborted();
      stats.bytes += chunk.length;
      if (stats.bytes > 8_000_000_000) throw new Error("Decompressed source exceeds 8GB limit");
      stats.digest.update(chunk);
      pending = Buffer.concat([pending, chunk]);
      let index = pending.indexOf(10);
      while (index >= 0) {
        const bytes = pending.subarray(0, index);
        yield {
          ordinal: ++ordinal,
          raw: decode.decode(bytes),
          start: offset,
          end: offset + bytes.length,
        };
        offset += index + 1;
        pending = pending.subarray(index + 1);
        index = pending.indexOf(10);
      }
      if (pending.length > 8_000_000) throw new Error("Source JSONL record exceeds 8MB limit");
    }
    if (pending.length)
      yield {
        ordinal: ++ordinal,
        raw: decode.decode(pending),
        start: offset,
        end: offset + pending.length,
      };
  } finally {
    input.destroy();
    unzip.destroy();
  }
}

function cardIdentity(card: Card): string {
  return card.oracle_id ?? `provider-object:${card.id}`;
}

function addName(db: Database, id: string, identity: string, name: unknown, kind: string): void {
  if (typeof name === "string" && name)
    db.query("INSERT OR IGNORE INTO card_names VALUES(?,?,?,?)").run(id, identity, name, kind);
}

function addCard(db: Database, id: string, archive: Archive, ordinal: number, card: Card): void {
  const identity = cardIdentity(card);
  const kind = /token|emblem/.test(card.layout)
    ? "support-object"
    : card.games.includes("paper")
      ? "paper-card"
      : "other-source-object";
  db.query("INSERT INTO card_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
    id,
    identity,
    card.oracle_id ?? null,
    card.id,
    card.name,
    card.layout,
    hash(canonical(card)),
    JSON.stringify(card),
    archive.sha256,
    ordinal,
    kind,
  );
  addName(db, id, identity, card.name, "root-name");
  addName(db, id, identity, card.flavor_name, "display-alias-unreviewed");
  for (const [faceIndex, face] of (card.card_faces ?? [card]).entries()) {
    db.query("INSERT INTO card_faces VALUES(?,?,?,?,?)").run(
      id,
      identity,
      faceIndex,
      face.name,
      JSON.stringify(face),
    );
    addName(db, id, identity, face.name, "face-name");
    addName(db, id, identity, face.flavor_name, "display-alias-unreviewed");
  }
  for (const [format, status] of Object.entries(card.legalities))
    db.query("INSERT INTO legalities VALUES(?,?,?,?)").run(id, identity, format, status);
  for (const part of card.all_parts ?? [])
    db.query("INSERT INTO card_relations VALUES(?,?,?,?,?)").run(
      id,
      identity,
      part.id,
      part.component,
      JSON.stringify(part),
    );
}

function normalizeRecord(db: Database, id: string, archive: Archive, line: SourceLine): void {
  const parsed: unknown = JSON.parse(line.raw);
  if (archive.kind === "rulings") {
    const ruling = RulingSchema.parse(parsed);
    db.query("INSERT INTO rulings VALUES(?,?,?,?,?,?,?,?)").run(
      id,
      archive.sha256,
      line.ordinal,
      ruling.oracle_id,
      ruling.source,
      ruling.published_at,
      ruling.comment,
      JSON.stringify(ruling),
    );
    return;
  }
  const card = CardSchema.parse(parsed);
  if (archive.kind === "oracle_cards") addCard(db, id, archive, line.ordinal, card);
  else if (archive.kind === "default_cards") {
    db.query("INSERT INTO printing_refs VALUES(?,?,?,?,?,?,?)").run(
      id,
      card.id,
      card.oracle_id ?? null,
      card.name,
      card.released_at,
      Number(card.games.includes("paper")),
      JSON.stringify({
        archive: archive.sha256,
        ordinal: line.ordinal,
        recordHash: hash(line.raw),
        set: card.set,
        collectorNumber: card.collector_number,
        lang: card.lang,
      }),
    );
  } else throw new Error(`Unexpected record archive ${archive.kind}`);
}

function commitBatch(db: Database, id: string, archive: Archive, batch: SourceLine[]): number {
  let quarantined = 0;
  db.transaction(() => {
    for (const line of batch) {
      let disposition = "normalized";
      db.exec("SAVEPOINT record");
      try {
        normalizeRecord(db, id, archive, line);
        db.exec("RELEASE record");
      } catch (error) {
        db.exec("ROLLBACK TO record; RELEASE record");
        disposition = "quarantined";
        quarantined++;
        db.query("INSERT INTO quarantine_records VALUES(?,?,?,?)").run(
          id,
          archive.sha256,
          line.ordinal,
          String(error),
        );
      }
      db.query("INSERT INTO source_records VALUES(?,?,?,?,?,?,?,?)").run(
        id,
        archive.sha256,
        line.ordinal,
        hash(line.raw),
        line.start,
        line.end,
        disposition,
        line.raw,
      );
    }
  })();
  return quarantined;
}

async function importArchive(
  db: Database,
  id: string,
  archive: Archive,
  path: string,
  options: ImportOptions,
): Promise<CatalogInventory["archives"][number]> {
  const stats = { bytes: 0, digest: createHash("sha256") };
  let batch: SourceLine[] = [],
    records = 0,
    quarantined = 0;
  for await (const line of jsonLines(path, options, stats)) {
    batch.push(line);
    records++;
    if (batch.length >= (options.batchSize ?? 250)) {
      quarantined += commitBatch(db, id, archive, batch);
      batch = [];
      options.onProgress?.({ importId: id, kind: archive.kind, records, quarantined });
      options.signal?.throwIfAborted();
    }
  }
  if (batch.length) quarantined += commitBatch(db, id, archive, batch);
  if (!records) throw new Error(`Empty ${archive.kind} archive`);
  options.onProgress?.({ importId: id, kind: archive.kind, records, quarantined });
  options.signal?.throwIfAborted();
  return {
    kind: archive.kind,
    sha256: archive.sha256,
    records,
    decompressedBytes: stats.bytes,
    decompressedSha256: stats.digest.digest("hex"),
  };
}

function importRules(db: Database, id: string, archive: Archive, text: string): void {
  const parsed = parseRules(text);
  if (parsed.effectiveDate !== archive.effectiveDate)
    throw new Error("Manifest and rules effective dates disagree");
  const ids = new Set(parsed.nodes.map((node) => node.id));
  db.transaction(() => {
    for (const node of parsed.nodes) {
      db.query("INSERT INTO rule_nodes VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
        id,
        archive.sha256,
        node.id,
        node.kind,
        node.title,
        node.text,
        node.sha256,
        node.startLine,
        node.endLine,
        node.byteStart,
        node.byteEnd,
        node.applicability,
      );
      for (const target of node.references)
        db.query("INSERT INTO rule_references VALUES(?,?,?,?,?)").run(
          id,
          archive.sha256,
          node.id,
          target,
          Number(ids.has(target)),
        );
    }
  })();
}

function importPolicy(db: Database, id: string, archive: Archive, text: string): void {
  const policy = parseCommanderBans(commanderSection(text));
  db.transaction(() => {
    for (const [kind, values] of Object.entries(policy))
      for (const value of values)
        db.query("INSERT INTO policy_items VALUES(?,?,?,?)").run(id, archive.sha256, kind, value);
  })();
}

function commanderCandidate(card: Card): boolean {
  const front = card.card_faces?.[0] ?? card;
  const types = front.type_line ?? "";
  const creature = /\bCreature\b/.test(types);
  const poweredCraft =
    /\b(?:Vehicle|Spacecraft)\b/.test(types) &&
    typeof front.power === "string" &&
    typeof front.toughness === "string";
  return (
    (/\bLegendary\b/.test(types) && (creature || poweredCraft)) ||
    /can be your commander/i.test(front.oracle_text ?? "")
  );
}

function mainDeckEvidence(
  card: Card,
  banned: boolean,
  released: boolean,
): { status: string; reason: string } {
  if (banned) return { status: "excluded", reason: "official-named-ban" };
  if (card.legalities.commander !== "legal")
    return { status: "excluded", reason: `provider-${card.legalities.commander ?? "missing"}` };
  if (!released) return { status: "unresolved", reason: "first-paper-release-not-confirmed" };
  return {
    status: "candidate",
    reason: "provider-legal-paper-release; category-policy-and-card-semantics-review-required",
  };
}

function determineEligibility(
  db: Database,
  id: string,
  policyHash: string,
  date: string,
  verifiedArchives: readonly Archive[],
): void {
  const policies = db
    .query<{ kind: string; value: string }, [string]>(
      "SELECT kind,value FROM policy_items WHERE import_id=?",
    )
    .all(id);
  const namedBans = new Set(
    policies.filter((row) => row.kind === "namedBans").map((row) => row.value),
  );
  const companionBans = new Set(
    policies.filter((row) => row.kind === "companionBans").map((row) => row.value),
  );
  const cards = db
    .query<
      {
        identity: string;
        name: string;
        payload_json: string;
        version_hash: string;
        source_archive: string;
        source_ordinal: number;
        first_paper: string | null;
      },
      [string]
    >(
      `SELECT c.identity,c.name,c.payload_json,c.version_hash,c.source_archive,c.source_ordinal,(SELECT min(p.released_at) FROM printing_refs p WHERE p.import_id=c.import_id AND p.oracle_id=c.oracle_id AND p.paper=1) AS first_paper FROM card_versions c WHERE c.import_id=?`,
    )
    .iterate(id);
  db.transaction(() => {
    for (const record of cards) {
      const card = CardSchema.parse(JSON.parse(record.payload_json));
      const providerLegal = card.legalities.commander === "legal";
      const banned = namedBans.has(card.name);
      if (providerLegal && banned)
        db.query("INSERT INTO source_conflicts VALUES(?,?,?,?)").run(
          id,
          "provider-policy-disagreement",
          record.identity,
          "Provider says Commander legal; named official ban says banned",
        );
      const released = record.first_paper !== null && record.first_paper <= date;
      const decision = reviewedTabletopExclusion(
        card,
        record.version_hash,
        record.first_paper,
        verifiedArchives,
      );
      if (decision) {
        db.query("INSERT INTO eligibility_decisions VALUES(?,?,?,?,?,?,?,?,?)").run(
          id,
          record.identity,
          decision.decision,
          hash(canonical(decision)),
          record.version_hash,
          record.source_archive,
          record.source_ordinal,
          decision.primarySourceHash,
          JSON.stringify(decision),
        );
        for (const role of decision.roles)
          db.query("INSERT INTO eligibility VALUES(?,?,?,?,?,?)").run(
            id,
            record.identity,
            role,
            decision.status,
            decision.reason,
            decision.primarySourceHash,
          );
        continue;
      }
      const { status, reason } = mainDeckEvidence(card, banned, released);
      db.query("INSERT INTO eligibility VALUES(?,?,?,?,?,?)").run(
        id,
        record.identity,
        "main-deck",
        status,
        reason,
        policyHash,
      );
      const commanderStatus =
        status === "excluded" ? "excluded" : commanderCandidate(card) ? status : "unresolved";
      db.query("INSERT INTO eligibility VALUES(?,?,?,?,?,?)").run(
        id,
        record.identity,
        "commander",
        commanderStatus,
        "candidate-only; CR903.3-characteristics-or-card-exception; review-and-deck-admission-required",
        policyHash,
      );
      db.query("INSERT INTO eligibility VALUES(?,?,?,?,?,?)").run(
        id,
        record.identity,
        "additional-commander",
        status === "excluded" ? "excluded" : "unresolved",
        "card-provided-construction-permissions-require-reviewed-definition",
        policyHash,
      );
      const companionStatus =
        companionBans.has(card.name) || status === "excluded"
          ? "excluded"
          : card.keywords.includes("Companion")
            ? status
            : "excluded";
      db.query("INSERT INTO eligibility VALUES(?,?,?,?,?,?)").run(
        id,
        record.identity,
        "companion",
        companionStatus,
        companionBans.has(card.name)
          ? "official-companion-only-ban"
          : "requires-companion-ability-and-deck-condition-review",
        policyHash,
      );
    }
  })();
}

function count(db: Database, query: string, id: string): number {
  return db.query<{ n: number }, [string]>(query).get(id)?.n ?? 0;
}

function semanticHash(db: Database, id: string): string {
  const digest = createHash("sha256");
  for (const row of db
    .query<
      { archive_hash: string; ordinal: number; record_hash: string; disposition: string },
      [string]
    >(
      "SELECT archive_hash,ordinal,record_hash,disposition FROM source_records WHERE import_id=? ORDER BY archive_hash,ordinal",
    )
    .iterate(id))
    digest.update(canonical(row));
  for (const row of db
    .query<{ document_hash: string; node_id: string; text_hash: string }, [string]>(
      "SELECT document_hash,node_id,text_hash FROM rule_nodes WHERE import_id=? ORDER BY document_hash,node_id",
    )
    .iterate(id))
    digest.update(canonical(row));
  // Old bundles have no reviewed decisions, so their historical digest stays unchanged.
  for (const row of db
    .query<{ identity: string; decision_id: string; decision_hash: string }, [string]>(
      "SELECT identity,decision_id,decision_hash FROM eligibility_decisions WHERE import_id=? ORDER BY identity,decision_id",
    )
    .iterate(id))
    digest.update(canonical(row));
  return digest.digest("hex");
}

function inventory(
  db: Database,
  id: string,
  sourceBundleHash: string,
  archives: CatalogInventory["archives"],
): CatalogInventory {
  const tableCount = (table: string) =>
    count(db, `SELECT count(*) n FROM ${table} WHERE import_id=?`, id);
  const quarantinedRecords = tableCount("quarantine_records");
  return {
    importId: id,
    bundleHash: sourceBundleHash,
    importerVersion: IMPORTER_VERSION,
    status: quarantinedRecords ? "quarantined" : "complete",
    semanticCertification: "unreviewed",
    semanticHash: semanticHash(db, id),
    sourceRecords: tableCount("source_records"),
    normalizedRecords: count(
      db,
      "SELECT count(*) n FROM source_records WHERE import_id=? AND disposition='normalized'",
      id,
    ),
    quarantinedRecords,
    cards: tableCount("card_versions"),
    faces: tableCount("card_faces"),
    names: tableCount("card_names"),
    printings: tableCount("printing_refs"),
    rulings: tableCount("rulings"),
    ruleNodes: tableCount("rule_nodes"),
    glossaryTerms: count(
      db,
      "SELECT count(*) n FROM rule_nodes WHERE import_id=? AND kind='glossary'",
      id,
    ),
    unresolvedRuleReferences: count(
      db,
      "SELECT count(*) n FROM rule_references WHERE import_id=? AND resolved=0",
      id,
    ),
    unresolvedRelations: count(
      db,
      "SELECT count(*) n FROM card_relations r WHERE r.import_id=? AND NOT EXISTS(SELECT 1 FROM printing_refs p WHERE p.import_id=r.import_id AND p.printing_id=r.target_printing_id)",
      id,
    ),
    unresolvedRulingIdentities: count(
      db,
      "SELECT count(DISTINCT r.oracle_id) n FROM rulings r WHERE r.import_id=? AND NOT EXISTS(SELECT 1 FROM card_versions c WHERE c.import_id=r.import_id AND c.oracle_id=r.oracle_id)",
      id,
    ),
    providerCommanderLegal: count(
      db,
      "SELECT count(*) n FROM legalities WHERE import_id=? AND format='commander' AND status='legal'",
      id,
    ),
    eligibility: db
      .query<{ role: string; status: string; count: number }, [string]>(
        "SELECT role,status,count(*) AS count FROM eligibility WHERE import_id=? GROUP BY role,status ORDER BY role,status",
      )
      .all(id),
    sourceConflicts: tableCount("source_conflicts"),
    archives,
  };
}

async function verifyArchivePath(directory: string, archive: Archive): Promise<string> {
  const path = await realpath(join(directory, archive.path));
  const rel = relative(await realpath(directory), path);
  if (rel === ".." || rel.startsWith(`..${sep}`))
    throw new Error("Archive path escapes source directory");
  const actual = await hashFile(path);
  if (actual.sha256 !== archive.sha256 || actual.bytes !== archive.bytes)
    throw new Error(`Archive integrity mismatch: ${archive.kind}`);
  return path;
}

/** Complete source import publishes an inventory, never executable or semantic certification. */
export async function importSources(
  manifestPathInput: string,
  dbPathInput: string,
  options: ImportOptions = {},
): Promise<CatalogInventory> {
  if (
    options.batchSize !== undefined &&
    (!Number.isSafeInteger(options.batchSize) ||
      options.batchSize < 1 ||
      options.batchSize > 10_000)
  )
    throw new Error("batchSize must be between 1 and 10000");
  const manifestPath = resolve(manifestPathInput),
    dbPath = resolve(dbPathInput);
  const manifest = SourceManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (bundleHash(manifest.archives) !== manifest.bundleHash)
    throw new Error("Source bundle hash mismatch");
  for (const kind of [
    "oracle_cards",
    "default_cards",
    "rulings",
    "comprehensive-rules",
    "banned-restricted",
  ])
    if (manifest.archives.filter((archive) => archive.kind === kind).length !== 1)
      throw new Error(`Exactly one required ${kind} archive must be present`);
  const paths = new Map<string, string>();
  for (const archive of manifest.archives) {
    options.signal?.throwIfAborted();
    paths.set(archive.sha256, await verifyArchivePath(dirname(manifestPath), archive));
  }
  await mkdir(dirname(dbPath), { recursive: true });
  const db = openCatalog(dbPath);
  const prior = db
    .query<{ inventory_json: string }, [string, string]>(
      "SELECT inventory_json FROM import_runs WHERE bundle_hash=? AND importer_version=? AND status='complete' ORDER BY started_at DESC LIMIT 1",
    )
    .get(manifest.bundleHash, IMPORTER_VERSION);
  if (prior) {
    db.close();
    return CatalogInventorySchema.parse(JSON.parse(prior.inventory_json));
  }
  const id = randomUUID();
  db.query(
    "INSERT INTO import_runs(id,bundle_hash,importer_version,status,started_at) VALUES(?,?,?,'staging',?)",
  ).run(id, manifest.bundleHash, IMPORTER_VERSION, new Date().toISOString());
  const archives: CatalogInventory["archives"] = [];
  try {
    for (const archive of manifest.archives) {
      options.signal?.throwIfAborted();
      const path = paths.get(archive.sha256);
      if (!path) throw new Error("Missing verified archive path");
      db.query("INSERT INTO source_archives VALUES(?,?,?,?)").run(
        id,
        archive.kind,
        archive.sha256,
        JSON.stringify(archive),
      );
      if (archive.format === "gzip-jsonl")
        archives.push(await importArchive(db, id, archive, path, options));
      else if (archive.kind === "comprehensive-rules")
        importRules(db, id, archive, await readFile(path, "utf8"));
      else if (archive.kind === "banned-restricted")
        importPolicy(db, id, archive, await readFile(path, "utf8"));
    }
    const policy = manifest.archives.find((archive) => archive.kind === "banned-restricted");
    if (!policy) throw new Error("Missing policy snapshot");
    determineEligibility(db, id, policy.sha256, manifest.createdAt.slice(0, 10), manifest.archives);
    options.signal?.throwIfAborted();
    const result = CatalogInventorySchema.parse(inventory(db, id, manifest.bundleHash, archives));
    if (result.sourceRecords !== result.normalizedRecords + result.quarantinedRecords)
      throw new Error("Source record accounting mismatch");
    if (
      db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()?.integrity_check !==
      "ok"
    )
      throw new Error("Catalog integrity check failed");
    db.transaction(() => {
      db.query("UPDATE import_runs SET status=?,finished_at=?,inventory_json=? WHERE id=?").run(
        result.status,
        new Date().toISOString(),
        JSON.stringify(result),
        id,
      );
      if (result.status === "complete")
        db.query(
          "INSERT INTO catalog_meta VALUES('active-import',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ).run(id);
    })();
    return result;
  } catch (error) {
    db.query("UPDATE import_runs SET status='interrupted',finished_at=?,error=? WHERE id=?").run(
      new Date().toISOString(),
      String(error),
      id,
    );
    throw error;
  } finally {
    db.close();
  }
}

export function readInventory(dbPath: string): CatalogInventory | null {
  if (!existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    const row = db
      .query<{ inventory_json: string }, []>(
        "SELECT inventory_json FROM import_runs WHERE id=(SELECT value FROM catalog_meta WHERE key='active-import')",
      )
      .get();
    return row ? CatalogInventorySchema.parse(JSON.parse(row.inventory_json)) : null;
  } finally {
    db.close();
  }
}
