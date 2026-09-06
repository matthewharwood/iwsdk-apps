import { validateSavedGame } from "@iwsdk-apps/game-core";
import type { AcceptedCommand, GameState, SavedGame } from "@iwsdk-apps/schemas";

export interface GameRepository {
  load(): Promise<SavedGame | null>;
  findAccepted(commandId: string): Promise<AcceptedCommand | null>;
  commit(state: GameState, accepted: AcceptedCommand): Promise<void>;
  replace(save: SavedGame): Promise<void>;
  close(): void;
}

export type SqlValue = string | number | null;
export interface SqlDatabase {
  exec(sql: string, bind?: SqlValue[]): void;
  rows(sql: string, bind?: SqlValue[]): Record<string, unknown>[];
  close(): void;
}

export class StorageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

// Schema 1 intentionally manages only the active example save. Catalogs belong
// in separate tables and must never be overwritten by a user-save operation.
const MIGRATION_1 = `
  CREATE TABLE checkpoints (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    game_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    state_json TEXT NOT NULL
  );
  CREATE TABLE accepted_commands (
    command_id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    revision INTEGER NOT NULL UNIQUE,
    record_json TEXT NOT NULL
  );
  CREATE TABLE domain_events (
    revision INTEGER PRIMARY KEY,
    event_json TEXT NOT NULL
  );
  PRAGMA user_version = 1;
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
      /* Preserve the original failure. */
    }
    throw error;
  }
}

function jsonColumn(row: Record<string, unknown>, key: string): unknown {
  const value = row[key];
  if (typeof value !== "string")
    throw new StorageError(
      "corrupt-save",
      "The local save is damaged. Existing data has been preserved.",
    );
  return JSON.parse(value);
}

export function createSqliteRepository(db: SqlDatabase): GameRepository {
  const version = db.rows("PRAGMA user_version")[0]?.user_version;
  if (version === 0) transaction(db, () => db.exec(MIGRATION_1));
  else if (version !== 1)
    throw new StorageError(
      "incompatible-schema",
      "This database uses an unsupported schema version. Existing data has been preserved.",
    );
  db.exec("PRAGMA synchronous = FULL");
  db.exec("PRAGMA foreign_keys = ON");

  function load(): SavedGame | null {
    const row = db.rows("SELECT game_id, revision, state_json FROM checkpoints WHERE id = 1")[0];
    if (!row) {
      if (
        db.rows("SELECT command_id FROM accepted_commands LIMIT 1").length ||
        db.rows("SELECT revision FROM domain_events LIMIT 1").length
      ) {
        throw new StorageError(
          "corrupt-save",
          "The local checkpoint is missing. Existing history has been preserved.",
        );
      }
      return null;
    }
    const save = validateSavedGame({
      state: jsonColumn(row, "state_json"),
      accepted: db
        .rows("SELECT record_json FROM accepted_commands ORDER BY revision")
        .map((record) => jsonColumn(record, "record_json")),
    });
    const events = db
      .rows("SELECT event_json FROM domain_events ORDER BY revision")
      .map((record) => jsonColumn(record, "event_json"));
    if (
      row.game_id !== save.state.gameId ||
      row.revision !== save.state.revision ||
      JSON.stringify(events) !== JSON.stringify(save.state.history)
    ) {
      throw new StorageError(
        "corrupt-save",
        "The stored history does not match the checkpoint. Existing data has been preserved.",
      );
    }
    return save;
  }

  function insertAccepted(accepted: AcceptedCommand): void {
    db.exec(
      "INSERT INTO accepted_commands(command_id, game_id, revision, record_json) VALUES (?, ?, ?, ?)",
      [
        accepted.command.commandId,
        accepted.command.gameId,
        accepted.receipt.revision,
        JSON.stringify(accepted),
      ],
    );
  }

  return {
    async load() {
      return load();
    },
    async findAccepted(commandId) {
      // Parsing the entire bounded history also checks receipt/event integrity.
      return load()?.accepted.find((entry) => entry.command.commandId === commandId) ?? null;
    },
    async commit(state, accepted) {
      transaction(db, () => {
        const current = load();
        if (
          !current ||
          current.state.gameId !== state.gameId ||
          current.state.revision !== accepted.command.expectedRevision
        ) {
          throw new StorageError(
            "concurrent-write",
            "The saved table changed before this move could be committed.",
          );
        }
        validateSavedGame({ state, accepted: [...current.accepted, accepted] });
        const event = state.history.at(-1);
        if (!event)
          throw new StorageError("missing-event", "The accepted move has no domain event.");
        insertAccepted(accepted);
        db.exec("INSERT INTO domain_events(revision, event_json) VALUES (?, ?)", [
          state.revision,
          JSON.stringify(event),
        ]);
        db.exec("UPDATE checkpoints SET revision = ?, state_json = ? WHERE id = 1", [
          state.revision,
          JSON.stringify(state),
        ]);
      });
    },
    async replace(input) {
      const save = validateSavedGame(input);
      transaction(db, () => {
        db.exec("DELETE FROM accepted_commands");
        db.exec("DELETE FROM domain_events");
        db.exec("DELETE FROM checkpoints");
        db.exec("INSERT INTO checkpoints(id, game_id, revision, state_json) VALUES (1, ?, ?, ?)", [
          save.state.gameId,
          save.state.revision,
          JSON.stringify(save.state),
        ]);
        for (const accepted of save.accepted) insertAccepted(accepted);
        for (const event of save.state.history)
          db.exec("INSERT INTO domain_events(revision, event_json) VALUES (?, ?)", [
            event.revision,
            JSON.stringify(event),
          ]);
      });
    },
    close() {
      db.close();
    },
  };
}

export async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function exportSave(input: SavedGame): Promise<string> {
  const payload = validateSavedGame(input);
  const checksum = await sha256(new TextEncoder().encode(JSON.stringify(payload)));
  return JSON.stringify(
    { format: "iwsdk-token-table-save", formatVersion: 1, checksum, payload },
    null,
    2,
  );
}

export async function importSave(json: string): Promise<SavedGame> {
  if (json.length > 100_000)
    throw new StorageError("oversized-save", "This save is larger than the supported limit.");
  // Lazy schema import here is unnecessary; this package never initializes SQLite on import.
  const { SaveEnvelopeSchema } = await import("@iwsdk-apps/schemas");
  const result = SaveEnvelopeSchema.safeParse(JSON.parse(json));
  if (!result.success)
    throw new StorageError(
      "incompatible-save",
      "Unsupported or malformed save format/rules version. Your current game is unchanged.",
    );
  const envelope = result.data;
  const expected = await sha256(new TextEncoder().encode(JSON.stringify(envelope.payload)));
  if (expected !== envelope.checksum)
    throw new StorageError(
      "checksum-mismatch",
      "Save integrity check failed. Your current game is unchanged.",
    );
  return validateSavedGame(envelope.payload);
}
