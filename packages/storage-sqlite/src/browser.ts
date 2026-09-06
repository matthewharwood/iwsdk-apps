import { StorageNamespaceSchema } from "@iwsdk-apps/schemas";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { createSqliteRepository, type GameRepository, StorageError, sha256 } from "./index";

export async function openBrowserRepository(
  namespace: string,
  wasmUrl: string,
): Promise<GameRepository> {
  if (!StorageNamespaceSchema.safeParse(namespace).success)
    throw new StorageError("invalid-namespace", "Invalid application storage namespace.");
  if (!globalThis.isSecureContext || !navigator.storage?.getDirectory || !navigator.locks) {
    throw new StorageError(
      "storage-unavailable",
      "Durable storage is unavailable. Open this app in a browser with OPFS and Web Locks over HTTPS or localhost.",
    );
  }
  const storageKey = await sha256(new TextEncoder().encode(namespace));
  let releaseLock: () => void = () => {};
  const lifetime = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  let acquired: () => void = () => {};
  let rejected: (error: unknown) => void = () => {};
  const acquisition = new Promise<void>((resolve, reject) => {
    acquired = resolve;
    rejected = reject;
  });
  // The lock covers VFS initialization, the entire DB lifetime, and VFS shutdown.
  const lockRequest = navigator.locks.request(
    `iwsdk-apps:${namespace}:sqlite-owner`,
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (!lock) {
        rejected(
          new StorageError(
            "already-open",
            "This table is already open in another tab. Close that tab, then retry here.",
          ),
        );
        return;
      }
      acquired();
      await lifetime;
    },
  );
  void lockRequest.catch(rejected);
  await acquisition;
  let cleanup: () => void = () => {};
  try {
    // Upstream's 3.53 types omit the Emscripten options argument accepted by
    // dist/index.mjs. Keep this narrow compatibility type at the adapter boundary.
    const initialize = sqlite3InitModule as (options: {
      locateFile: () => string;
    }) => ReturnType<typeof sqlite3InitModule>;
    const sqlite = await initialize({ locateFile: () => wasmUrl });
    const pool = await sqlite.installOpfsSAHPoolVfs({
      name: `iwsdk-${storageKey}`,
      directory: `/iwsdk-apps/${storageKey}`,
      initialCapacity: 6,
    });
    cleanup = () => {
      pool.pauseVfs();
    };
    const db = new pool.OpfsSAHPoolDb("/game.sqlite3");
    cleanup = () => {
      db.close();
      pool.pauseVfs();
    };
    let closed = false;
    const repository = createSqliteRepository({
      exec(sql, bind) {
        db.exec({ sql, ...(bind ? { bind } : {}) });
      },
      rows(sql, bind) {
        return db.selectObjects(sql, bind);
      },
      close() {
        db.close();
      },
    });
    return {
      ...repository,
      close() {
        if (closed) return;
        closed = true;
        try {
          repository.close();
          pool.pauseVfs();
        } finally {
          releaseLock();
        }
      },
    };
  } catch (error) {
    try {
      cleanup();
    } finally {
      releaseLock();
    }
    if (error instanceof StorageError) throw error;
    throw new StorageError(
      "storage-unavailable",
      `Could not open the local SQLite save. No temporary save was substituted. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
