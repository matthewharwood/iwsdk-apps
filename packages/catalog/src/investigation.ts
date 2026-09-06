import type { Database } from "bun:sqlite";
import { z } from "zod";
import { openCatalog } from "./database";
import { canonical, hash } from "./hash";
import { readInventory } from "./import";
import { type Card, CardSchema, HashSchema } from "./schemas";

export const INVESTIGATION_VERSION = "commander-source-investigation/1";
export const RISK_GROUPS = [
  "setup-admission",
  "casting-payment",
  "targets-selections",
  "replacement-prevention",
  "triggers-history",
  "continuous-characteristics",
  "combat-damage",
  "identity-copies",
  "zones-chance",
  "commander-elimination",
  "hidden-simultaneous",
  "exceptional-workflows",
] as const;
export type RiskGroup = (typeof RISK_GROUPS)[number];

const Count = z.number().int().nonnegative();
export const LedgerInventorySchema = z.object({
  id: z.string(),
  importId: z.uuid(),
  bundleHash: HashSchema,
  analyzerVersion: z.string(),
  status: z.literal("incomplete"),
  fullCoverage: z.literal(false),
  sourceNodeDispositions: z.array(z.object({ applicability: z.string(), count: Count })),
  obligations: z.array(z.object({ kind: z.string(), status: z.string(), count: Count })),
  sourceObjects: Count,
  mainDeckCandidates: Count,
  mainDeckUnresolved: Count,
  unresolvedObligations: Count,
  executedAssertions: z.literal(0),
  reviewedObligations: z.literal(0),
});
export type LedgerInventory = z.infer<typeof LedgerInventorySchema>;

