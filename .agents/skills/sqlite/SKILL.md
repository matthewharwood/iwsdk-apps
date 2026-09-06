---
name: sqlite
description: Implement and debug browser-local SQLite WASM persistence using the opfs-sahpool VFS in the game worker. Use for SQL schemas, migrations, transactions, save/import/export, pool locking, and persistence failures; not server databases or IndexedDB wrappers.
---

# SQLite in the browser

The game worker owns both the rules engine and the database connection. UI and XR code exchange validated messages with it. Use the pinned `@sqlite.org/sqlite-wasm` package and inspect the existing worker/adapter before changing its initialization.

## Storage contract

`opfs-sahpool` runs inside a dedicated worker and uses origin-private files. It does not require the COOP/COEP headers used by SQLite's separate `opfs` VFS. Select it explicitly with `installOpfsSAHPoolVfs()`, then open through the returned `OpfsSAHPoolDb`. Do not accidentally substitute `oo1.OpfsDb`.

The pool holds exclusive handles. Two tabs using the same origin and pool directory cannot independently open it. Preserve the app's single-writer/blocked-tab behavior; do not silently create a second database or fall back to memory after a lock error. Namespace the pool directory as well as database filename per generated app. Reserve enough pool capacity for journals and temporary files, not only the main database.

Feature detection and initialization errors must surface durable, temporary, locked, and unavailable modes honestly. Keep `clearOnInit` disabled for saved data. A deliberate temporary session may use memory storage but must be visibly temporary. OPFS availability is not a promise against user deletion, quota eviction, or browser policy. See [SQLite persistence](https://www.sqlite.org/wasm/doc/trunk/persistence.md).

## Commit boundary

For each accepted action: parse input, compare expected revision, compute the candidate state with the pure reducer, validate it, then commit state and replay/event information atomically. Publish the new snapshot only after the commit succeeds. On failure, preserve the last committed state and return an actionable error. Serialization belongs in the worker request queue, including async startup and reset/import operations. Same-document remounts must await graceful VFS shutdown before claiming the app's Web Lock; weakening the separate-tab lock does not fix lifecycle ordering.

Use bound values for user-controlled SQL parameters. Keep table/column names in application-owned SQL. Execute synchronous SQL work inside the connection's transaction callback; do not make that callback async. Fetch assets, run inference and parse large imports before entering a transaction. Nested transactions require savepoints. Close statements/connections through their documented APIs; garbage collection is not database cleanup. See [OO API](https://www.sqlite.org/wasm/doc/trunk/api-oo1.md) and [transactions](https://www.sqlite.org/lang_transaction.html).

## Schema evolution and backups

Track schema version explicitly, such as `PRAGMA user_version`. Each migration advances from a known version in a transaction and validates transformed records. Refuse databases newer than the code understands. Migration failure should preserve evidence and the old database, never trigger an automatic reset. Distinguish malformed JSON, schema-invalid records, SQL errors, and unavailable storage. See [SQLite pragmas](https://www.sqlite.org/pragma.html#pragma_user_version).

Use a versioned, validated export format with bounded record sizes. Replay imports need legal-action and revision checks in addition to JSON validation. Finish validation before replacing committed state. Binary SQLite imports require pool-aware import/export helpers; do not manipulate a live SAH pool's underlying filenames as ordinary database files. An application reset affects only that app's data. Do not wipe the origin's storage.

## Bundling and verification

Create workers using Vite's analyzable `new Worker(new URL(..., import.meta.url), { type: 'module' })` pattern. Keep the WASM URL and initializer from the same pinned package version. Verify actual production requests return WASM bytes with an appropriate MIME type, not an HTML SPA fallback. Keep file paths base-aware.

Unit tests can validate reducer/migration transforms; native `bun:sqlite` cannot establish OPFS behavior. Use real browser tests for commit/reload, second-tab contention, disposal/reopen, import rejection, and failed-write behavior. Assert storage mode explicitly so a memory fallback cannot make a persistence test pass. Verify schema changes against an existing saved database, not only a fresh one.
