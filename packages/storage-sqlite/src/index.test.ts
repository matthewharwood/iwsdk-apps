import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createGame } from "@iwsdk-apps/game-core";
import { createSqliteRepository, exportSave, importSave, type SqlValue } from "./index";

function fixture() {
  const db = new Database(":memory:");
  return {
    db,
    repository: createSqliteRepository({
      exec(sql, bind) {
        if (bind) db.query(sql).run(...bind);
        else db.exec(sql);
      },
      rows(sql, bind) {
        return db.query<Record<string, unknown>, SqlValue[]>(sql).all(...(bind ?? []));
      },
      close() {
        db.close();
      },
    }),
  };
}

test("new database migrates and logical save export/import preserves the game", async () => {
  const { repository } = fixture();
  const save = { state: createGame("example", "2026-09-06T00:00:00.000Z"), accepted: [] };
  try {
    await repository.replace(save);
    expect(await repository.load()).toEqual(save);
    expect(await importSave(await exportSave(save))).toEqual(save);
  } finally {
    repository.close();
  }
});

test("tampered, incompatible, oversized, and semantically corrupt saves are rejected", async () => {
  const save = { state: createGame("example", "2026-09-06T00:00:00.000Z"), accepted: [] };
  const json = await exportSave(save);
  const modified = JSON.parse(json);
  modified.payload.state.remaining = 14;
  await expect(importSave(JSON.stringify(modified))).rejects.toThrow("integrity");
  const incompatible = JSON.parse(json);
  incompatible.payload.state.rulesVersion = 2;
  await expect(importSave(JSON.stringify(incompatible))).rejects.toThrow("Unsupported");
  await expect(importSave("x".repeat(100_001))).rejects.toThrow("larger");
  await expect(exportSave({ ...save, state: { ...save.state, remaining: 14 } })).rejects.toThrow(
    "checkpoint",
  );
});

test("a future database schema is rejected without removing data", () => {
  const { db, repository } = fixture();
  db.exec(
    "CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES ('keep me'); PRAGMA user_version = 2;",
  );
  try {
    expect(() =>
      createSqliteRepository({
        exec(sql) {
          db.exec(sql);
        },
        rows(sql) {
          return db.query<Record<string, unknown>, []>(sql).all();
        },
        close() {},
      }),
    ).toThrow("unsupported schema");
    expect(db.query("SELECT value FROM future_data").get()).toEqual({ value: "keep me" });
  } finally {
    repository.close();
  }
});
