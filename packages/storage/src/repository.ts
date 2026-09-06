import { canonicalJson, RulesState } from "@iwsdk-apps/contracts";
import { CommandRecord, ensure, MatchArchive, StorageError } from "./records";

export type SqlValue = string | number | null;
export interface SqlDatabase {
  exec(sql: string, bind?: SqlValue[]): void;
  rows(sql: string, bind?: SqlValue[]): Record<string, unknown>[];
  close(): void;
}
export interface Repository {
  load(matchId: string): MatchArchive | null;
  findRecord(matchId: string, commandId: string): CommandRecord | null;
  insert(archive: MatchArchive): void;
  append(expectedRevision: number, current: RulesState, record: CommandRecord): void;
  list(): { matchId: string; revision: number; releaseHash: string }[];
  close(): void;
}

const APPLICATION_ID = 0x434d4452;
const MIGRATION = `
CREATE TABLE commander_matches (
  match_id TEXT PRIMARY KEY, release_hash TEXT NOT NULL,
  prepared_artifact_json TEXT NOT NULL DEFAULT 'null', prepared_artifact_hash TEXT,
  initial_json TEXT NOT NULL, initial_hash TEXT NOT NULL,
  current_json TEXT NOT NULL, current_hash TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0)
);
CREATE TABLE commander_commands (
  match_id TEXT NOT NULL REFERENCES commander_matches(match_id), command_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0), record_json TEXT NOT NULL,
  PRIMARY KEY(match_id, command_id), UNIQUE(match_id, revision)
);
CREATE TABLE commander_boundaries (
  match_id TEXT NOT NULL REFERENCES commander_matches(match_id), revision INTEGER NOT NULL CHECK(revision >= 0),
  state_hash TEXT NOT NULL, event_json TEXT NOT NULL, PRIMARY KEY(match_id, revision)
);
PRAGMA application_id = ${APPLICATION_ID};
PRAGMA user_version = 2;
`;

function transaction<T>(db: SqlDatabase, body: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = body();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* Preserve the original database error. */
    }
    throw error;
  }
}
function json(row: Record<string, unknown>, column: string): unknown {
  const value = row[column];
  ensure(typeof value === "string", `Missing stored ${column}.`);
  try {
    return JSON.parse(value);
  } catch {
    throw new StorageError("IntegrityFailure", `Malformed stored ${column}.`);
  }
}