function tables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS obligation_ledgers(id TEXT PRIMARY KEY,import_id TEXT NOT NULL,analyzer_version TEXT NOT NULL,inventory_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS source_dispositions(ledger_id TEXT NOT NULL,source_hash TEXT NOT NULL,source_node TEXT NOT NULL,applicability TEXT NOT NULL,justification TEXT NOT NULL,PRIMARY KEY(ledger_id,source_hash,source_node));
    CREATE TABLE IF NOT EXISTS behavior_obligations(ledger_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,subject_id TEXT NOT NULL,title TEXT NOT NULL,applicability TEXT NOT NULL,status TEXT NOT NULL,processor_owner TEXT,decisions_json TEXT NOT NULL,implementation_json TEXT NOT NULL,evidence_json TEXT NOT NULL,PRIMARY KEY(ledger_id,id));
    CREATE TABLE IF NOT EXISTS obligation_sources(ledger_id TEXT NOT NULL,obligation_id TEXT NOT NULL,source_hash TEXT NOT NULL,source_address TEXT NOT NULL,provenance_json TEXT NOT NULL,PRIMARY KEY(ledger_id,obligation_id,source_hash,source_address));
    CREATE TABLE IF NOT EXISTS obligation_dependencies(ledger_id TEXT NOT NULL,obligation_id TEXT NOT NULL,dependency_id TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(ledger_id,obligation_id,dependency_id));
    CREATE TABLE IF NOT EXISTS card_obligations(ledger_id TEXT NOT NULL,identity TEXT NOT NULL,obligation_id TEXT NOT NULL,PRIMARY KEY(ledger_id,identity,obligation_id));
    CREATE TABLE IF NOT EXISTS risk_samples(id TEXT PRIMARY KEY,ledger_id TEXT NOT NULL,manifest_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sample_members(sample_id TEXT NOT NULL,identity TEXT NOT NULL,source_version TEXT NOT NULL,groups_json TEXT NOT NULL,PRIMARY KEY(sample_id,identity));
    CREATE TABLE IF NOT EXISTS authored_scenarios(id TEXT NOT NULL,ledger_id TEXT NOT NULL,manifest_json TEXT NOT NULL,PRIMARY KEY(id,ledger_id));
  `);
}

function obligation(
  db: Database,
  ledger: string,
  data: {
    kind: string;
    subject: string;
    title: string;
    sourceHash: string;
    address: string;
    provenance: unknown;
    cardIdentity?: string;
  },
): void {
  const id = `obligation:${hash(canonical({ kind: data.kind, sourceHash: data.sourceHash, address: data.address })).slice(0, 32)}`;
  db.query(
    "INSERT INTO behavior_obligations VALUES(?,?,?,?,?,'unresolved','unclassified',NULL,'[]','[]','[]')",
  ).run(ledger, id, data.kind, data.subject, data.title);
  db.query("INSERT INTO obligation_sources VALUES(?,?,?,?,?)").run(
    ledger,
    id,
    data.sourceHash,
    data.address,
    JSON.stringify(data.provenance),
  );
  if (data.cardIdentity)
    db.query("INSERT INTO card_obligations VALUES(?,?,?)").run(ledger, data.cardIdentity, id);
}

function ruleObligations(db: Database, ledger: string, importId: string): void {
  const rows = db.query<
    {
      document_hash: string;
      node_id: string;
      kind: string;
      title: string;
      text_hash: string;
      byte_start: number;
      byte_end: number;
      start_line: number;
      end_line: number;
    },
    [string]
  >(
    "SELECT document_hash,node_id,kind,title,text_hash,byte_start,byte_end,start_line,end_line FROM rule_nodes WHERE import_id=? ORDER BY byte_start",
  );
  for (const row of rows.iterate(importId)) {
    const referenceOnly = ["source", "chapter", "section"].includes(row.kind);
    db.query("INSERT INTO source_dispositions VALUES(?,?,?,?,?)").run(
      ledger,
      row.document_hash,
      row.node_id,
      referenceOnly ? "source-reference-only" : "unresolved",
      referenceOnly
        ? "Document preamble, structural heading, or credits; substantive child semantics accounted separately."
        : "Applicability requires review against tabletop profile and reachable card/support behaviors.",
    );
    if (!referenceOnly)
      obligation(db, ledger, {
        kind: row.kind === "glossary" ? "glossary-applicability" : "rule-semantics",
        subject: row.node_id,
        title: `Review ${row.node_id}: ${row.title}`,
        sourceHash: row.document_hash,
        address: row.node_id,
        provenance: {
          textHash: row.text_hash,
          byteStart: row.byte_start,
          byteEnd: row.byte_end,
          startLine: row.start_line,
          endLine: row.end_line,
        },
      });
  }
}

interface SourceCard {
  identity: string;
  version_hash: string;
  payload_json: string;
  source_archive: string;
  source_ordinal: number;
}
function cardObligations(db: Database, ledger: string, importId: string): void {
  for (const row of db
    .query<SourceCard, [string]>(
      "SELECT identity,version_hash,payload_json,source_archive,source_ordinal FROM card_versions WHERE import_id=? ORDER BY identity",
    )
    .iterate(importId)) {
    const card = CardSchema.parse(JSON.parse(row.payload_json));
    const provenance = {
      archiveHash: row.source_archive,
      ordinal: row.source_ordinal,
      oracleIdentity: row.identity,
      fieldOffsetEncoding: "utf16-code-units",
    };
    obligation(db, ledger, {
      kind: "card-characteristics-and-construction",
      subject: row.identity,
      title: `Review implicit characteristics, face/zone modes, name equivalence, construction permissions, and supporting dependencies: ${card.name}`,
      sourceHash: row.version_hash,
      address: "/",
      provenance,
      cardIdentity: row.identity,
    });
    const faces = card.card_faces ?? [card];
    for (const [face, value] of faces.entries()) {
      const text = value.oracle_text;
      if (typeof text !== "string") {
        obligation(db, ledger, {
          kind: "missing-behavior-source",
          subject: row.identity,
          title: `Investigate missing Oracle text: ${value.name}`,
          sourceHash: row.version_hash,
          address: `/faces/${face}/oracle_text`,
          provenance,
          cardIdentity: row.identity,
        });
        continue;
      }
      let offset = 0;
      for (const [line, clause] of text.split("\n").entries()) {
        if (clause)
          obligation(db, ledger, {
            kind: "card-text-review",
            subject: row.identity,
            title: `Decompose all behavior/cost/choice conditions in ${value.name}, text line ${line + 1}`,
            sourceHash: row.version_hash,
            address: `/faces/${face}/oracle_text/line/${line + 1}`,
            provenance: {
              ...provenance,
              face,
              textStart: offset,
              textEnd: offset + clause.length,
              textHash: hash(clause),
            },
            cardIdentity: row.identity,
          });
        offset += clause.length + 1;
      }
    }
  }
}

/** Source-accounted research queue. Text segmentation is not semantic decomposition or coverage. */
export function buildObligationLedger(dbPath: string): LedgerInventory {
  const inventory = readInventory(dbPath);
  if (!inventory) throw new Error("A complete source import is required");
  const id = `ledger:${hash(`${inventory.bundleHash}:${INVESTIGATION_VERSION}`).slice(0, 32)}`;
  const db = openCatalog(dbPath);
  try {
    tables(db);
    const prior = db
      .query<{ inventory_json: string }, [string]>(
        "SELECT inventory_json FROM obligation_ledgers WHERE id=?",
      )
      .get(id);
    if (prior) return LedgerInventorySchema.parse(JSON.parse(prior.inventory_json));
    return db.transaction(() => {
      ruleObligations(db, id, inventory.importId);
      cardObligations(db, id, inventory.importId);
      const unresolved =
        db
          .query<{ count: number }, [string]>(
            "SELECT count(*) AS count FROM behavior_obligations WHERE ledger_id=?",
          )
          .get(id)?.count ?? 0;
      const result: LedgerInventory = {
        id,
        importId: inventory.importId,
        bundleHash: inventory.bundleHash,
        analyzerVersion: INVESTIGATION_VERSION,
        status: "incomplete",
        fullCoverage: false,
        sourceNodeDispositions: db
          .query<{ applicability: string; count: number }, [string]>(
            "SELECT applicability,count(*) AS count FROM source_dispositions WHERE ledger_id=? GROUP BY applicability ORDER BY applicability",
          )
          .all(id),
        obligations: db
          .query<{ kind: string; status: string; count: number }, [string]>(
            "SELECT kind,status,count(*) AS count FROM behavior_obligations WHERE ledger_id=? GROUP BY kind,status ORDER BY kind,status",
          )
          .all(id),
        sourceObjects: inventory.cards,
        mainDeckCandidates:
          inventory.eligibility.find(
            (row) => row.role === "main-deck" && row.status === "candidate",
          )?.count ?? 0,
        mainDeckUnresolved:
          inventory.eligibility.find(
            (row) => row.role === "main-deck" && row.status === "unresolved",
          )?.count ?? 0,
        unresolvedObligations: unresolved,
        executedAssertions: 0,
        reviewedObligations: 0,
      };
      db.query("INSERT INTO obligation_ledgers VALUES(?,?,?,?)").run(
        id,
        inventory.importId,
        INVESTIGATION_VERSION,
        JSON.stringify(result),
      );
      return result;
    })();
  } finally {
    db.close();
  }
}

/** Investigation clues only: regex matching cannot approve card semantics or execution. */
export function riskClues(card: Card): RiskGroup[] {
  const text = [
    card.oracle_text ?? "",
    ...(card.card_faces ?? []).map((face) => face.oracle_text ?? ""),
  ].join("\n");
  const clues: [RiskGroup, boolean][] = [
    [
      "setup-admission",
      /companion|partner|background|can be your commander|deck can have/i.test(text),
    ],
    [
      "casting-payment",
      /cost|kicker|convoke|delve|alternative|without paying|additional/i.test(text),
    ],
    ["targets-selections", /target|choose|divide|distribute|any number/i.test(text)],
    ["replacement-prevention", /instead|prevent|would|as .* enters/i.test(text)],
    ["triggers-history", /when|whenever|at the beginning|dies/i.test(text)],
    ["continuous-characteristics", /get[s]? [+-]|have|has|becomes|are .+ in addition/i.test(text)],
    ["combat-damage", /attack|block|damage|trample|strike|menace|deathtouch/i.test(text)],
    [
      "identity-copies",
      card.layout !== "normal" || /copy|copies|face.down|transform|merge/i.test(text),
    ],
    ["zones-chance", /search|shuffle|library|graveyard|exile|roll|flip a coin/i.test(text)],
    ["commander-elimination", /commander|each opponent|owner|control another player/i.test(text)],
    ["hidden-simultaneous", /secret|vote|face.down|hand|reveal|simultaneous/i.test(text)],
    [
      "exceptional-workflows",
      /restart|subgame|sticker|attraction|extra turn|daybound|nightbound|dungeon|initiative/i.test(
        text,
      ),
    ],
  ];
  return clues.filter(([, matches]) => matches).map(([group]) => group);
}

export interface RiskSample {
  id: string;
  ledgerId: string;
  bundleHash: string;
  requestedSize: number;
  size: number;
  method: "deterministic-source-clue-stratification-not-semantic-review";
  reviewStatus: "not-reviewed";
  members: {
    identity: string;
    name: string;
    sourceVersion: string;
    groups: RiskGroup[];
    reasons: string[];
  }[];
  familyCounts: { group: RiskGroup; count: number }[];
}

export function selectRiskSample(dbPath: string, options: { size?: number } = {}): RiskSample {
  const size = options.size ?? 300;
  if (!Number.isSafeInteger(size) || size < 300 || size > 10_000)
    throw new Error("Risk sample must request between 300 and 10000 identities");
  const ledger = buildObligationLedger(dbPath);
  const db = openCatalog(dbPath);
  try {
    const pool: RiskSample["members"] = [];
    for (const row of db
      .query<SourceCard, [string]>(
        "SELECT c.identity,c.version_hash,c.payload_json,c.source_archive,c.source_ordinal FROM card_versions c JOIN eligibility e ON e.import_id=c.import_id AND e.identity=c.identity WHERE c.import_id=? AND e.role='main-deck' AND e.status='candidate' ORDER BY c.identity",
      )
      .iterate(ledger.importId)) {
      const card = CardSchema.parse(JSON.parse(row.payload_json));
      pool.push({
        identity: row.identity,
        name: card.name,
        sourceVersion: row.version_hash,
        groups: riskClues(card),
        reasons: card.oracle_text === "" ? ["implicit-behavior-and-low-text-control"] : [],
      });
    }
    if (pool.length < size)
      throw new Error(`Only ${pool.length} candidates available for ${size}-identity sample`);
    pool.sort((a, b) =>
      a.sourceVersion < b.sourceVersion ? -1 : a.sourceVersion > b.sourceVersion ? 1 : 0,
    );
    const selected = new Map<string, RiskSample["members"][number]>();
    for (const group of RISK_GROUPS) {
      const groupMembers = pool.filter((card) => card.groups.includes(group)).slice(0, 12);
      if (!groupMembers.length) throw new Error(`No source clue found for risk family ${group}`);
      for (const member of groupMembers)
        selected.set(member.identity, {
          ...member,
          reasons: [...member.reasons, `source-clue:${group}`],
        });
    }
    for (const member of pool.filter((card) => card.reasons.length).slice(0, 12))
      selected.set(member.identity, member);
    for (const member of pool) {
      if (selected.size >= size) break;
      if (!selected.has(member.identity))
        selected.set(member.identity, {
          ...member,
          reasons: [...member.reasons, "deterministic-diversity-fill"],
        });
    }
    const members = [...selected.values()].sort((a, b) =>
      a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0,
    );
    const id = `sample:${hash(canonical({ ledgerId: ledger.id, members })).slice(0, 32)}`;
    const result: RiskSample = {
      id,
      ledgerId: ledger.id,
      bundleHash: ledger.bundleHash,
      requestedSize: size,
      size: members.length,
      method: "deterministic-source-clue-stratification-not-semantic-review",
      reviewStatus: "not-reviewed",
      members,
      familyCounts: RISK_GROUPS.map((group) => ({
        group,
        count: members.filter((member) => member.groups.includes(group)).length,
      })),
    };
    db.transaction(() => {
      db.query("INSERT OR IGNORE INTO risk_samples VALUES(?,?,?)").run(
        id,
        ledger.id,
        JSON.stringify(result),
      );
      for (const member of members)
        db.query("INSERT OR IGNORE INTO sample_members VALUES(?,?,?,?)").run(
          id,
          member.identity,
          member.sourceVersion,
          JSON.stringify(member.groups),
        );
    })();
    return result;
  } finally {
    db.close();
  }
}
