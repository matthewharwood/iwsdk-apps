import { sha256 } from "@iwsdk-apps/contracts";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { StorageError } from "./records";
import { createRepository, type Repository } from "./repository";

/** Call inside the dedicated game worker. There is no memory fallback. */
export async function openBrowserRepository(
  namespace: string,
  wasmUrl: string,
): Promise<Repository> {
  if (
    namespace.length > 200 ||
    !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(namespace)
  )
    throw new StorageError(
      "InvalidNamespace",
      "Use a stable application name or scoped package name for storage.",
    );
  if (
    typeof document !== "undefined" ||
    !globalThis.isSecureContext ||
    !navigator.storage?.getDirectory ||
    !navigator.locks
  )
    throw new StorageError(
      "StorageUnavailable",
      "Commander persistence needs a secure game worker with OPFS and Web Locks.",
    );
  const storageKey = await sha256(namespace);
  let unlock: () => void = () => {};
  const lifetime = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  let acquired: () => void = () => {};
  let rejectAcquisition: (error: unknown) => void = () => {};
  const acquisition = new Promise<void>((resolve, reject) => {
    acquired = resolve;
    rejectAcquisition = reject;
  });
  const lockRequest = navigator.locks.request(
    `commander:${namespace}:sqlite-owner`,
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (!lock) {
        rejectAcquisition(
          new StorageError(
            "AlreadyOpen",
            "This application's Commander database is already open in another worker or tab.",
          ),
        );
        return;
      }
      acquired();
      await lifetime;
    },
  );
  void lockRequest.catch(rejectAcquisition);
  await acquisition;
  let cleanup: () => void = () => {};
  try {
    // sqlite-wasm 3.53's declarations omit the supported Emscripten locateFile option.
    const initialize = sqlite3InitModule as (options: {
      locateFile: () => string;
    }) => ReturnType<typeof sqlite3InitModule>;
    const sqlite = await initialize({ locateFile: () => wasmUrl });
    const pool = await sqlite.installOpfsSAHPoolVfs({
      name: `commander-${storageKey}`,
      directory: `/iwsdk-commander/${storageKey}`,
      initialCapacity: 8,
    });
    cleanup = () => {
      pool.pauseVfs();
    };
    const db = new pool.OpfsSAHPoolDb("/matches.sqlite3");
    cleanup = () => {
      try {
        db.close();
      } finally {
        pool.pauseVfs();
      }
    };
    const repo = createRepository({
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
    let closed = false;
    return {
      ...repo,
      close() {
        if (closed) return;
        closed = true;
        try {
          cleanup();
        } finally {
          unlock();
        }
      },
    };
  } catch (error) {
    try {
      cleanup();
    } finally {
      unlock();
    }
    if (error instanceof StorageError) throw error;
    throw new StorageError(
      "StorageUnavailable",
      `Could not open durable Commander storage: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