export function createRepository(db: SqlDatabase): Repository {
  const applicationId = db.rows("PRAGMA application_id")[0]?.application_id;
  const version = db.rows("PRAGMA user_version")[0]?.user_version;
  if (version === 0 && applicationId === 0) {
    if (db.rows("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").length)
      throw new StorageError(
        "ForeignDatabase",
        "This file contains an unrelated database; it was not modified.",
      );
    transaction(db, () => db.exec(MIGRATION));
  } else if (applicationId === APPLICATION_ID && version === 1) {
    transaction(db, () => {
      db.exec(
        "ALTER TABLE commander_matches ADD COLUMN prepared_artifact_json TEXT NOT NULL DEFAULT 'null'",
      );
      db.exec("ALTER TABLE commander_matches ADD COLUMN prepared_artifact_hash TEXT");
      db.exec("PRAGMA user_version = 2");
    });
  } else if (applicationId !== APPLICATION_ID || version !== 2) {
    throw new StorageError(
      "IncompatibleDatabase",
      "Database application or schema version is incompatible; existing data was preserved.",
    );
  }
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = FULL");

  function insertRecord(matchId: string, record: CommandRecord): void {
    db.exec(
      "INSERT INTO commander_commands(match_id, command_id, revision, record_json) VALUES (?, ?, ?, ?)",
      [matchId, record.command.commandId, record.receipt.revision, canonicalJson(record)],
    );
    db.exec(
      "INSERT INTO commander_boundaries(match_id, revision, state_hash, event_json) VALUES (?, ?, ?, ?)",
      [matchId, record.receipt.revision, record.receipt.stateHash, canonicalJson(record.events)],
    );
  }

  function load(matchId: string): MatchArchive | null {
    const row = db.rows("SELECT * FROM commander_matches WHERE match_id = ?", [matchId])[0];
    if (!row) return null;
    const commandRows = db.rows(
      "SELECT command_id, revision, record_json FROM commander_commands WHERE match_id = ? ORDER BY revision",
      [matchId],
    );
    const boundaries = db.rows(
      "SELECT revision, state_hash, event_json FROM commander_boundaries WHERE match_id = ? ORDER BY revision",
      [matchId],
    );
    const archive = MatchArchive.parse({
      schema: "commander-archive/2",
      preparedArtifact: json(row, "prepared_artifact_json"),
      releaseHash: row.release_hash,
      initial: json(row, "initial_json"),
      current: json(row, "current_json"),
      initialHash: row.initial_hash,
      currentHash: row.current_hash,
      records: commandRows.map((entry) => json(entry, "record_json")),
    });
    ensure(
      (archive.preparedArtifact?.hash ?? null) === row.prepared_artifact_hash &&
        (archive.initial.manifest.preparedArtifactHash ?? null) === row.prepared_artifact_hash &&
        (archive.current.manifest.preparedArtifactHash ?? null) === row.prepared_artifact_hash &&
        archive.initial.manifest.id === matchId &&
        archive.current.manifest.id === matchId &&
        archive.current.revision === row.revision &&
        archive.records.length === row.revision,
      "Stored match identity/revision does not match its history.",
    );
    ensure(
      boundaries.length === archive.records.length + 1 &&
        boundaries[0]?.revision === 0 &&
        boundaries[0].state_hash === archive.initialHash &&
        canonicalJson(json(boundaries[0], "event_json")) === canonicalJson(archive.initial.events),
      "Initial boundary or boundary count is damaged.",
    );
    archive.records.forEach((record, index) => {
      const boundary = boundaries[index + 1];
      const commandRow = commandRows[index];
      ensure(
        boundary &&
          commandRow &&
          commandRow.command_id === record.command.commandId &&
          commandRow.revision === index + 1 &&
          record.receipt.revision === index + 1 &&
          boundary.revision === index + 1 &&
          boundary.state_hash === record.receipt.stateHash &&
          canonicalJson(json(boundary, "event_json")) === canonicalJson(record.events),
        "A command, boundary or event batch is missing or inconsistent.",
      );
    });
    return archive;
  }

  return {
    load,
    findRecord(matchId, commandId) {
      const row = db.rows(
        "SELECT revision, record_json FROM commander_commands WHERE match_id = ? AND command_id = ?",
        [matchId, commandId],
      )[0];
      if (!row) return null;
      const record = CommandRecord.parse(json(row, "record_json"));
      const boundary = db.rows(
        "SELECT state_hash, event_json FROM commander_boundaries WHERE match_id = ? AND revision = ?",
        [matchId, record.receipt.revision],
      )[0];
      ensure(
        record.command.matchId === matchId &&
          record.command.commandId === commandId &&
          row.revision === record.receipt.revision &&
          record.receipt.matchId === matchId &&
          record.receipt.commandId === commandId &&
          record.receipt.actor === record.command.actor &&
          record.receipt.revision === record.command.revision + 1 &&
          boundary?.state_hash === record.receipt.stateHash &&
          canonicalJson(json(boundary, "event_json")) === canonicalJson(record.events),
        "Stored receipt identity or boundary is damaged.",
      );
      return record;
    },
    insert(input) {
      const archive = MatchArchive.parse(input);
      const id = archive.initial.manifest.id;
      transaction(db, () => {
        if (db.rows("SELECT match_id FROM commander_matches WHERE match_id = ?", [id]).length)
          throw new StorageError(
            "MatchExists",
            "A match with this identity already exists; it was not replaced.",
          );
        db.exec(
          "INSERT INTO commander_matches(match_id, release_hash, prepared_artifact_json, prepared_artifact_hash, initial_json, initial_hash, current_json, current_hash, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            id,
            archive.releaseHash,
            canonicalJson(archive.preparedArtifact),
            archive.preparedArtifact?.hash ?? null,
            canonicalJson(archive.initial),
            archive.initialHash,
            canonicalJson(archive.current),
            archive.currentHash,
            archive.current.revision,
          ],
        );
        db.exec(
          "INSERT INTO commander_boundaries(match_id, revision, state_hash, event_json) VALUES (?, 0, ?, ?)",
          [id, archive.initialHash, canonicalJson(archive.initial.events)],
        );
        for (const record of archive.records) insertRecord(id, record);
      });
    },
    append(expectedRevision, current, record) {
      RulesState.parse(current);
      CommandRecord.parse(record);
      const id = current.manifest.id;
      ensure(
        current.revision === expectedRevision + 1 &&
          record.command.revision === expectedRevision &&
          record.receipt.revision === current.revision &&
          record.receipt.matchId === id &&
          record.command.matchId === id,
        "Append revision/identity is inconsistent.",
      );
      transaction(db, () => {
        const row = db.rows(
          "SELECT revision, release_hash, prepared_artifact_hash FROM commander_matches WHERE match_id = ?",
          [id],
        )[0];
        if (
          !row ||
          row.revision !== expectedRevision ||
          row.release_hash !== current.manifest.releaseHash ||
          row.prepared_artifact_hash !== (current.manifest.preparedArtifactHash ?? null)
        )
          throw new StorageError(
            "ConcurrentWrite",
            "The stored match changed before this command committed; reopen the match.",
          );
        insertRecord(id, record);
        db.exec(
          "UPDATE commander_matches SET revision = ?, current_json = ?, current_hash = ? WHERE match_id = ?",
          [current.revision, canonicalJson(current), record.receipt.stateHash, id],
        );
      });
    },
    list() {
      return db
        .rows("SELECT match_id, revision, release_hash FROM commander_matches ORDER BY match_id")
        .map((row) => {
          ensure(
            typeof row.match_id === "string" &&
              typeof row.revision === "number" &&
              typeof row.release_hash === "string",
            "Malformed match index.",
          );
          return { matchId: row.match_id, revision: row.revision, releaseHash: row.release_hash };
        });
    },
    close() {
      db.close();
    },
  };
}
