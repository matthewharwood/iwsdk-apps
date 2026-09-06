import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GameCommand, GameState } from "@iwsdk-apps/schemas";
import { createSqliteRepository, type SqlValue } from "@iwsdk-apps/storage-sqlite";
import { LocalCoordinator } from "./coordinator";

function fixture(path = ":memory:") {
  const db = new Database(path);
  const repository = createSqliteRepository({
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
  });
  const published: GameState[] = [];
  let identity = 0;
  const coordinator = new LocalCoordinator(
    repository,
    (state) => published.push(state),
    () => `game-${identity++}`,
    () => "2026-09-06T00:00:00.000Z",
  );
  return { db, repository, coordinator, published };
}

function move(state: GameState | null, id = "move", take: 1 | 2 | 3 = 2): GameCommand {
  if (!state) throw new Error("Missing test state.");
  return {
    schemaVersion: 1,
    gameId: state.gameId,
    commandId: id,
    expectedRevision: state.revision,
    decisionId: state.decisionId,
    take,
  };
}

test("concurrent duplicates apply exactly once and immutable receipts survive retries", async () => {
  const { coordinator, published } = fixture();
  try {
    await coordinator.start();
    const command = move(coordinator.getSnapshot());
    const receipts = await Promise.all([
      coordinator.submit(command, "human"),
      coordinator.submit(command, "human"),
    ]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect(coordinator.getSnapshot()?.revision).toBe(1);
    expect(published).toHaveLength(2);
    await expect(coordinator.submit({ ...command, take: 3 }, "human")).rejects.toThrow(
      "different move",
    );
    await expect(coordinator.submit(command, "ai")).rejects.toThrow("different move");
    await expect(
      coordinator.submit({ ...command, commandId: "double-click" }, "human"),
    ).rejects.toThrow("table changed");
  } finally {
    await coordinator.close();
  }
});

test("a failure after receipt insertion rolls back receipt, event, checkpoint and publication", async () => {
  const { coordinator, repository, db, published } = fixture();
  try {
    await coordinator.start();
    const before = coordinator.getSnapshot();
    const command = move(before);
    db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON domain_events BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END;",
    );
    await expect(coordinator.submit(command, "human")).rejects.toThrow("simulated disk failure");
    expect(coordinator.getSnapshot()).toEqual(before);
    expect((await repository.load())?.state ?? null).toEqual(before);
    expect(await repository.findAccepted(command.commandId)).toBeNull();
    expect(published).toHaveLength(1);
    db.exec("DROP TRIGGER fail_event");
    await coordinator.submit(command, "human");
    expect(coordinator.getSnapshot()?.revision).toBe(1);
  } finally {
    await coordinator.close();
  }
});

test("close/reopen restores the decision and durable duplicate receipt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "iwsdk-save-test-"));
  const path = join(directory, "game.sqlite");
  const first = fixture(path);
  let second: ReturnType<typeof fixture> | null = null;
  try {
    await first.coordinator.start();
    const command = move(first.coordinator.getSnapshot());
    const receipt = await first.coordinator.submit(command, "human");
    const saved = first.coordinator.getSnapshot();
    await first.coordinator.close();
    second = fixture(path);
    await second.coordinator.start();
    expect(second.coordinator.getSnapshot()).toEqual(saved);
    expect(second.coordinator.getSnapshot()?.turn).toBe("ai");
    expect(await second.coordinator.submit(command, "human")).toEqual(receipt);
    expect(second.published).toHaveLength(1);
  } finally {
    await first.coordinator.close();
    await second?.coordinator.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("late AI results and incompatible import never overwrite a replacement game", async () => {
  const { coordinator } = fixture();
  try {
    await coordinator.start();
    await coordinator.submit(move(coordinator.getSnapshot()), "human");
    const oldAiMove = move(coordinator.getSnapshot(), "ai-old");
    const backup = await coordinator.exportSave();
    await coordinator.newGame();
    const replacement = coordinator.getSnapshot();
    await expect(coordinator.submit(oldAiMove, "ai")).rejects.toThrow("another game");
    const bad = JSON.parse(backup);
    bad.formatVersion = 999;
    await expect(coordinator.importSave(JSON.stringify(bad))).rejects.toThrow("Unsupported");
    expect(coordinator.getSnapshot()).toEqual(replacement);
    await coordinator.importSave(backup);
    expect(coordinator.getSnapshot()?.revision).toBe(1);
    expect(coordinator.getSnapshot()?.turn).toBe("ai");
  } finally {
    await coordinator.close();
  }
});
